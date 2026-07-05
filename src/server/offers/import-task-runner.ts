import { revalidatePath } from "next/cache";
import { and, eq, lt } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import { posts, serverOfferImportTasks } from "@fwqgo/db/schema";
import { getErrorMessage } from "@/lib/admin-action-result";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import {
  importServerOffersFromPost,
  importServerOffersFromPosts,
} from "@/server/offers/server-offers";

type ServerOfferImportTask = typeof serverOfferImportTasks.$inferSelect;
type ServerOfferImportMode = "single" | "bulk";
type ServerOfferImportStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

function revalidateOfferPages() {
  revalidatePath("/servers");
  revalidatePath("/servers/manage");
  revalidatePath("/servers/hong-kong");
  revalidatePath("/servers/united-states");
  revalidatePath("/servers/cheap-vps");
  revalidatePath("/ai-tasks");
}

function revalidateOfferTaskPages(taskId: number) {
  revalidateOfferPages();
  revalidatePath(`/ai-tasks/offers/${taskId}`);
}

function parseResult(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as {
      scannedPosts: number;
      extracted: number;
      inserted: number;
      updated: number;
      skipped: number;
    };
  } catch {
    return null;
  }
}

export function serializeServerOfferImportTask(task: ServerOfferImportTask) {
  const status = task.status as ServerOfferImportStatus;

  return {
    taskId: task.id,
    mode: task.mode as ServerOfferImportMode,
    postId: task.postId,
    status,
    progress: task.progress,
    message: task.message,
    result: parseResult(task.result),
    success: status === "succeeded",
    done:
      status === "succeeded" || status === "failed" || status === "cancelled",
    errorTitle: task.errorTitle ?? undefined,
    errorDetail: task.errorDetail ?? undefined,
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.finishedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

async function resetStaleRunningTasks() {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);

  await db
    .update(serverOfferImportTasks)
    .set({
      status: "pending",
      progress: 0,
      message: "上次执行超时，已重新排队",
      errorTitle: null,
      errorDetail: null,
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(serverOfferImportTasks.status, "running"),
        lt(serverOfferImportTasks.updatedAt, staleBefore),
      ),
    );
}

async function claimNextTask() {
  const [task] = await db
    .select()
    .from(serverOfferImportTasks)
    .where(eq(serverOfferImportTasks.status, "pending"))
    .orderBy(serverOfferImportTasks.id)
    .limit(1);

  if (!task) {
    return null;
  }

  const [claimedTask] = await db
    .update(serverOfferImportTasks)
    .set({
      status: "running",
      progress: 10,
      message: "正在读取文章并提取套餐",
      errorTitle: null,
      errorDetail: null,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(serverOfferImportTasks.id, task.id))
    .returning();

  return claimedTask ?? null;
}

async function processTask(task: ServerOfferImportTask) {
  if (task.mode === "single") {
    if (!task.postId) {
      throw new Error("单篇提取任务缺少文章 ID");
    }

    await db
      .update(serverOfferImportTasks)
      .set({
        progress: 35,
        message: "正在解析单篇文章中的表格和购买链接",
        updatedAt: new Date(),
      })
      .where(eq(serverOfferImportTasks.id, task.id));

    const result = await importServerOffersFromPost(task.postId, {
      revalidate: false,
    });

    await db
      .update(serverOfferImportTasks)
      .set({
        status: "succeeded",
        progress: 100,
        message: "单篇文章套餐提取完成",
        result: JSON.stringify(result),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serverOfferImportTasks.id, task.id));
    return;
  }

  await db
    .update(serverOfferImportTasks)
    .set({
      progress: 25,
      message: "正在扫描历史文章并提取套餐",
      updatedAt: new Date(),
    })
    .where(eq(serverOfferImportTasks.id, task.id));

  const result = await importServerOffersFromPosts({ revalidate: false });

  await db
    .update(serverOfferImportTasks)
    .set({
      status: "succeeded",
      progress: 100,
      message: "历史文章套餐提取完成",
      result: JSON.stringify(result),
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(serverOfferImportTasks.id, task.id));
}

async function runServerOfferImportWorker() {
  await resetStaleRunningTasks();

  while (true) {
    const task = await claimNextTask();
    if (!task) {
      break;
    }

    try {
      await processTask(task);
      revalidateOfferPages();
    } catch (error) {
      await db
        .update(serverOfferImportTasks)
        .set({
          status: "failed",
          progress: 100,
          message: "套餐提取失败",
          errorTitle: "套餐提取失败",
          errorDetail: getErrorMessage(error),
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(serverOfferImportTasks.id, task.id));
    }
  }
}

export function ensureServerOfferImportWorker() {
  enqueueAdminBackgroundJob({
    key: "server-offer-import-worker",
    label: "Server offer import worker",
    run: runServerOfferImportWorker,
  });
}

export async function createServerOfferImportTask(input: {
  mode: ServerOfferImportMode;
  postId?: number | null;
}) {
  const session = await requireAdminSession();

  if (input.mode === "single") {
    const postId = input.postId ?? 0;
    if (!Number.isInteger(postId) || postId <= 0) {
      throw new Error("请选择一篇有效文章后再提取套餐");
    }

    const [post] = await db
      .select({ id: posts.id, title: posts.title })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) {
      throw new Error("文章不存在或已被删除");
    }
  }

  const [task] = await db
    .insert(serverOfferImportTasks)
    .values({
      mode: input.mode,
      postId: input.mode === "single" ? input.postId : null,
      status: "pending",
      progress: 0,
      message:
        input.mode === "single"
          ? "单篇文章套餐提取已排队"
          : "历史文章套餐提取已排队",
      createdBy: session.userId,
    })
    .returning();

  if (!task) {
    throw new Error("创建套餐提取任务失败");
  }

  ensureServerOfferImportWorker();
  return serializeServerOfferImportTask(task);
}

export async function retryServerOfferImportTask(taskId: number) {
  await requireAdminSession();

  const [task] = await db
    .update(serverOfferImportTasks)
    .set({
      status: "pending",
      progress: 0,
      message: "等待重新提取套餐",
      result: null,
      errorTitle: null,
      errorDetail: null,
      startedAt: null,
      finishedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(serverOfferImportTasks.id, taskId),
        eq(serverOfferImportTasks.status, "failed"),
      ),
    )
    .returning();

  if (!task) {
    const [cancelledTask] = await db
      .update(serverOfferImportTasks)
      .set({
        status: "pending",
        progress: 0,
        message: "等待恢复套餐提取",
        result: null,
        errorTitle: null,
        errorDetail: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(serverOfferImportTasks.id, taskId),
          eq(serverOfferImportTasks.status, "cancelled"),
        ),
      )
      .returning();

    if (!cancelledTask) {
      throw new Error("任务不存在，或当前状态不能恢复");
    }

    ensureServerOfferImportWorker();
    revalidateOfferTaskPages(taskId);
    return serializeServerOfferImportTask(cancelledTask);
  }

  ensureServerOfferImportWorker();
  revalidateOfferTaskPages(taskId);
  return serializeServerOfferImportTask(task);
}

export async function cancelServerOfferImportTask(taskId: number) {
  await requireAdminSession();

  const [task] = await db
    .update(serverOfferImportTasks)
    .set({
      status: "cancelled",
      progress: 0,
      message: "任务已取消",
      errorTitle: null,
      errorDetail: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(serverOfferImportTasks.id, taskId),
        eq(serverOfferImportTasks.status, "pending"),
      ),
    )
    .returning();

  if (!task) {
    throw new Error(
      "任务不存在，或当前状态不能取消。运行中任务需要等待本轮结束。",
    );
  }

  revalidateOfferTaskPages(taskId);
  return serializeServerOfferImportTask(task);
}

export async function getServerOfferImportTaskStatus(taskId: number) {
  await requireAdminSession();

  const [task] = await db
    .select()
    .from(serverOfferImportTasks)
    .where(eq(serverOfferImportTasks.id, taskId))
    .limit(1);

  if (!task) {
    throw new Error("没有找到这个套餐提取任务");
  }

  if (task.status === "pending") {
    ensureServerOfferImportWorker();
  }

  return serializeServerOfferImportTask(task);
}
