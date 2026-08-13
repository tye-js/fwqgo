import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  isNull,
  inArray,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  affServiceProviders,
  imageCoverGenerationTasks,
  imageAssets,
  posts,
} from "@fwqgo/db/schema";
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
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { generateArticleCoverImage } from "@/server/images/generated-cover";
import { generateCustomImage } from "@/server/images/generated-custom-image";
import {
  extractCoverVisualBrief,
  mergeCoverVisualBrief,
  type CoverVisualBrief,
  type CoverVisualBriefOverrides,
} from "@fwqgo/core/image-generation-prompts";
import {
  getActiveImageGenerationConfig,
  getEnabledImageGenerationConfigs,
} from "@/server/images/generation-config";

export type CoverTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "uncertain"
  | "cancelled";

export type ImageGenerationTaskType =
  | "article_cover"
  | "standalone_cover"
  | "custom";

type CoverTaskInputSnapshot = {
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  fileSlug?: string | null;
  language?: "zh" | "en";
  knownBrands?: string[];
  visualBrief?: CoverVisualBrief;
  visualBriefOverrides?: CoverVisualBriefOverrides | null;
};

type CustomTaskInputSnapshot = {
  prompt: string;
  fileName?: string | null;
  altZh?: string | null;
};

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
  visualBriefOverrides?: CoverVisualBriefOverrides | null;
};

type EnqueueStandaloneCoverGenerationTaskInput = CoverTaskInputSnapshot & {
  configId?: number | null;
  createdBy?: string | null;
  batchId?: string;
};

type EnqueueCustomImageGenerationTaskInput = CustomTaskInputSnapshot & {
  configId?: number | null;
  createdBy?: string | null;
  batchId?: string;
};

let isCoverGenerationWorkerRunning = false;

const COVER_TASK_TIMEOUT_MS = 6 * 60 * 1000;

function formatWaitMinutes(ms: number) {
  return Math.max(1, Math.ceil(ms / 60_000));
}

class CoverGenerationTimeoutError extends ImageGenerationConnectionInterruptedError {
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
  "uncertain",
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
    taskType: task.taskType as ImageGenerationTaskType,
    title: task.title,
    configId: task.configId ?? undefined,
    configName: task.configName ?? undefined,
    provider: task.provider ?? undefined,
    model: task.model ?? undefined,
    status,
    requestStage: task.requestStage,
    prompt: task.prompt ?? undefined,
    hasPromptCheckpoint: Boolean(task.prompt?.trim()),
    hasAssetCheckpoint: Boolean(task.assetId ?? task.outputUrl),
    retryAfterAt: task.retryAfterAt?.toISOString() ?? null,
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
  const [[post], brandRows] = await Promise.all([
    db
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        keywords: posts.keywords,
        content: posts.content,
        slug: posts.slug,
        language: posts.language,
      })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .limit(1),
    db
      .select({
        name: affServiceProviders.name,
        aliases: affServiceProviders.aliases,
      })
      .from(affServiceProviders),
  ]);
  if (!post) throw new Error("文章不存在或已被删除");
  const coverInput: CoverTaskInputSnapshot = {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    content: post.content,
    fileSlug: post.slug,
    language: post.language === "en" ? "en" : "zh",
    knownBrands: brandRows.flatMap((row) => [
      row.name,
      ...(row.aliases?.split(/[,，\n]/) ?? []),
    ]),
  };
  coverInput.visualBrief = mergeCoverVisualBrief(
    extractCoverVisualBrief(coverInput),
    input.visualBriefOverrides,
  );
  coverInput.visualBriefOverrides = input.visualBriefOverrides;
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
              taskType: "article_cover",
              title: post.title,
              inputSnapshot: coverInput,
              configId: config.id,
              configName: config.name,
              provider: config.provider,
              model: config.model,
              status: "pending",
              outputUrl: null,
              assetId: null,
              prompt: null,
              requestStage: "queued",
              retryAfterAt: null,
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
              taskType: "article_cover",
              postId: input.postId,
              title: post.title,
              inputSnapshot: coverInput,
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

