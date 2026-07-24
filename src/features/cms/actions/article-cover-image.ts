"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { reserveBoundedMapCapacity } from "@fwqgo/core/bounded-map";
import {
  formPostgresIntegerIdSchema,
  postgresIntegerIdSchema,
} from "@fwqgo/core/postgres-id";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { db } from "@fwqgo/db";
import { imageCoverGenerationTasks, posts } from "@fwqgo/db/schema";
import { generateArticleCoverImage } from "@/server/images/generated-cover";
import { getActiveImageGenerationConfig } from "@/server/images/generation-config";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import {
  ensureCoverGenerationWorker,
  formatCoverGenerationError,
  serializeCoverTask,
  terminalCoverTaskStatuses,
  type CoverTaskStatus,
} from "@/server/images/cover-generation-task-runner";
import {
  adminActionFailure,
  adminActionSuccess,
} from "@/lib/admin-action-result";

const coverSchema = z.object({
  postId: formPostgresIntegerIdSchema.optional(),
  title: z.string().trim().min(1, "标题不能为空"),
  description: z.string().trim().optional(),
  keywords: z.string().trim().optional(),
  content: z.string().optional(),
  fileSlug: z.string().trim().optional(),
  language: z.enum(["zh", "en"]).default("zh"),
  configId: formPostgresIntegerIdSchema.optional(),
});

const batchCoverSchema = z.object({
  postIds: z.array(formPostgresIntegerIdSchema).min(1).max(20),
});

const coverBatchIdSchema = z.string().trim().uuid("封面生成批次号无效");

function parseTaskId(taskId: number) {
  const parsed = postgresIntegerIdSchema.safeParse(taskId);
  return parsed.success ? parsed.data : null;
}

const finalizedCoverGenerationBatches = new Set<string>();

type EphemeralCoverTask = {
  taskId: number;
  batchId: string;
  title: string;
  status: CoverTaskStatus;
  url?: string;
  assetId?: number;
  errorTitle?: string;
  errorDetail?: string;
  startedAt: Date | null;
  finishedAt: Date | null;
};

const ephemeralCoverBatches = new Map<string, EphemeralCoverTask[]>();
const MAX_EPHEMERAL_COVER_BATCHES = 30;

async function requireActiveImageConfig(configId?: number) {
  const config = await getActiveImageGenerationConfig(configId);
  if (!config) {
    throw new Error(
      configId
        ? `指定的生图配置 #${configId} 不存在或已停用`
        : "当前没有已启用的默认生图配置",
    );
  }

  return config;
}

function serializeEphemeralCoverTask(task: EphemeralCoverTask) {
  return {
    taskId: task.taskId,
    batchId: task.batchId,
    postId: 0,
    title: task.title,
    status: task.status,
    success: task.status === "succeeded",
    url: task.url,
    assetId: task.assetId,
    error: task.errorTitle
      ? [task.errorTitle, task.errorDetail].filter(Boolean).join("：")
      : undefined,
    errorTitle: task.errorTitle,
    errorDetail: task.errorDetail,
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.finishedAt?.toISOString() ?? null,
  };
}

async function runEphemeralCoverGenerationTask(
  batchId: string,
  payload: z.infer<typeof coverSchema>,
  uploadedBy: string,
) {
  const tasks = ephemeralCoverBatches.get(batchId);
  const task = tasks?.[0];
  if (!tasks || !task) {
    throw new Error("临时封面任务状态已丢失，请重新提交任务");
  }

  const runningTask: EphemeralCoverTask = {
    ...task,
    status: "running",
    startedAt: new Date(),
  };
  ephemeralCoverBatches.set(batchId, [runningTask]);

  try {
    const result = await generateArticleCoverImage({
      ...payload,
      uploadedBy,
    });

    ephemeralCoverBatches.set(batchId, [
      {
        ...runningTask,
        status: "succeeded",
        url: result.asset.path,
        assetId: result.asset.id,
        finishedAt: new Date(),
      },
    ]);
  } catch (error) {
    const readableError = formatCoverGenerationError(error);
    ephemeralCoverBatches.set(batchId, [
      {
        ...runningTask,
        status: "failed",
        errorTitle: readableError.title,
        errorDetail: readableError.detail,
        finishedAt: new Date(),
      },
    ]);
  }
}

function revalidateCoverGenerationAdminPaths() {
  revalidatePath("/images/covers");
  revalidatePath("/images/ai-generate");
  revalidatePath("/images/list");
  revalidatePath("/posts/edit");
  revalidatePath("/posts/drafts");
  revalidatePath("/ai-tasks");
}

