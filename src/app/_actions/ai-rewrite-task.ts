"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@/server/auth/session";
import { enqueueAiRewriteTask } from "@/server/ai/rewrite-task-runner";
import { db } from "@/server/db";
import {
  aiRewriteConfigs,
  aiRewriteTasks,
  categories,
  posts,
} from "@/server/db/schema";

const taskInputSchema = z.object({
  sourceUrl: z.string().url("请输入有效 URL"),
  categoryId: z.coerce.number().int().positive("请选择分类"),
  rewriteStyleId: z.coerce.number().int().positive().optional(),
});

function parseSourceUrls(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(/\r?\n|,|\s+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

export async function createAiRewriteTaskAction(formData: FormData) {
  try {
    await requireAdminSession();

    const sourceUrls = parseSourceUrls(formData.get("sourceUrls"));
    const rewriteStyleIdValue = formData.get("rewriteStyleId");
    const sharedInput = taskInputSchema
      .omit({ sourceUrl: true })
      .parse({
      categoryId: formData.get("categoryId"),
      rewriteStyleId:
        typeof rewriteStyleIdValue === "string" && rewriteStyleIdValue
          ? rewriteStyleIdValue
          : undefined,
    });
    const urls = sourceUrls.length > 0 ? sourceUrls : parseSourceUrls(formData.get("sourceUrl"));
    const parsedUrls = urls.map((sourceUrl) =>
      taskInputSchema.parse({
        sourceUrl,
        categoryId: sharedInput.categoryId,
        rewriteStyleId: sharedInput.rewriteStyleId,
      }),
    );

    if (parsedUrls.length === 0) {
      return { error: "请输入至少一个有效 URL" };
    }

    if (parsedUrls.length > 20) {
      return { error: "单次最多提交 20 个 URL" };
    }

    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, sharedInput.categoryId))
      .limit(1);

    if (!category) {
      return { error: "分类不存在" };
    }

    if (sharedInput.rewriteStyleId) {
      const [style] = await db
        .select({ id: aiRewriteConfigs.id })
        .from(aiRewriteConfigs)
        .where(eq(aiRewriteConfigs.id, sharedInput.rewriteStyleId))
        .limit(1);

      if (!style) {
        return { error: "AI 改写配置不存在" };
      }
    }

    const tasks = await db
      .insert(aiRewriteTasks)
      .values(parsedUrls.map((input) => ({
        sourceUrl: input.sourceUrl,
        categoryId: sharedInput.categoryId,
        rewriteStyleId: sharedInput.rewriteStyleId ?? null,
        status: "pending",
        progress: 0,
        currentStep: "等待处理",
      })))
      .returning({ id: aiRewriteTasks.id });

    if (tasks.length === 0) {
      return { error: "创建任务失败" };
    }

    for (const task of tasks) {
      await enqueueAiRewriteTask(task.id);
    }
    revalidatePath("/end/ai-rewrite/tasks");

    return { data: tasks[0], count: tasks.length };
  } catch (error) {
    console.error("创建 AI 改写任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function retryAiRewriteTaskAction(taskId: number) {
  try {
    await requireAdminSession();

    const [task] = await db
      .update(aiRewriteTasks)
      .set({
        status: "pending",
        progress: 0,
        currentStep: "等待重试",
        error: null,
        postId: null,
        updatedAt: new Date(),
        startedAt: null,
        finishedAt: null,
      })
      .where(eq(aiRewriteTasks.id, taskId))
      .returning({ id: aiRewriteTasks.id });

    if (!task) {
      return { error: "任务不存在" };
    }

    await enqueueAiRewriteTask(task.id);
    revalidatePath("/end/ai-rewrite/tasks");

    return { data: task };
  } catch (error) {
    console.error("重试 AI 改写任务失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function getAiRewriteTaskList() {
  await requireAdminSession();

  return db
    .select({
      id: aiRewriteTasks.id,
      sourceUrl: aiRewriteTasks.sourceUrl,
      status: aiRewriteTasks.status,
      progress: aiRewriteTasks.progress,
      currentStep: aiRewriteTasks.currentStep,
      error: aiRewriteTasks.error,
      categoryName: categories.name,
      rewriteStyleName: aiRewriteConfigs.styleName,
      postId: aiRewriteTasks.postId,
      postSlug: posts.slug,
      postTitle: posts.title,
      resultTitle: aiRewriteTasks.resultTitle,
      diagnostics: aiRewriteTasks.diagnostics,
      attempts: aiRewriteTasks.attempts,
      createdAt: aiRewriteTasks.createdAt,
      updatedAt: aiRewriteTasks.updatedAt,
      startedAt: aiRewriteTasks.startedAt,
      finishedAt: aiRewriteTasks.finishedAt,
    })
    .from(aiRewriteTasks)
    .leftJoin(categories, eq(aiRewriteTasks.categoryId, categories.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiRewriteTasks.rewriteStyleId, aiRewriteConfigs.id),
    )
    .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
    .orderBy(desc(aiRewriteTasks.createdAt))
    .limit(50);
}

export async function getAiRewriteTaskDetail(id: number) {
  await requireAdminSession();

  const [task] = await db
    .select({
      id: aiRewriteTasks.id,
      sourceUrl: aiRewriteTasks.sourceUrl,
      status: aiRewriteTasks.status,
      progress: aiRewriteTasks.progress,
      currentStep: aiRewriteTasks.currentStep,
      error: aiRewriteTasks.error,
      categoryName: categories.name,
      rewriteStyleName: aiRewriteConfigs.styleName,
      postId: aiRewriteTasks.postId,
      postSlug: posts.slug,
      postTitle: posts.title,
      resultTitle: aiRewriteTasks.resultTitle,
      scrapedTitle: aiRewriteTasks.scrapedTitle,
      scrapedDescription: aiRewriteTasks.scrapedDescription,
      scrapedHtml: aiRewriteTasks.scrapedHtml,
      aiInputLength: aiRewriteTasks.aiInputLength,
      rewriteOutputLength: aiRewriteTasks.rewriteOutputLength,
      diagnostics: aiRewriteTasks.diagnostics,
      attempts: aiRewriteTasks.attempts,
      createdAt: aiRewriteTasks.createdAt,
      updatedAt: aiRewriteTasks.updatedAt,
      startedAt: aiRewriteTasks.startedAt,
      finishedAt: aiRewriteTasks.finishedAt,
    })
    .from(aiRewriteTasks)
    .leftJoin(categories, eq(aiRewriteTasks.categoryId, categories.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiRewriteTasks.rewriteStyleId, aiRewriteConfigs.id),
    )
    .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
    .where(eq(aiRewriteTasks.id, id))
    .limit(1);

  return task ?? null;
}
