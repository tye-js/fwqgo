import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { imageCoverGenerationTasks, posts } from "@fwqgo/db/schema";
import {
  createTaskLeaseOwner,
  getTaskLeaseExpiry,
  TaskLeaseLostError,
  withTaskLeaseHeartbeat,
} from "@fwqgo/core/task-lease";
import {
  canFailoverImageGenerationError,
  ImageGenerationConnectionInterruptedError,
  ImageGenerationRateLimitError,
} from "@fwqgo/core/image-generation-endpoint";
import { structuredLog } from "@fwqgo/core/structured-log";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { generateArticleCoverImage } from "@/server/images/generated-cover";
import {
  getActiveImageGenerationConfig,
  getEnabledImageGenerationConfigs,
} from "@/server/images/generation-config";

export type CoverTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type CoverTaskRow = typeof imageCoverGenerationTasks.$inferSelect;
type ImageGenerationConfig = Awaited<
  ReturnType<typeof getEnabledImageGenerationConfigs>
>[number];

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

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatWaitMinutes(ms: number) {
  return Math.max(1, Math.ceil(ms / 60_000));
}

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
  const enqueueResult = await db.transaction(async (tx) => {
    if (requestedBatchId) {
      const lockKey = `${batchId}:${input.postId}`;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
    }

    const [existingTask] = requestedBatchId
      ? await tx
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
      return { task: existingTask, reused: true, ensureWorker: true };
    }

    if (existingTask?.status === "succeeded" && !input.restartTerminal) {
      return { task: existingTask, reused: true, ensureWorker: false };
    }

    const config = await getActiveImageGenerationConfig(
      input.configId ?? undefined,
      tx,
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
          await tx
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
            .where(
              and(
                eq(imageCoverGenerationTasks.id, existingTask.id),
                eq(imageCoverGenerationTasks.status, existingTask.status),
              ),
            )
            .returning()
        )[0]
      : (
          await tx
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
      throw new Error("封面生成任务状态已变化，请刷新后重试");
    }

    return {
      task,
      reused: Boolean(existingTask),
      ensureWorker: true,
    };
  });

  if (enqueueResult.ensureWorker) await ensureCoverGenerationWorker();
  return { task: enqueueResult.task, reused: enqueueResult.reused };
}

async function persistCoverTaskConfig(
  task: CoverTaskRow,
  config: ImageGenerationConfig,
) {
  if (!task.leaseOwner) {
    throw new Error("封面生成任务缺少租约所有者");
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

async function bindCoverTaskConfig(task: CoverTaskRow) {
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

  return persistCoverTaskConfig(task, config);
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

  const enabledConfigs = (await getEnabledImageGenerationConfigs()).filter(
    (config) => config.apiKey?.trim(),
  );
  const currentConfig = enabledConfigs.find(
    (config) => config.id === boundTask.configId,
  );
  const candidates = currentConfig
    ? [
        currentConfig,
        ...enabledConfigs.filter((config) => config.id !== currentConfig.id),
      ]
    : enabledConfigs;

  let activeTask = boundTask;
  let generated: Awaited<ReturnType<typeof generateArticleCoverImage>> | null =
    null;

  for (const [index, config] of candidates.entries()) {
    signal.throwIfAborted();
    if (activeTask.configId !== config.id) {
      activeTask = await persistCoverTaskConfig(activeTask, config);
    }

    try {
      generated = await generateArticleCoverImage({
        title: post.title,
        description: post.description,
        keywords: post.keywords,
        content: post.content,
        fileSlug: post.slug,
        language: post.language === "en" ? "en" : "zh",
        configId: config.id,
        uploadedBy: activeTask.createdBy,
        signal,
      });
      break;
    } catch (error) {
      const hasFallback = index < candidates.length - 1;
      if (!hasFallback || !canFailoverImageGenerationError(error)) {
        throw error;
      }

      structuredLog("warn", "cover.task_config_failover", {
        taskId: task.id,
        postId: task.postId,
        failedConfigId: config.id,
        failedConfigName: config.name,
        nextConfigId: candidates[index + 1]?.id,
        error,
      });
    }
  }

  if (!generated) {
    throw new Error("所有已启用的生图配置均未返回可用图片");
  }

  signal.throwIfAborted();
  if (!(await renewCoverTaskLease(activeTask))) {
    throw new TaskLeaseLostError();
  }
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
  return generated;
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

async function requeueRateLimitedCoverTask(
  task: CoverTaskRow,
  error: ImageGenerationRateLimitError,
) {
  const waitMinutes = formatWaitMinutes(error.retryAfterMs);
  const [requeued] = await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "pending",
      errorTitle: "生图接口限流，自动等待",
      errorDetail: `接口返回 429，当前任务将在约 ${waitMinutes} 分钟后自动重试；${error.message}`,
      startedAt: null,
      finishedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(imageCoverGenerationTasks.id, task.id),
        eq(imageCoverGenerationTasks.status, "running"),
        eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner ?? ""),
      ),
    )
    .returning({ id: imageCoverGenerationTasks.id });

  if (!requeued) throw new TaskLeaseLostError();
}

