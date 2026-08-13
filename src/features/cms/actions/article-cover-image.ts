"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CoverVisualBriefOverrides } from "@fwqgo/core/image-generation-prompts";
import { and, desc, eq, inArray } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import {
  formPostgresIntegerIdSchema,
  postgresIntegerIdSchema,
} from "@fwqgo/core/postgres-id";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { db } from "@fwqgo/db";
import { imageCoverGenerationTasks, posts } from "@fwqgo/db/schema";
import { getActiveImageGenerationConfig } from "@/server/images/generation-config";
import {
  enqueueArticleCoverGenerationTask,
  enqueueStandaloneCoverGenerationTask,
  ensureCoverGenerationWorker,
  formatCoverGenerationError,
  serializeCoverTask,
  terminalCoverTaskStatuses,
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
  visualBriefOverrides: z
    .object({
      title: z.string().trim().max(240).optional(),
      brands: z.array(z.string().trim().max(120)).max(20).optional(),
      regions: z.array(z.string().trim().max(120)).max(20).optional(),
      productTypes: z.array(z.string().trim().max(120)).max(20).optional(),
      specifications: z.array(z.string().trim().max(120)).max(30).optional(),
      promotionThemes: z.array(z.string().trim().max(120)).max(20).optional(),
      forbiddenElements: z.array(z.string().trim().max(160)).max(30).optional(),
    })
    .optional(),
});

const batchCoverSchema = z.object({
  postIds: z.array(formPostgresIntegerIdSchema).min(1).max(20),
});

const coverBatchIdSchema = z.string().trim().uuid("封面生成批次号无效");

function parseTaskId(taskId: number) {
  const parsed = postgresIntegerIdSchema.safeParse(taskId);
  return parsed.success ? parsed.data : null;
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
  visualBriefOverrides?: CoverVisualBriefOverrides | null;
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

      const { task } = await enqueueArticleCoverGenerationTask({
        postId: post.id,
        title: post.title,
        configId: payload.configId,
        createdBy: session.userId,
        visualBriefOverrides: payload.visualBriefOverrides,
      });

      revalidatePath("/images/covers");

      return {
        success: true,
        queued: true,
        batchId: task.batchId,
        results: [serializeCoverTask(task)],
        pendingCount: 1,
        runningCount: 0,
        successCount: 0,
        failedCount: 0,
      };
    }

    const task = await enqueueStandaloneCoverGenerationTask({
      ...payload,
      createdBy: session.userId,
    });

    return {
      success: true,
      queued: true,
      batchId: task.batchId,
      results: [serializeCoverTask(task)],
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

    const batchId = randomUUID();
    const tasks = await Promise.all(
      queuedPostRows.map(async (post) => {
        const result = await enqueueArticleCoverGenerationTask({
          batchId,
          postId: post.id,
          title: post.title,
          createdBy: session.userId,
        });
        return result.task;
      }),
    );

    revalidatePath("/images/covers");
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
      !["failed", "uncertain", "cancelled"].includes(existingTask.status)
    ) {
      return adminActionFailure(new Error("任务不存在，或当前状态不能恢复"), {
        title: "恢复封面生成任务失败",
        suggestion: "只有失败、结果不确定或已取消的生图任务可以恢复。",
      });
    }

    const defaultConfig =
      existingTask.status === "failed" || existingTask.status === "uncertain"
        ? await getActiveImageGenerationConfig()
        : null;
    if (
      (existingTask.status === "failed" ||
        existingTask.status === "uncertain") &&
      !defaultConfig
    ) {
      return adminActionFailure(new Error("当前没有已启用的默认生图配置"), {
        title: "封面生成任务重试失败",
        suggestion: "请先在生图接口配置中启用并设定默认配置。",
      });
    }

    const retryValues: Partial<typeof imageCoverGenerationTasks.$inferInsert> =
      {
        status: "pending",
        requestStage: "queued",
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
        suggestion: "只有失败、结果不确定或已取消的生图任务可以恢复。",
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
      .map((task) =>
        task.status === "succeeded" ? task.postId : null,
      )
      .filter((postId): postId is number => postId !== null);
    const tags = await getPostCoverRevalidationTags(succeededPostIds);

    if (tags.length > 0) {
      revalidateSiteContent(tags);
      schedulePublicWebCache("image.changed", {
        postIds: succeededPostIds,
      });
    }
    revalidateCoverGenerationAdminPaths();

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