function revalidateCoverGenerationTaskPaths(taskId: number) {
  revalidateCoverGenerationAdminPaths();
  revalidatePath(`/ai-tasks/covers/${taskId}`);
}

async function getPostCoverRevalidationTags(postIds: number[]) {
  const uniquePostIds = [...new Set(postIds)];
  if (uniquePostIds.length === 0) return [];

  const postRows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      categoryId: posts.categoryId,
    })
    .from(posts)
    .where(inArray(posts.id, uniquePostIds));

  return postRows.flatMap((post) => [
    cacheTags.post(post.id),
    cacheTags.postSlug(post.slug),
    cacheTags.category(post.categoryId),
  ]);
}

export async function generateArticleCoverImageAction(input: {
  postId?: number;
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  fileSlug?: string | null;
  language?: "zh" | "en";
  configId?: number;
}) {
  try {
    const session = await requireAdminSession();
    const payload = coverSchema.parse(input);

    if (payload.postId) {
      const [post] = await db
        .select({ id: posts.id, title: posts.title })
        .from(posts)
        .where(eq(posts.id, payload.postId))
        .limit(1);

      if (!post) {
        return {
          success: false,
          error: "文章不存在或已被删除",
          errorTitle: "无法创建封面生成任务",
        };
      }

      const [activeTask] = await db
        .select()
        .from(imageCoverGenerationTasks)
        .where(
          and(
            eq(imageCoverGenerationTasks.postId, post.id),
            inArray(imageCoverGenerationTasks.status, ["pending", "running"]),
          ),
        )
        .orderBy(desc(imageCoverGenerationTasks.id))
        .limit(1);

      if (activeTask) {
        await ensureCoverGenerationWorker();
        return {
          success: true,
          queued: true,
          reused: true,
          batchId: activeTask.batchId,
          results: [serializeCoverTask(activeTask)],
          pendingCount: activeTask.status === "pending" ? 1 : 0,
          runningCount: activeTask.status === "running" ? 1 : 0,
          successCount: 0,
          failedCount: 0,
        };
      }

      const imageConfig = await requireActiveImageConfig(payload.configId);

      const batchId = randomUUID();
      const [task] = await db
        .insert(imageCoverGenerationTasks)
        .values({
          batchId,
          postId: post.id,
          title: post.title,
          configId: imageConfig.id,
          configName: imageConfig.name,
          provider: imageConfig.provider,
          model: imageConfig.model,
          status: "pending",
          createdBy: session.userId,
        })
        .returning();

      if (!task) {
        return {
          success: false,
          error: "封面生成任务创建失败",
          errorTitle: "无法创建封面生成任务",
        };
      }

      revalidatePath("/images/covers");
      await ensureCoverGenerationWorker();

      return {
        success: true,
        queued: true,
        batchId,
        results: [serializeCoverTask(task)],
        pendingCount: 1,
        runningCount: 0,
        successCount: 0,
        failedCount: 0,
      };
    }

    const imageConfig = await requireActiveImageConfig(payload.configId);
    const boundPayload = { ...payload, configId: imageConfig.id };
    const hasCapacity = reserveBoundedMapCapacity(ephemeralCoverBatches, {
      maxEntries: MAX_EPHEMERAL_COVER_BATCHES,
      isEvictable: (tasks) =>
        tasks.length > 0 &&
        tasks.every((task) => terminalCoverTaskStatuses.includes(task.status)),
      getEvictionPriority: (tasks) =>
        Math.min(
          ...tasks.map(
            (task) => task.finishedAt?.getTime() ?? Number.POSITIVE_INFINITY,
          ),
        ),
    });
    if (!hasCapacity) {
      return {
        success: false,
        error: "当前活跃封面生成任务过多，请等待现有任务完成后重试",
        errorTitle: "无法创建封面生成任务",
      };
    }

    const batchId = randomUUID();
    const task: EphemeralCoverTask = {
      taskId: -Date.now(),
      batchId,
      title: payload.title,
      status: "pending",
      startedAt: null,
      finishedAt: null,
    };
    ephemeralCoverBatches.set(batchId, [task]);
    await enqueueAdminBackgroundJob({
      key: `article-cover-generation:${batchId}`,
      label: `Article cover generation: ${payload.title}`,
      maxAttempts: 1,
      run: () =>
        runEphemeralCoverGenerationTask(batchId, boundPayload, session.userId),
    });

    return {
      success: true,
      queued: true,
      batchId,
      results: [serializeEphemeralCoverTask(task)],
      pendingCount: 1,
      runningCount: 0,
      successCount: 0,
      failedCount: 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "生成封面图失败",
    };
  }
}

