import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { imageCoverGenerationTasks, posts } from "@fwqgo/db/schema";
import {
  createTaskLeaseOwner,
  getTaskLeaseExpiry,
  withTaskLeaseHeartbeat,
} from "@fwqgo/core/task-lease";
import { structuredLog } from "@fwqgo/core/structured-log";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { generateArticleCoverImage } from "@/server/images/generated-cover";
import { getActiveImageGenerationConfig } from "@/server/images/generation-config";

export type CoverTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type CoverTaskRow = typeof imageCoverGenerationTasks.$inferSelect;

type EnqueueCoverGenerationTaskInput = {
  postId: number;
  title: string;
  configId?: number | null;
  createdBy?: string | null;
  batchId?: string;
  restartTerminal?: boolean;
};

let isCoverGenerationWorkerRunning = false;

const COVER_TASK_TIMEOUT_MS = 6 * 60 * 1000;

class CoverGenerationTimeoutError extends Error {
  constructor() {
    super(
      "封面生图任务超时：任务执行超过 6 分钟，已自动终止并继续处理后续任务。请检查生图接口状态后重试",
    );
    this.name = "CoverGenerationTimeoutError";
  }
}

export const terminalCoverTaskStatuses: readonly string[] = [
  "succeeded",
  "failed",
  "cancelled",
];

export function formatCoverGenerationError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "生成封面图失败";
  const [title, ...detailParts] = message.split(/：|；/);
  const trimmedTitle = title?.trim() ?? "";
  const normalizedTitle =
    trimmedTitle.length > 0 ? trimmedTitle : "生成封面图失败";
  const detail = detailParts.join("；").trim();

  return {
    title: normalizedTitle,
    detail: detail.length > 0 ? detail : message,
  };
}

export function serializeCoverTask(task: CoverTaskRow) {
  const status = task.status as CoverTaskStatus;

  return {
    taskId: task.id,
    batchId: task.batchId,
    postId: task.postId,
    title: task.title,
    configId: task.configId ?? undefined,
    configName: task.configName ?? undefined,
    provider: task.provider ?? undefined,
    model: task.model ?? undefined,
    status,
    success: status === "succeeded",
    url: task.outputUrl ?? undefined,
    assetId: task.assetId ?? undefined,
    error: task.errorTitle
      ? [task.errorTitle, task.errorDetail].filter(Boolean).join("：")
      : undefined,
    errorTitle: task.errorTitle ?? undefined,
    errorDetail: task.errorDetail ?? undefined,
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.finishedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt?.toISOString() ?? null,
  };
}

export async function enqueueArticleCoverGenerationTask(
  input: EnqueueCoverGenerationTaskInput,
) {
  const requestedBatchId = input.batchId?.trim();
  const batchId = requestedBatchId?.length ? requestedBatchId : randomUUID();
  const [existingTask] = requestedBatchId
    ? await db
        .select()
        .from(imageCoverGenerationTasks)
        .where(
          and(
            eq(imageCoverGenerationTasks.batchId, batchId),
            eq(imageCoverGenerationTasks.postId, input.postId),
          ),
        )
        .orderBy(desc(imageCoverGenerationTasks.id))
        .limit(1)
    : [];

  if (
    existingTask &&
    (existingTask.status === "pending" || existingTask.status === "running")
  ) {
    await ensureCoverGenerationWorker();
    return { task: existingTask, reused: true };
  }

  if (existingTask?.status === "succeeded" && !input.restartTerminal) {
    return { task: existingTask, reused: true };
  }

  const config = await getActiveImageGenerationConfig(
    input.configId ?? undefined,
  );
  if (!config) {
    throw new Error(
      input.configId
        ? `任务绑定的生图配置 #${input.configId} 已停用或不存在`
        : "当前没有已启用的默认生图配置",
    );
  }

  const task = existingTask
    ? (
        await db
          .update(imageCoverGenerationTasks)
          .set({
            title: input.title,
            configId: config.id,
            configName: config.name,
            provider: config.provider,
            model: config.model,
            status: "pending",
            outputUrl: null,
            assetId: null,
            errorTitle: null,
            errorDetail: null,
            createdBy: input.createdBy ?? existingTask.createdBy,
            startedAt: null,
            finishedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            updatedAt: new Date(),
          })
          .where(eq(imageCoverGenerationTasks.id, existingTask.id))
          .returning()
      )[0]
    : (
        await db
          .insert(imageCoverGenerationTasks)
          .values({
            batchId,
            postId: input.postId,
            title: input.title,
            configId: config.id,
            configName: config.name,
            provider: config.provider,
            model: config.model,
            status: "pending",
            createdBy: input.createdBy ?? null,
          })
          .returning()
      )[0];

  if (!task) {
    throw new Error("封面生成任务创建失败");
  }

  await ensureCoverGenerationWorker();
  return { task, reused: Boolean(existingTask) };
}