async function enqueueDetachedImageGenerationTask(input: {
  taskType: "standalone_cover" | "custom";
  title: string;
  inputSnapshot: CoverTaskInputSnapshot | CustomTaskInputSnapshot;
  configId?: number | null;
  createdBy?: string | null;
  batchId?: string;
}) {
  const config = await getActiveImageGenerationConfig(
    input.configId ?? undefined,
  );
  if (!config) {
    throw new Error(
      input.configId
        ? `指定的生图配置 #${input.configId} 不存在或已停用`
        : "当前没有已启用的默认生图配置",
    );
  }
  const requestedBatchId = input.batchId?.trim();
  const batchId = requestedBatchId?.length ? requestedBatchId : randomUUID();
  const [task] = await db
    .insert(imageCoverGenerationTasks)
    .values({
      batchId,
      taskType: input.taskType,
      postId: null,
      title: input.title,
      inputSnapshot: input.inputSnapshot,
      configId: config.id,
      configName: config.name,
      provider: config.provider,
      model: config.model,
      status: "pending",
      requestStage: "queued",
      createdBy: input.createdBy ?? null,
    })
    .returning();
  if (!task) throw new Error("生图任务创建失败");
  await ensureCoverGenerationWorker();
  return task;
}

export async function enqueueStandaloneCoverGenerationTask(
  input: EnqueueStandaloneCoverGenerationTaskInput,
) {
  const brandRows = await db
    .select({
      name: affServiceProviders.name,
      aliases: affServiceProviders.aliases,
    })
    .from(affServiceProviders);
  const snapshot: CoverTaskInputSnapshot = {
    ...input,
    knownBrands: brandRows.flatMap((row) => [
      row.name,
      ...(row.aliases?.split(/[,，\n]/) ?? []),
    ]),
  };
  snapshot.visualBrief = mergeCoverVisualBrief(
    extractCoverVisualBrief(snapshot),
    input.visualBriefOverrides,
  );
  return enqueueDetachedImageGenerationTask({
    taskType: "standalone_cover",
    title: snapshot.title,
    inputSnapshot: snapshot,
    configId: input.configId,
    createdBy: input.createdBy,
    batchId: input.batchId,
  });
}

export async function enqueueCustomImageGenerationTask(
  input: EnqueueCustomImageGenerationTaskInput,
) {
  const altTitle = input.altZh?.trim();
  const fileTitle = input.fileName?.trim();
  return enqueueDetachedImageGenerationTask({
    taskType: "custom",
    title: altTitle?.length
      ? altTitle
      : fileTitle?.length
        ? fileTitle
        : "自定义 AI 生图",
    inputSnapshot: {
      prompt: input.prompt.trim(),
      fileName: input.fileName,
      altZh: input.altZh,
    },
    configId: input.configId,
    createdBy: input.createdBy,
    batchId: input.batchId,
  });
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
        eq(imageCoverGenerationTasks.status, "running"),
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

  // A historical task may point to a deleted or disabled configuration. Keep
  // the historical snapshot for diagnostics, but let the candidate list pick
  // an enabled provider before treating the task as failed.
  return config ? persistCoverTaskConfig(task, config) : task;
}

async function persistCoverTaskPrompt(task: CoverTaskRow, prompt: string) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();

  const [updatedTask] = await db
    .update(imageCoverGenerationTasks)
    .set({
      prompt,
      requestStage: "prompt_persisted",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(imageCoverGenerationTasks.id, task.id),
        eq(imageCoverGenerationTasks.status, "running"),
        eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning();

  if (!updatedTask) throw new TaskLeaseLostError();
  return updatedTask;
}

async function persistCoverTaskCheckpoint(
  task: CoverTaskRow,
  values: Partial<typeof imageCoverGenerationTasks.$inferInsert>,
) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();
  const [updatedTask] = await db
    .update(imageCoverGenerationTasks)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(imageCoverGenerationTasks.id, task.id),
        eq(imageCoverGenerationTasks.status, "running"),
        eq(imageCoverGenerationTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning();
  if (!updatedTask) throw new TaskLeaseLostError();
  return updatedTask;
}

async function resetStaleRunningCoverTasks() {
  const now = new Date();

  const uncertain = await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "uncertain",
      errorTitle: "生图结果不确定",
      errorDetail:
        "任务在上游请求发出后失去运行租约，无法确认服务商是否已完成生图。为避免重复扣费，系统不会自动重试，请先到服务商侧确认。",
      finishedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(imageCoverGenerationTasks.status, "running"),
        inArray(imageCoverGenerationTasks.requestStage, [
          "request_started",
          "response_received",
          "asset_persisted",
        ]),
        isNull(imageCoverGenerationTasks.assetId),
        isNull(imageCoverGenerationTasks.outputUrl),
        or(
          isNull(imageCoverGenerationTasks.leaseExpiresAt),
          lt(imageCoverGenerationTasks.leaseExpiresAt, now),
        ),
      ),
    )
    .returning({ id: imageCoverGenerationTasks.id });

  const recovered = await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "pending",
      requestStage: sql`case when ${imageCoverGenerationTasks.assetId} is not null or ${imageCoverGenerationTasks.outputUrl} is not null then 'asset_persisted' else 'queued' end`,
      errorTitle: null,
      errorDetail: null,
      retryAfterAt: null,
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
  if (uncertain.length > 0) {
    structuredLog("warn", "cover.tasks_marked_uncertain", {
      count: uncertain.length,
      taskIds: uncertain.map((task) => task.id),
    });
  }
}