async function hasPendingCoverGenerationTasks() {
  const [task] = await db
    .select({ id: imageCoverGenerationTasks.id })
    .from(imageCoverGenerationTasks)
    .where(eq(imageCoverGenerationTasks.status, "pending"))
    .limit(1);
  return Boolean(task);
}

async function processCoverGenerationTaskWithTimeout(
  task: CoverTaskRow,
  leaseSignal: AbortSignal,
) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const abortForLostLease = () => controller.abort(leaseSignal.reason);
  if (leaseSignal.aborted) abortForLostLease();
  else leaseSignal.addEventListener("abort", abortForLostLease, { once: true });
  const processing = processCoverGenerationTask(task, controller.signal);
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new CoverGenerationTimeoutError();
      controller.abort(error);
      reject(error);
    }, COVER_TASK_TIMEOUT_MS);
  });

  try {
    return await Promise.race([processing, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
    leaseSignal.removeEventListener("abort", abortForLostLease);
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
        const generated = await withTaskLeaseHeartbeat({
          renew: () => renewCoverTaskLease(task),
          run: (signal) => processCoverGenerationTaskWithTimeout(task, signal),
          onRenewError: (error) =>
            structuredLog("error", "cover.task_heartbeat_failed", {
              taskId: task.id,
              leaseOwner: task.leaseOwner,
              error,
            }),
        });
        const completed = await db
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
              eq(imageCoverGenerationTasks.id, task.id),
              eq(imageCoverGenerationTasks.status, "running"),
              eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner ?? ""),
            ),
          )
          .returning({ id: imageCoverGenerationTasks.id });
        if (completed.length === 0) throw new TaskLeaseLostError();
      } catch (error) {
        if (error instanceof TaskLeaseLostError) {
          structuredLog("warn", "cover.task_result_ignored_after_lease_loss", {
            taskId: task.id,
            postId: task.postId,
            leaseOwner: task.leaseOwner,
          });
          continue;
        }

        if (error instanceof ImageGenerationRateLimitError) {
          try {
            await requeueRateLimitedCoverTask(task, error);
          } catch (requeueError) {
            if (requeueError instanceof TaskLeaseLostError) {
              structuredLog(
                "warn",
                "cover.task_rate_limit_requeue_ignored_after_lease_loss",
                {
                  taskId: task.id,
                  postId: task.postId,
                  leaseOwner: task.leaseOwner,
                },
              );
              continue;
            }
            throw requeueError;
          }
          structuredLog("warn", "cover.task_rate_limited", {
            taskId: task.id,
            postId: task.postId,
            retryAfterMs: error.retryAfterMs,
          });
          await wait(error.retryAfterMs);
          continue;
        }

        const readableError = formatCoverGenerationError(error);
        structuredLog("error", "cover.task_failed", {
          taskId: task.id,
          postId: task.postId,
          leaseOwner: task.leaseOwner,
          error,
        });

        const failed = await db
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
              eq(imageCoverGenerationTasks.status, "running"),
              eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner ?? ""),
            ),
          )
          .returning({ id: imageCoverGenerationTasks.id });
        if (failed.length === 0) {
          structuredLog("warn", "cover.task_failure_ignored_after_lease_loss", {
            taskId: task.id,
            postId: task.postId,
            leaseOwner: task.leaseOwner,
          });
          continue;
        }

        if (
          error instanceof ImageGenerationConnectionInterruptedError &&
          (await hasPendingCoverGenerationTasks())
        ) {
          structuredLog("warn", "cover.queue_paused_after_disconnect", {
            taskId: task.id,
            postId: task.postId,
            pauseAfterMs: error.pauseAfterMs,
          });
          await wait(error.pauseAfterMs);
        }
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
