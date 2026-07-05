"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import {
  adminActionFailure,
  adminActionSuccess,
  getErrorMessage,
} from "@/lib/admin-action-result";
import {
  cancelServerOfferImportTask,
  createServerOfferImportTask,
  getServerOfferImportTaskStatus,
  retryServerOfferImportTask,
} from "@/server/offers/import-task-runner";
import {
  bulkUpdateServerOffers,
  offerReviewStatuses,
  offerStatuses,
  updateServerOffer,
} from "@/server/offers/server-offers";

const nullableString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().nullable(),
);

const nullablePrice = nullableString.refine(
  (value) => value === null || Number.isFinite(Number(value)),
  "价格必须是数字",
);

const nullablePurchaseUrl = nullableString.refine(
  (value) =>
    value === null ||
    isHttpHref(value) ||
    (isInternalHref(value) && /^\/go\/[a-z0-9-]+$/i.test(value)),
  "购买链接必须是 http/https URL 或 /go/ 短链",
);

const nullableInternalOrHttpUrl = nullableString.refine(
  (value) => value === null || isInternalHref(value) || isHttpHref(value),
  "链接必须是站内路径或 http/https URL",
);

const updateOfferSchema = z.object({
  title: z.string().trim().min(1, "请输入套餐标题"),
  providerName: nullableString,
  priceAmount: nullablePrice,
  currency: nullableString,
  billingCycle: nullableString,
  region: nullableString,
  lineType: nullableString,
  status: z.enum(offerStatuses),
  purchaseUrl: nullablePurchaseUrl,
  promoCode: nullableString,
  articleUrl: nullableInternalOrHttpUrl,
  reviewUrl: nullableInternalOrHttpUrl,
  visible: z.coerce.boolean(),
  featured: z.coerce.boolean(),
  reviewStatus: z.enum(offerReviewStatuses),
});

function revalidateOfferPages() {
  revalidatePath("/servers");
  revalidatePath("/servers/manage");
  revalidatePath("/servers");
  revalidatePath("/servers/hong-kong");
  revalidatePath("/servers/united-states");
  revalidatePath("/servers/cheap-vps");
}

export async function importServerOffersFromPostAction(postId: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(postId) || postId <= 0) {
      return adminActionFailure(new Error("文章 ID 无效"), {
        title: "从单篇文章导入服务器套餐失败",
        suggestion: "请刷新文章列表后重试。",
      });
    }

    const task = await createServerOfferImportTask({
      mode: "single",
      postId,
    });

    return adminActionSuccess(task, "套餐提取任务已加入后台队列");
  } catch (error) {
    console.error("从单篇文章导入服务器套餐失败:", error);
    return adminActionFailure(error, {
      title: "从单篇文章导入服务器套餐失败",
      suggestion: "请确认文章存在且正文包含套餐表格或购买链接。",
    });
  }
}

export async function importServerOffersFromSelectedPostsAction(
  postIds: number[],
) {
  try {
    await requireAdminSession();
    const validIds = [
      ...new Set(postIds.filter((id) => Number.isInteger(id) && id > 0)),
    ].slice(0, 50);

    if (validIds.length === 0) {
      return adminActionFailure(new Error("请先选择要提取套餐的文章"), {
        title: "批量提取套餐失败",
        suggestion: "在文章列表勾选一篇或多篇文章后再提交。",
      });
    }

    const tasks = [];
    const errors: Array<{ postId: number; reason: string }> = [];

    for (const postId of validIds) {
      try {
        tasks.push(
          await createServerOfferImportTask({
            mode: "single",
            postId,
          }),
        );
      } catch (error) {
        errors.push({ postId, reason: getErrorMessage(error) });
      }
    }

    return adminActionSuccess(
      {
        requested: validIds.length,
        queued: tasks.length,
        failed: errors.length,
        taskIds: tasks.map((task) => task.taskId),
        errors,
      },
      "选中文章套餐提取任务已加入后台队列",
    );
  } catch (error) {
    console.error("批量从文章导入服务器套餐失败:", error);
    return adminActionFailure(error, {
      title: "批量提取套餐失败",
      suggestion: "请稍后重试；如果持续失败，查看任务状态里的失败原因。",
    });
  }
}