async function getNextPendingCoverTask() {
  const leaseOwner = createTaskLeaseOwner("cover-generation");
  const now = new Date();
  const [task] = await db
    .select({ id: imageCoverGenerationTasks.id })
    .from(imageCoverGenerationTasks)
    .where(
      and(
        eq(imageCoverGenerationTasks.status, "pending"),
        or(
          isNull(imageCoverGenerationTasks.retryAfterAt),
          lte(imageCoverGenerationTasks.retryAfterAt, now),
        ),
      ),
    )
    .orderBy(
      asc(imageCoverGenerationTasks.retryAfterAt),
      asc(imageCoverGenerationTasks.id),
    )
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
  const taskType = task.taskType as ImageGenerationTaskType;
  if (taskType === "article_cover" && !task.postId) {
    throw new Error("文章封面任务缺少关联文章，无法继续生成");
  }
  const [post] =
    taskType === "article_cover" && task.postId
      ? await db
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
          .limit(1)
      : [];

  if (taskType === "article_cover" && task.postId && !post) {
    throw new Error("文章不存在或已被删除");
  }

  let activeTask = task;
  let generated: {
    asset: { id: number | null; path: string };
    prompt: string;
  } | null = null;

  if (task.assetId || task.outputUrl) {
    let checkpointPath = task.outputUrl;
    let checkpointAssetId = task.assetId;

    if (!checkpointPath && checkpointAssetId) {
      const [asset] = await db
        .select({ id: imageAssets.id, path: imageAssets.path })
        .from(imageAssets)
        .where(eq(imageAssets.id, checkpointAssetId))
        .limit(1);
      checkpointPath = asset?.path ?? null;
    }

    if (checkpointPath && !checkpointAssetId) {
      const [asset] = await db
        .select({ id: imageAssets.id })
        .from(imageAssets)
        .where(eq(imageAssets.path, checkpointPath))
        .limit(1);
      checkpointAssetId = asset?.id ?? null;
    }

    if (!checkpointPath) {
      throw new ImageGenerationConnectionInterruptedError(
        "生图资产 checkpoint 不完整，无法安全恢复。为避免重复生成，请先确认图片资产后再处理",
      );
    }

    generated = {
      asset: { id: checkpointAssetId, path: checkpointPath },
      prompt: task.prompt ?? "",
    };
  }

  if (!generated) {
    activeTask = await bindCoverTaskConfig(task);
    signal.throwIfAborted();
    const enabledConfigs = await getEnabledImageGenerationConfigs();
    const currentConfig = enabledConfigs.find(
      (config) => config.id === activeTask.configId,
    );
    const candidates = currentConfig
      ? [
          currentConfig,
          ...enabledConfigs.filter((config) => config.id !== currentConfig.id),
        ]
      : enabledConfigs;

    if (candidates.length === 0) {
      throw new Error(
        activeTask.configId
          ? `任务绑定的生图配置 #${activeTask.configId} 已停用或不存在，且当前没有其他已启用配置`
          : "当前没有已启用的生图配置",
      );
    }

    for (const [index, config] of candidates.entries()) {
      signal.throwIfAborted();
      if (activeTask.configId !== config.id) {
        activeTask = await persistCoverTaskConfig(activeTask, config);
      }

      try {
      const callbacks = {
        onPrompt: async (prompt: string) => {
          activeTask = await persistCoverTaskPrompt(activeTask, prompt);
        },
        onRequestStarted: async () => {
          activeTask = await persistCoverTaskCheckpoint(activeTask, {
            requestStage: "request_started",
          });
        },
        onResponseReceived: async () => {
          activeTask = await persistCoverTaskCheckpoint(activeTask, {
            requestStage: "response_received",
          });
        },
        onAssetPersisted: async (asset: { id: number; path: string }) => {
          activeTask = await persistCoverTaskCheckpoint(activeTask, {
            requestStage: "asset_persisted",
            assetId: asset.id,
            outputUrl: asset.path,
          });
        },
      };
      if (taskType === "custom") {
        const snapshot = activeTask.inputSnapshot as CustomTaskInputSnapshot;
        if (!snapshot.prompt?.trim()) throw new Error("自定义生图任务缺少 Prompt");
        generated = await generateCustomImage({
          ...snapshot,
          configId: config.id,
          uploadedBy: activeTask.createdBy,
          allowFailover: false,
          signal,
          ...callbacks,
        });
      } else {
        const snapshot = activeTask.inputSnapshot as CoverTaskInputSnapshot;
        const coverInput: CoverTaskInputSnapshot = snapshot.title?.trim()
          ? snapshot
          : {
              title: post?.title ?? activeTask.title,
              description: post?.description,
              keywords: post?.keywords,
              content: post?.content,
              fileSlug: post?.slug,
              language: post?.language === "en" ? "en" : "zh",
            };
        generated = await generateArticleCoverImage({
          ...coverInput,
          configId: config.id,
          uploadedBy: activeTask.createdBy,
          signal,
          ...callbacks,
        });
      }
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
  }

  if (!generated) {
    throw new Error("所有已启用的生图配置均未返回可用图片");
  }

  signal.throwIfAborted();
  if (!(await renewCoverTaskLease(activeTask))) {
    throw new TaskLeaseLostError();
  }
  if (taskType !== "article_cover" || !post) return generated;

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

  try {
    revalidateSiteContent([
      cacheTags.posts,
      cacheTags.homepage,
      cacheTags.homepageSlots,
      cacheTags.post(updatedPost.id),
      cacheTags.postSlug(updatedPost.slug),
      cacheTags.category(updatedPost.categoryId),
    ]);
  } catch (error) {
    structuredLog("warn", "cover.cache_revalidation_failed", {
      taskId: task.id,
      postId: updatedPost.id,
      error,
    });
  }

  schedulePublicWebCache("image.changed", {
    postIds: [updatedPost.id],
    postSlugs: [updatedPost.slug],
    categoryIds: [updatedPost.categoryId],
  });
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
  const retryAfterAt = new Date(Date.now() + error.retryAfterMs);
  const waitMinutes = formatWaitMinutes(error.retryAfterMs);
  const [requeued] = await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "pending",
      requestStage: "queued",
      retryAfterAt,
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
  return retryAfterAt;
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
            requestStage: "completed",
            outputUrl: generated.asset.path,
            assetId: generated.asset.id,
            retryAfterAt: null,
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
          let retryAfterAt: Date;
          try {
            retryAfterAt = await requeueRateLimitedCoverTask(task, error);
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
          await ensureCoverGenerationWorker(retryAfterAt);
          continue;
        }

        if (error instanceof ImageGenerationConnectionInterruptedError) {
          const readableError = formatCoverGenerationError(error);
          const uncertain = await db
            .update(imageCoverGenerationTasks)
            .set({
              status: "uncertain",
              requestStage: "request_started",
              retryAfterAt: null,
              errorTitle: "生图结果不确定",
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
                eq(
                  imageCoverGenerationTasks.leaseOwner,
                  task.leaseOwner ?? "",
                ),
              ),
            )
            .returning({ id: imageCoverGenerationTasks.id });
          if (uncertain.length === 0) throw new TaskLeaseLostError();
          structuredLog("warn", "cover.task_result_uncertain", {
            taskId: task.id,
            postId: task.postId,
            error,
          });
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
            requestStage: "failed",
            retryAfterAt: null,
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
      }
    }
  } finally {
    isCoverGenerationWorkerRunning = false;
  }
}

export async function ensureCoverGenerationWorker(runAfter?: Date) {
  await enqueueAdminBackgroundJob({
    key: "article-cover-generation-worker",
    label: "Article cover generation worker",
    run: runCoverGenerationWorker,
    runAfter,
  });
}