async function bindCoverTaskConfig(task: CoverTaskRow) {
  if (!task.leaseOwner) {
    throw new Error("封面生成任务缺少租约所有者");
  }
  const config = task.configId
    ? await getActiveImageGenerationConfig(task.configId)
    : task.configName || task.provider || task.model
      ? null
      : await getActiveImageGenerationConfig();

  if (!config) {
    throw new Error(
      task.configId
        ? `任务绑定的生图配置 #${task.configId} 已停用或不存在，请重试任务以切换到当前默认配置`
        : task.configName || task.provider || task.model
          ? "任务绑定的生图配置已被删除，请重试任务以切换到当前默认配置"
          : "当前没有已启用的默认生图配置",
    );
  }

  const [boundTask] = await db
    .update(imageCoverGenerationTasks)
    .set({
      configId: config.id,
      configName: config.name,
      provider: config.provider,
      model: config.model,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(imageCoverGenerationTasks.id, task.id),
        eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning();

  if (!boundTask) {
    throw new Error("封面生成任务配置绑定失败");
  }

  return boundTask;
}

async function resetStaleRunningCoverTasks() {
  const now = new Date();

  const recovered = await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "pending",
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
        eq(imageCoverGenerationTasks.status, "running"),
        or(
          isNull(imageCoverGenerationTasks.leaseExpiresAt),
          lt(imageCoverGenerationTasks.leaseExpiresAt, now),
        ),
      ),
    )
    .returning({ id: imageCoverGenerationTasks.id });
  if (recovered.length > 0) {
    structuredLog("warn", "cover.tasks_recovered", {
      count: recovered.length,
      taskIds: recovered.map((task) => task.id),
    });
  }
}

async function getNextPendingCoverTask() {
  const leaseOwner = createTaskLeaseOwner("cover-generation");
  const now = new Date();
  const [task] = await db
    .select({ id: imageCoverGenerationTasks.id })
    .from(imageCoverGenerationTasks)
    .where(eq(imageCoverGenerationTasks.status, "pending"))
    .orderBy(asc(imageCoverGenerationTasks.id))
    .limit(1);

  if (!task) return null;

  const [claimedTask] = await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "running",
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
        eq(imageCoverGenerationTasks.id, task.id),
        eq(imageCoverGenerationTasks.status, "pending"),
      ),
    )
    .returning();

  return claimedTask ?? null;
}

async function processCoverGenerationTask(
  task: CoverTaskRow,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const boundTask = await bindCoverTaskConfig(task);
  signal.throwIfAborted();
  const [post] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      description: posts.description,
      keywords: posts.keywords,
      content: posts.content,
      categoryId: posts.categoryId,
      language: posts.language,
    })
    .from(posts)
    .where(eq(posts.id, task.postId))
    .limit(1);

  if (!post) {
    throw new Error("文章不存在或已被删除");
  }

  signal.throwIfAborted();
  const generated = await generateArticleCoverImage({
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    content: post.content,
    fileSlug: post.slug,
    language: post.language === "en" ? "en" : "zh",
    configId: boundTask.configId ?? undefined,
    uploadedBy: boundTask.createdBy,
    signal,
  });

  signal.throwIfAborted();
  const [updatedPost] = await db
    .update(posts)
    .set({
      imgUrl: generated.asset.path,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, post.id))
    .returning({
      id: posts.id,
      slug: posts.slug,
      categoryId: posts.categoryId,
    });

  if (!updatedPost) {
    throw new Error("封面写入文章失败");
  }

  signal.throwIfAborted();
  await syncImageReferencesForPost(updatedPost.id);

  signal.throwIfAborted();
  await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "succeeded",
      outputUrl: generated.asset.path,
      assetId: generated.asset.id,
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
        eq(imageCoverGenerationTasks.id, boundTask.id),
        eq(imageCoverGenerationTasks.leaseOwner, boundTask.leaseOwner ?? ""),
      ),
    );
}

async function renewCoverTaskLease(task: CoverTaskRow) {
  if (!task.leaseOwner) return false;
  const now = new Date();
  const rows = await db
    .update(imageCoverGenerationTasks)
    .set({
      heartbeatAt: now,
      leaseExpiresAt: getTaskLeaseExpiry(now),
      updatedAt: now,
    })
    .where(
      and(
        eq(imageCoverGenerationTasks.id, task.id),
        eq(imageCoverGenerationTasks.status, "running"),
        eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning({ id: imageCoverGenerationTasks.id });
  return rows.length > 0;
}

async function processCoverGenerationTaskWithTimeout(task: CoverTaskRow) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const processing = processCoverGenerationTask(task, controller.signal);
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new CoverGenerationTimeoutError();
      controller.abort(error);
      reject(error);
    }, COVER_TASK_TIMEOUT_MS);
  });

  try {
    await Promise.race([processing, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runCoverGenerationWorker() {
  if (isCoverGenerationWorkerRunning) return;
  isCoverGenerationWorkerRunning = true;

  try {
    await resetStaleRunningCoverTasks();

    while (true) {
      const task = await getNextPendingCoverTask();
      if (!task) break;

      try {
        await withTaskLeaseHeartbeat({
          renew: () => renewCoverTaskLease(task),
          run: () => processCoverGenerationTaskWithTimeout(task),
        });
      } catch (error) {
        const readableError = formatCoverGenerationError(error);
        structuredLog("error", "cover.task_failed", {
          taskId: task.id,
          postId: task.postId,
          leaseOwner: task.leaseOwner,
          error,
        });

        await db
          .update(imageCoverGenerationTasks)
          .set({
            status: "failed",
            errorTitle: readableError.title,
            errorDetail: readableError.detail,
            finishedAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(imageCoverGenerationTasks.id, task.id),
              eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner ?? ""),
            ),
          );
      }
    }
  } finally {
    isCoverGenerationWorkerRunning = false;
  }
}

export async function ensureCoverGenerationWorker() {
  await enqueueAdminBackgroundJob({
    key: "article-cover-generation-worker",
    label: "Article cover generation worker",
    run: runCoverGenerationWorker,
  });
}