export async function importServerOffersFromPostsAction() {
  try {
    await requireAdminSession();
    const task = await createServerOfferImportTask({ mode: "bulk" });

    return adminActionSuccess(task, "历史文章套餐提取任务已加入后台队列");
  } catch (error) {
    console.error("导入服务器套餐失败:", error);
    return adminActionFailure(error, {
      title: "导入服务器套餐失败",
      suggestion: "请稍后重试；如果持续失败，查看任务状态里的失败原因。",
    });
  }
}

export async function getServerOfferImportTaskStatusAction(taskId: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return adminActionFailure(new Error("任务 ID 无效"), {
        title: "读取套餐提取任务失败",
        suggestion: "请从最新任务提示中重新打开状态。",
      });
    }

    const task = await getServerOfferImportTaskStatus(taskId);
    return adminActionSuccess(task);
  } catch (error) {
    return adminActionFailure(error, {
      title: "读取套餐提取任务失败",
      suggestion: "请刷新页面后重试。",
    });
  }
}

export async function retryServerOfferImportTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return adminActionFailure(new Error("任务 ID 无效"), {
        title: "恢复套餐提取任务失败",
        suggestion: "请从任务中心重新打开任务详情。",
      });
    }

    const task = await retryServerOfferImportTask(taskId);
    return adminActionSuccess(task, "套餐提取任务已重新排队");
  } catch (error) {
    return adminActionFailure(error, {
      title: "恢复套餐提取任务失败",
      suggestion: "只有失败或已取消的套餐提取任务可以恢复。",
    });
  }
}

export async function cancelServerOfferImportTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return adminActionFailure(new Error("任务 ID 无效"), {
        title: "取消套餐提取任务失败",
        suggestion: "请从任务中心重新打开任务详情。",
      });
    }

    const task = await cancelServerOfferImportTask(taskId);
    return adminActionSuccess(task, "套餐提取任务已取消");
  } catch (error) {
    return adminActionFailure(error, {
      title: "取消套餐提取任务失败",
      suggestion: "只能取消尚未开始执行的排队任务。",
    });
  }
}

export async function updateServerOfferAction(id: number, formData: FormData) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(id) || id <= 0) {
      return { error: "套餐 ID 无效" };
    }

    const input = updateOfferSchema.parse({
      title: formData.get("title"),
      providerName: formData.get("providerName"),
      priceAmount: formData.get("priceAmount"),
      currency: formData.get("currency"),
      billingCycle: formData.get("billingCycle"),
      region: formData.get("region"),
      lineType: formData.get("lineType"),
      status: formData.get("status"),
      purchaseUrl: formData.get("purchaseUrl"),
      promoCode: formData.get("promoCode"),
      articleUrl: formData.get("articleUrl"),
      reviewUrl: formData.get("reviewUrl"),
      visible: formData.get("visible") === "true",
      featured: formData.get("featured") === "true",
      reviewStatus: formData.get("reviewStatus"),
    });
    const updated = await updateServerOffer(id, input);

    if (!updated) {
      return { error: "套餐不存在" };
    }

    revalidateOfferPages();
    return { data: updated };
  } catch (error) {
    console.error("更新服务器套餐失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function bulkUpdateServerOffersAction(input: {
  ids: number[];
  status?: string;
  visible?: boolean;
  featured?: boolean;
  reviewStatus?: string;
}) {
  try {
    await requireAdminSession();
    const ids = input.ids.filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) {
      return { error: "请先选择要更新的套餐" };
    }

    const status =
      input.status &&
      offerStatuses.includes(input.status as (typeof offerStatuses)[number])
        ? (input.status as (typeof offerStatuses)[number])
        : undefined;
    const result = await bulkUpdateServerOffers({
      ids,
      status,
      visible: input.visible,
      featured: input.featured,
      reviewStatus:
        input.reviewStatus &&
        offerReviewStatuses.includes(
          input.reviewStatus as (typeof offerReviewStatuses)[number],
        )
          ? input.reviewStatus
          : undefined,
    });

    revalidateOfferPages();
    return { data: result };
  } catch (error) {
    console.error("批量更新服务器套餐失败:", error);
    return { error: getErrorMessage(error) };
  }
}