export async function batchGenerateArticleCoverImagesAction(input: {
  postIds: number[];
}) {
  try {
    const session = await requireAdminSession();
    const payload = batchCoverSchema.parse(input);
    const uniquePostIds = [...new Set(payload.postIds)];
    const postRows = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        description: posts.description,
        keywords: posts.keywords,
        content: posts.content,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(inArray(posts.id, uniquePostIds));

    if (postRows.length === 0) {
      return {
        success: false,
        error: "没有找到可生成封面的文章，请刷新页面后重试",
      };
    }

    const activeTaskRows = await db
      .select({ postId: imageCoverGenerationTasks.postId })
      .from(imageCoverGenerationTasks)
      .where(
        and(
          inArray(imageCoverGenerationTasks.postId, uniquePostIds),
          inArray(imageCoverGenerationTasks.status, ["pending", "running"]),
        ),
      );
    const activePostIds = new Set(activeTaskRows.map((task) => task.postId));
    const queuedPostRows = postRows.filter(
      (post) => !activePostIds.has(post.id),
    );

    if (queuedPostRows.length === 0) {
      return {
        success: false,
        error: "所选文章已有封面任务正在排队或生成，请等待完成后再操作",
        errorTitle: "没有创建重复封面任务",
      };
    }

    const imageConfig = await requireActiveImageConfig();

    const batchId = randomUUID();
    const tasks = await db
      .insert(imageCoverGenerationTasks)
      .values(
        queuedPostRows.map((post) => ({
          batchId,
          postId: post.id,
          title: post.title,
          configId: imageConfig.id,
          configName: imageConfig.name,
          provider: imageConfig.provider,
          model: imageConfig.model,
          status: "pending",
          createdBy: session.userId,
        })),
      )
      .returning();

    revalidatePath("/images/covers");
    await ensureCoverGenerationWorker();

    return {
      success: true,
      batchId,
      results: tasks.map(serializeCoverTask),
      successCount: 0,
      failedCount: 0,
      pendingCount: tasks.length,
      runningCount: 0,
      skippedActiveCount: activePostIds.size,
      skippedActivePostIds: [...activePostIds],
    };
  } catch (error) {
    const readableError = formatCoverGenerationError(error);

    return {
      success: false,
      error: readableError.detail,
      errorTitle: readableError.title,
    };
  }
}

export async function retryCoverGenerationTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    const parsedTaskId = parseTaskId(taskId);

    if (parsedTaskId === null) {
      return adminActionFailure(new Error("任务 ID 无效"), {
        title: "恢复封面生成任务失败",
        suggestion: "请从任务中心重新打开任务详情。",
      });
    }

    const [existingTask] = await db
      .select({ status: imageCoverGenerationTasks.status })
      .from(imageCoverGenerationTasks)
      .where(eq(imageCoverGenerationTasks.id, parsedTaskId))
      .limit(1);

    if (
      !existingTask ||
      (existingTask.status !== "failed" && existingTask.status !== "cancelled")
    ) {
      return adminActionFailure(new Error("任务不存在，或当前状态不能恢复"), {
        title: "恢复封面生成任务失败",
        suggestion: "只有失败或已取消的封面任务可以恢复。",
      });
    }

    const defaultConfig =
      existingTask.status === "failed"
        ? await getActiveImageGenerationConfig()
        : null;
    if (existingTask.status === "failed" && !defaultConfig) {
      return adminActionFailure(new Error("当前没有已启用的默认生图配置"), {
        title: "封面生成任务重试失败",
        suggestion: "请先在生图接口配置中启用并设定默认配置。",
      });
    }

    const retryValues: Partial<typeof imageCoverGenerationTasks.$inferInsert> =
      {
        status: "pending",
        outputUrl: null,
        assetId: null,
        prompt: null,
        errorTitle: null,
        errorDetail: null,
        startedAt: null,
        finishedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: new Date(),
      };

    if (defaultConfig) {
      retryValues.configId = defaultConfig.id;
      retryValues.configName = defaultConfig.name;
      retryValues.provider = defaultConfig.provider;
      retryValues.model = defaultConfig.model;
    }

    const [task] = await db
      .update(imageCoverGenerationTasks)
      .set(retryValues)
      .where(
        and(
          eq(imageCoverGenerationTasks.id, parsedTaskId),
          eq(imageCoverGenerationTasks.status, existingTask.status),
        ),
      )
      .returning();

    if (!task) {
      return adminActionFailure(new Error("任务不存在，或当前状态不能恢复"), {
        title: "恢复封面生成任务失败",
        suggestion: "只有失败或已取消的封面任务可以恢复。",
      });
    }

    await ensureCoverGenerationWorker();
    revalidateCoverGenerationTaskPaths(parsedTaskId);
    return adminActionSuccess(
      serializeCoverTask(task),
      defaultConfig
        ? `封面生成任务已切换到默认配置「${defaultConfig.name}」并重新排队`
        : "封面生成任务已重新排队",
    );
  } catch (error) {
    const readableError = formatCoverGenerationError(error);
    return adminActionFailure(new Error(readableError.detail), {
      title: readableError.title,
      suggestion: "请检查生图接口配置和文章封面输入后再恢复。",
    });
  }
}

