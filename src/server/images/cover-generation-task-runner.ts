import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { imageCoverGenerationTasks, posts } from "@fwqgo/db/schema";
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
  const config = task.configId
    ? await getActiveImageGenerationConfig(task.configId)
    : task.configName || task.provider || task.model
      ? null
      : await getActiveImageGenerationConfig();

  if (!config) {
    throw new Error(
      task.configId
        ? `任务绑定的生图配置 #${task.configId} 已停用或不存在，请启用原配置后重试`
        : task.configName || task.provider || task.model
          ? "任务绑定的生图配置已被删除，请重新创建任务"
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
    .where(eq(imageCoverGenerationTasks.id, task.id))
    .returning();

  if (!boundTask) {
    throw new Error("封面生成任务配置绑定失败");
  }

  return boundTask;
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
  const boundTask = await bindCoverTaskConfig(task);
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
    configId: boundTask.configId ?? undefined,
    uploadedBy: boundTask.createdBy,
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
    .where(eq(imageCoverGenerationTasks.id, boundTask.id));
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
