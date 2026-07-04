"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, lt } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { db } from "@fwqgo/db";
import { imageCoverGenerationTasks, posts } from "@fwqgo/db/schema";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { generateArticleCoverImage } from "@/server/images/generated-cover";

const coverSchema = z.object({
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

type CoverTaskStatus = "pending" | "running" | "succeeded" | "failed";
type CoverTaskRow = typeof imageCoverGenerationTasks.$inferSelect;

let isCoverGenerationWorkerRunning = false;

function formatCoverGenerationError(error: unknown) {
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

function serializeCoverTask(task: CoverTaskRow) {
  const status = task.status as CoverTaskStatus;

  return {
    taskId: task.id,
    batchId: task.batchId,
    postId: task.postId,
    title: task.title,
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
  };
}

async function resetStaleRunningCoverTasks() {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);

  await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "pending",
      errorTitle: null,
      errorDetail: null,
      startedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(imageCoverGenerationTasks.status, "running"),
        lt(imageCoverGenerationTasks.updatedAt, staleBefore),
      ),
    );
}

async function getNextPendingCoverTask() {
  const [task] = await db
    .select()
    .from(imageCoverGenerationTasks)
    .where(eq(imageCoverGenerationTasks.status, "pending"))
    .orderBy(imageCoverGenerationTasks.id)
    .limit(1);

  if (!task) return null;

  const [claimedTask] = await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "running",
      errorTitle: null,
      errorDetail: null,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(imageCoverGenerationTasks.id, task.id))
    .returning();

  return claimedTask ?? null;
}

async function processCoverGenerationTask(task: CoverTaskRow) {
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

  const generated = await generateArticleCoverImage({
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    content: post.content,
    fileSlug: post.slug,
    language: post.language === "en" ? "en" : "zh",
    uploadedBy: task.createdBy,
  });

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

  await syncImageReferencesForPost(updatedPost.id);
  revalidateSiteContent([
    cacheTags.post(updatedPost.id),
    cacheTags.postSlug(updatedPost.slug),
    cacheTags.category(updatedPost.categoryId),
  ]);

  await db
    .update(imageCoverGenerationTasks)
    .set({
      status: "succeeded",
      outputUrl: generated.asset.path,
      assetId: generated.asset.id,
      errorTitle: null,
      errorDetail: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(imageCoverGenerationTasks.id, task.id));
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
        await processCoverGenerationTask(task);
      } catch (error) {
        const readableError = formatCoverGenerationError(error);

        await db
          .update(imageCoverGenerationTasks)
          .set({
            status: "failed",
            errorTitle: readableError.title,
            errorDetail: readableError.detail,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(imageCoverGenerationTasks.id, task.id));
      }
    }
  } finally {
    isCoverGenerationWorkerRunning = false;
    revalidatePath("/images/covers");
    revalidatePath("/images/ai-generate");
    revalidatePath("/images/list");
    revalidatePath("/posts/edit");
    revalidatePath("/posts/drafts");
  }
}

function ensureCoverGenerationWorker() {
  void runCoverGenerationWorker().catch((error) => {
    console.error("Article cover generation worker crashed:", error);
  });
}

export async function generateArticleCoverImageAction(input: {
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
    const result = await generateArticleCoverImage({
      ...payload,
      uploadedBy: session.userId,
    });

    revalidatePath("/images/list");

    return {
      success: true,
      url: result.asset.path,
      assetId: result.asset.id,
      prompt: result.prompt,
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

    const batchId = randomUUID();
    const tasks = await db
      .insert(imageCoverGenerationTasks)
      .values(
        postRows.map((post) => ({
          batchId,
          postId: post.id,
          title: post.title,
          status: "pending",
          createdBy: session.userId,
        })),
      )
      .returning();

    revalidatePath("/images/covers");
    ensureCoverGenerationWorker();

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

export async function getCoverGenerationBatchStatusAction(batchId: string) {
  try {
    await requireAdminSession();

    const normalizedBatchId = batchId.trim();
    if (!normalizedBatchId) {
      return { success: false, error: "批次号不能为空" };
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
      ensureCoverGenerationWorker();
    }

    return {
      success: true,
      batchId: normalizedBatchId,
      results: tasks.map(serializeCoverTask),
      successCount: tasks.filter((task) => task.status === "succeeded").length,
      failedCount: tasks.filter((task) => task.status === "failed").length,
      pendingCount: tasks.filter((task) => task.status === "pending").length,
      runningCount: tasks.filter((task) => task.status === "running").length,
      done: tasks.every(
        (task) => task.status === "succeeded" || task.status === "failed",
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
