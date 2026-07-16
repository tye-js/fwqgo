import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import {
  createTaskLeaseOwner,
  getTaskLeaseExpiry,
  TaskLeaseLostError,
  withTaskLeaseHeartbeat,
} from "@fwqgo/core/task-lease";
import { structuredLog } from "@fwqgo/core/structured-log";
import { db } from "@fwqgo/db";
import { serverOfferImportTasks } from "@fwqgo/db/schema";
import { getErrorMessage } from "@/lib/admin-action-result";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import {
  importServerOffersFromPost,
  importServerOffersFromPosts,
} from "@/server/offers/server-offers";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

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
  const now = new Date();

  const recovered = await db
    .update(serverOfferImportTasks)
    .set({
      status: "pending",
      progress: 0,
      message: "上次执行超时，已重新排队",
      errorTitle: null,
      errorDetail: null,
      startedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(serverOfferImportTasks.status, "running"),
        or(
          isNull(serverOfferImportTasks.leaseExpiresAt),
          lt(serverOfferImportTasks.leaseExpiresAt, now),
        ),
      ),
    )
    .returning({ id: serverOfferImportTasks.id });
  if (recovered.length > 0) {
    structuredLog("warn", "offers.tasks_recovered", {
      count: recovered.length,
      taskIds: recovered.map((task) => task.id),
    });
  }
}

async function claimNextTask() {
  const leaseOwner = createTaskLeaseOwner("server-offer-import");
  const now = new Date();
  const [task] = await db
    .select({ id: serverOfferImportTasks.id })
    .from(serverOfferImportTasks)
    .where(eq(serverOfferImportTasks.status, "pending"))
    .orderBy(asc(serverOfferImportTasks.id))
    .limit(1);

  if (!task) {
    return null;
  }

  const [claimedTask] = await db
    .update(serverOfferImportTasks)
    .set({
      status: "running",
      progress: 10,
      message: "正在读取文章并提取有效套餐",
      errorTitle: null,
      errorDetail: null,
      startedAt: now,
      leaseOwner,
      leaseExpiresAt: getTaskLeaseExpiry(now),
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(serverOfferImportTasks.id, task.id),
        eq(serverOfferImportTasks.status, "pending"),
      ),
    )
    .returning();

  return claimedTask ?? null;
}

async function processTask(task: ServerOfferImportTask, signal: AbortSignal) {
  if (!task.leaseOwner) {
    throw new Error("套餐提取任务缺少租约所有者");
  }
  signal.throwIfAborted();
  const ownedTaskWhere = and(
    eq(serverOfferImportTasks.id, task.id),
    eq(serverOfferImportTasks.leaseOwner, task.leaseOwner),
  );
  if (task.mode === "single") {
    if (!task.postId) {
      throw new Error("单篇提取任务缺少文章 ID");
    }

    await db
      .update(serverOfferImportTasks)
      .set({
        progress: 35,
        message: "正在识别单篇文章中的配置、价格和购买链接",
        updatedAt: new Date(),
      })
      .where(ownedTaskWhere);

    const result = await importServerOffersFromPost(task.postId, {
      revalidate: false,
    });
    signal.throwIfAborted();
    if (!(await renewTaskLease(task))) throw new TaskLeaseLostError();
    return { result, message: "单篇文章套餐提取完成" };
  }

  await db
    .update(serverOfferImportTasks)
    .set({
      progress: 25,
      message: "正在扫描历史文章并提取有效套餐",
      updatedAt: new Date(),
    })
    .where(ownedTaskWhere);

  const result = await importServerOffersFromPosts({ revalidate: false });
  signal.throwIfAborted();
  if (!(await renewTaskLease(task))) throw new TaskLeaseLostError();
  return { result, message: "历史文章套餐提取完成" };
}

async function renewTaskLease(task: ServerOfferImportTask) {
  if (!task.leaseOwner) return false;
  const now = new Date();
  const rows = await db
    .update(serverOfferImportTasks)
    .set({
      heartbeatAt: now,
      leaseExpiresAt: getTaskLeaseExpiry(now),
      updatedAt: now,
    })
    .where(
      and(
        eq(serverOfferImportTasks.id, task.id),
        eq(serverOfferImportTasks.status, "running"),
        eq(serverOfferImportTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning({ id: serverOfferImportTasks.id });
  return rows.length > 0;
}

async function runServerOfferImportWorker() {
  await resetStaleRunningTasks();

  while (true) {
    const task = await claimNextTask();
    if (!task) {
      break;
    }

    try {
      const output = await withTaskLeaseHeartbeat({
        renew: () => renewTaskLease(task),
        run: (signal) => processTask(task, signal),
        onRenewError: (error) =>
          structuredLog("error", "offers.task_heartbeat_failed", {
            taskId: task.id,
            leaseOwner: task.leaseOwner,
            error,
          }),
      });
      const completed = await db
        .update(serverOfferImportTasks)
        .set({
          status: "succeeded",
          progress: 100,
          message: output.message,
          result: JSON.stringify(output.result),
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(serverOfferImportTasks.id, task.id),
            eq(serverOfferImportTasks.leaseOwner, task.leaseOwner ?? ""),
          ),
        )
        .returning({ id: serverOfferImportTasks.id });
      if (completed.length === 0) throw new TaskLeaseLostError();
      await notifyPublicWebCache("offer.changed", {
        topicSlugs: ["hong-kong", "united-states", "cheap-vps"],
      });
    } catch (error) {
      structuredLog("error", "offers.task_failed", {
        taskId: task.id,
        postId: task.postId,
        leaseOwner: task.leaseOwner,
        error,
      });
      await db
        .update(serverOfferImportTasks)
        .set({
          status: "failed",
          progress: 100,
          message: "套餐提取失败",
          errorTitle: "套餐提取失败",
          errorDetail: getErrorMessage(error),
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(serverOfferImportTasks.id, task.id),
            eq(serverOfferImportTasks.leaseOwner, task.leaseOwner ?? ""),
          ),
        );
    }
  }
}

export async function ensureServerOfferImportWorker() {
  await enqueueAdminBackgroundJob({
    key: "server-offer-import-worker",
    label: "Server offer import worker",
    run: runServerOfferImportWorker,
  });
}

export async function createServerOfferImportTask(input: {
  mode: ServerOfferImportMode;
  postId?: number | null;
}) {
  await requireAdminSession();
  void input;
  throw new Error("文章套餐提取已停用，请改用供应商官网采集");
}

export async function retryServerOfferImportTask(taskId: number) {
  await requireAdminSession();
  void taskId;
  throw new Error("历史文章套餐提取任务已归档，不能恢复");
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
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
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
    await ensureServerOfferImportWorker();
  }

  return serializeServerOfferImportTask(task);
}
