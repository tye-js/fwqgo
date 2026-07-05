import { and, asc, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { imageCoverGenerationTasks, posts } from "@fwqgo/db/schema";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { generateArticleCoverImage } from "@/server/images/generated-cover";

export type CoverTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type CoverTaskRow = typeof imageCoverGenerationTasks.$inferSelect;

let isCoverGenerationWorkerRunning = false;

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
        or(
          lt(imageCoverGenerationTasks.updatedAt, staleBefore),
          and(
            isNull(imageCoverGenerationTasks.updatedAt),
            lt(imageCoverGenerationTasks.startedAt, staleBefore),
          ),
        ),
      ),
    );
}

async function getNextPendingCoverTask() {
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
      startedAt: new Date(),
      updatedAt: new Date(),
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
  }
}

export async function ensureCoverGenerationWorker() {
  await enqueueAdminBackgroundJob({
    key: "article-cover-generation-worker",
    label: "Article cover generation worker",
    run: runCoverGenerationWorker,
  });
}