export async function cancelCoverGenerationTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    const parsedTaskId = parseTaskId(taskId);

    if (parsedTaskId === null) {
      return adminActionFailure(new Error("任务 ID 无效"), {
        title: "取消封面生成任务失败",
        suggestion: "请从任务中心重新打开任务详情。",
      });
    }

    const [task] = await db
      .update(imageCoverGenerationTasks)
      .set({
        status: "cancelled",
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
          eq(imageCoverGenerationTasks.id, parsedTaskId),
          eq(imageCoverGenerationTasks.status, "pending"),
        ),
      )
      .returning();

    if (!task) {
      return adminActionFailure(
        new Error(
          "任务不存在，或当前状态不能取消。运行中任务需要等待本轮结束。",
        ),
        {
          title: "取消封面生成任务失败",
          suggestion: "只能取消尚未开始执行的排队任务。",
        },
      );
    }

    revalidateCoverGenerationTaskPaths(parsedTaskId);
    return adminActionSuccess(serializeCoverTask(task), "封面生成任务已取消");
  } catch (error) {
    const readableError = formatCoverGenerationError(error);
    return adminActionFailure(new Error(readableError.detail), {
      title: readableError.title,
      suggestion: "请刷新任务详情后重试。",
    });
  }
}

export async function deleteCoverGenerationTaskAction(taskId: number) {
  try {
    await requireAdminSession();
    const parsedTaskId = parseTaskId(taskId);

    if (parsedTaskId === null) {
      return adminActionFailure(new Error("任务 ID 无效"), {
        title: "删除封面生成任务失败",
        suggestion: "请从任务中心重新打开任务后再删除。",
      });
    }

    const [existingTask] = await db
      .select({
        id: imageCoverGenerationTasks.id,
        postId: imageCoverGenerationTasks.postId,
        assetId: imageCoverGenerationTasks.assetId,
        status: imageCoverGenerationTasks.status,
      })
      .from(imageCoverGenerationTasks)
      .where(eq(imageCoverGenerationTasks.id, parsedTaskId))
      .limit(1);

    if (!existingTask) {
      return adminActionFailure(new Error("任务不存在或已被删除"), {
        title: "删除封面生成任务失败",
        suggestion: "请刷新任务中心确认最新状态。",
      });
    }

    if (existingTask.status === "running") {
      return adminActionFailure(new Error("任务正在生成封面，不能删除"), {
        title: "删除封面生成任务失败",
        suggestion: "请等待任务结束后再删除。",
      });
    }

    const [deletedTask] = await db
      .delete(imageCoverGenerationTasks)
      .where(
        and(
          eq(imageCoverGenerationTasks.id, parsedTaskId),
          eq(imageCoverGenerationTasks.status, existingTask.status),
        ),
      )
      .returning({ id: imageCoverGenerationTasks.id });

    if (!deletedTask) {
      return adminActionFailure(new Error("任务状态已变化，未执行删除"), {
        title: "删除封面生成任务失败",
        suggestion: "请刷新任务中心确认最新状态后再操作。",
      });
    }

    revalidateCoverGenerationTaskPaths(parsedTaskId);
    return adminActionSuccess(
      {
        id: existingTask.id,
        postId: existingTask.postId,
        assetId: existingTask.assetId,
      },
      "封面生成任务已删除，图片资产和文章封面保持不变",
    );
  } catch (error) {
    const readableError = formatCoverGenerationError(error);
    return adminActionFailure(new Error(readableError.detail), {
      title: "删除封面生成任务失败",
      suggestion: "请刷新任务中心后重试。",
    });
  }
}

