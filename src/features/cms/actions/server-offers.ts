"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import {
  bulkUpdateServerOffers,
  importServerOffersFromPost,
  importServerOffersFromPosts,
  offerReviewStatuses,
  offerStatuses,
  updateServerOffer,
} from "@/server/offers/server-offers";

const nullableString = z
  .preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().nullable(),
  );

const updateOfferSchema = z.object({
  title: z.string().trim().min(1, "请输入套餐标题"),
  providerName: nullableString,
  priceAmount: nullableString,
  currency: nullableString,
  billingCycle: nullableString,
  region: nullableString,
  lineType: nullableString,
  status: z.enum(offerStatuses),
  purchaseUrl: nullableString,
  promoCode: nullableString,
  articleUrl: nullableString,
  reviewUrl: nullableString,
  visible: z.coerce.boolean(),
  featured: z.coerce.boolean(),
  reviewStatus: z.enum(offerReviewStatuses),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

function revalidateOfferPages() {
  revalidatePath("/end/servers");
  revalidatePath("/end/servers/manage");
  revalidatePath("/servers");
  revalidatePath("/servers/hong-kong");
  revalidatePath("/servers/united-states");
  revalidatePath("/servers/cheap-vps");
}

export async function importServerOffersFromPostAction(postId: number) {
  try {
    await requireAdminSession();
    if (!Number.isInteger(postId) || postId <= 0) {
      return {
        success: false,
        error: "文章参数无效",
        message: "请选择一篇有效文章后再提取套餐。",
      };
    }

    const result = await importServerOffersFromPost(postId);
    revalidateOfferPages();

    return { success: true, data: result };
  } catch (error) {
    console.error("从单篇文章导入服务器套餐失败:", error);
    return {
      success: false,
      error: "从单篇文章导入服务器套餐失败",
      message: getErrorMessage(error),
    };
  }
}

export async function importServerOffersFromPostsAction() {
  try {
    await requireAdminSession();
    const result = await importServerOffersFromPosts();
    revalidateOfferPages();

    return { success: true, data: result };
  } catch (error) {
    console.error("导入服务器套餐失败:", error);
    return {
      success: false,
      error: "导入服务器套餐失败",
      message: getErrorMessage(error),
    };
  }
}

export async function updateServerOfferAction(id: number, formData: FormData) {
  try {
    await requireAdminSession();
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
    const status =
      input.status && offerStatuses.includes(input.status as (typeof offerStatuses)[number])
        ? (input.status as (typeof offerStatuses)[number])
        : undefined;
    const result = await bulkUpdateServerOffers({
      ids: input.ids.filter((id) => Number.isInteger(id) && id > 0),
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
