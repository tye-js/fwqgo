"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
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
  postId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1, "标题不能为空"),
  description: z.string().trim().optional(),
  keywords: z.string().trim().optional(),
  content: z.string().optional(),
  fileSlug: z.string().trim().optional(),
  language: z.enum(["zh", "en"]).default("zh"),
  configId: z.coerce.number().int().positive().optional(),
});

const batchCoverSchema = z.object({
  postIds: z.array(z.coerce.number().int().positive()).min(1).max(20),
});

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

function pruneEphemeralCoverBatches() {
  if (ephemeralCoverBatches.size <= MAX_EPHEMERAL_COVER_BATCHES) return;

  const keysToDelete = [...ephemeralCoverBatches.keys()].slice(
    0,
    ephemeralCoverBatches.size - MAX_EPHEMERAL_COVER_BATCHES,
  );
  for (const key of keysToDelete) {
    ephemeralCoverBatches.delete(key);
  }
}

async function runEphemeralCoverGenerationTask(
  batchId: string,
  payload: z.infer<typeof coverSchema>,
  uploadedBy: string,
) {
  const tasks = ephemeralCoverBatches.get(batchId);
  const task = tasks?.[0];
  if (!tasks || !task) return;

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
    const imageConfig = await requireActiveImageConfig(payload.configId);
    const boundPayload = { ...payload, configId: imageConfig.id };

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
    pruneEphemeralCoverBatches();
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
    const imageConfig = await requireActiveImageConfig();
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

    const batchId = randomUUID();
    const tasks = await db
      .insert(imageCoverGenerationTasks)
      .values(
        postRows.map((post) => ({
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

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return adminActionFailure(new Error("任务 ID 无效"), {
        title: "恢复封面生成任务失败",
        suggestion: "请从任务中心重新打开任务详情。",
      });
    }

    const [task] = await db
      .update(imageCoverGenerationTasks)
      .set({
        status: "pending",
        outputUrl: null,
        assetId: null,
        errorTitle: null,
        errorDetail: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(imageCoverGenerationTasks.id, taskId),
          inArray(imageCoverGenerationTasks.status, ["failed", "cancelled"]),
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
    revalidateCoverGenerationTaskPaths(taskId);
    return adminActionSuccess(
      serializeCoverTask(task),
      "封面生成任务已重新排队",
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

    if (!Number.isInteger(taskId) || taskId <= 0) {
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
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(imageCoverGenerationTasks.id, taskId),
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

    revalidateCoverGenerationTaskPaths(taskId);
    return adminActionSuccess(serializeCoverTask(task), "封面生成任务已取消");
  } catch (error) {
    const readableError = formatCoverGenerationError(error);
    return adminActionFailure(new Error(readableError.detail), {
      title: readableError.title,
      suggestion: "请刷新任务详情后重试。",
    });
  }
}

export async function getCoverGenerationBatchStatusAction(batchId: string) {
  try {
    await requireAdminSession();

    const normalizedBatchId = batchId.trim();
    if (!normalizedBatchId) {
      return { success: false, error: "批次号不能为空" };
    }

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

    const normalizedBatchId = batchId.trim();
    if (!normalizedBatchId) {
      return { success: false, error: "批次号不能为空" };
    }

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