export async function getCoverGenerationBatchStatusAction(batchId: string) {
  try {
    await requireAdminSession();

    const normalizedBatchId = coverBatchIdSchema.parse(batchId);

    const ephemeralTasks = ephemeralCoverBatches.get(normalizedBatchId);
    if (ephemeralTasks) {
      return {
        success: true,
        batchId: normalizedBatchId,
        results: ephemeralTasks.map(serializeEphemeralCoverTask),
        successCount: ephemeralTasks.filter(
          (task) => task.status === "succeeded",
        ).length,
        failedCount: ephemeralTasks.filter((task) => task.status === "failed")
          .length,
        pendingCount: ephemeralTasks.filter((task) => task.status === "pending")
          .length,
        runningCount: ephemeralTasks.filter((task) => task.status === "running")
          .length,
        done: ephemeralTasks.every((task) =>
          terminalCoverTaskStatuses.includes(task.status),
        ),
      };
    }

    const tasks = await db
      .select()
      .from(imageCoverGenerationTasks)
      .where(eq(imageCoverGenerationTasks.batchId, normalizedBatchId))
      .orderBy(imageCoverGenerationTasks.id);

    if (tasks.length === 0) {
      return { success: false, error: "没有找到这个封面生成批次" };
    }

    const hasPending = tasks.some((task) => task.status === "pending");
    if (hasPending) {
      await ensureCoverGenerationWorker();
    }

    return {
      success: true,
      batchId: normalizedBatchId,
      results: tasks.map(serializeCoverTask),
      successCount: tasks.filter((task) => task.status === "succeeded").length,
      failedCount: tasks.filter((task) => task.status === "failed").length,
      pendingCount: tasks.filter((task) => task.status === "pending").length,
      runningCount: tasks.filter((task) => task.status === "running").length,
      done: tasks.every((task) =>
        terminalCoverTaskStatuses.includes(task.status),
      ),
    };
  } catch (error) {
    const readableError = formatCoverGenerationError(error);

    return {
      success: false,
      error: readableError.detail,
      errorTitle: readableError.title,
    };
  }
}

export async function finalizeCoverGenerationBatchAction(batchId: string) {
  try {
    await requireAdminSession();

    const normalizedBatchId = coverBatchIdSchema.parse(batchId);

    if (finalizedCoverGenerationBatches.has(normalizedBatchId)) {
      return { success: true, revalidated: false };
    }

    const ephemeralTasks = ephemeralCoverBatches.get(normalizedBatchId);
    if (ephemeralTasks) {
      const done = ephemeralTasks.every((task) =>
        terminalCoverTaskStatuses.includes(task.status),
      );
      if (!done) {
        return {
          success: false,
          error: "封面生成批次还在运行，请完成后再刷新缓存",
        };
      }

      revalidateCoverGenerationAdminPaths();
      finalizedCoverGenerationBatches.add(normalizedBatchId);
      return { success: true, revalidated: true };
    }

    const tasks = await db
      .select({
        postId: imageCoverGenerationTasks.postId,
        status: imageCoverGenerationTasks.status,
      })
      .from(imageCoverGenerationTasks)
      .where(eq(imageCoverGenerationTasks.batchId, normalizedBatchId));

    if (tasks.length === 0) {
      return { success: false, error: "没有找到这个封面生成批次" };
    }

    const done = tasks.every((task) =>
      terminalCoverTaskStatuses.includes(task.status),
    );
    if (!done) {
      return {
        success: false,
        error: "封面生成批次还在运行，请完成后再刷新缓存",
      };
    }

    const succeededPostIds = tasks
      .filter((task) => task.status === "succeeded")
      .map((task) => task.postId);
    const tags = await getPostCoverRevalidationTags(succeededPostIds);

    if (tags.length > 0) {
      revalidateSiteContent(tags);
      schedulePublicWebCache("image.changed", {
        postIds: succeededPostIds,
      });
    }
    revalidateCoverGenerationAdminPaths();
    finalizedCoverGenerationBatches.add(normalizedBatchId);

    return {
      success: true,
      revalidated: true,
      postCount: succeededPostIds.length,
    };
  } catch (error) {
    const readableError = formatCoverGenerationError(error);

    return {
      success: false,
      error: readableError.detail,
      errorTitle: readableError.title,
    };
  }
}
