import { and, eq, inArray, sql } from "drizzle-orm";

import {
  createPostRecordInTransaction,
  getErrorMessage,
} from "@/server/posts/create-post-record";
import { db } from "@/server/db";
import { aiRewriteTasks } from "@/server/db/schema";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { importServerOffersFromPost } from "@/server/offers/server-offers";
import { scrapeArticleWithOptions } from "@/server/scrape/article-scraper";

const runningTaskIds = new Set<number>();

type TaskStatus = "pending" | "running" | "succeeded" | "failed";

async function updateTask(
  taskId: number,
  values: Partial<typeof aiRewriteTasks.$inferInsert>,
) {
  await db
    .update(aiRewriteTasks)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(aiRewriteTasks.id, taskId));
}

async function failTask(taskId: number, error: unknown) {
  await updateTask(taskId, {
    status: "failed",
    progress: 100,
    currentStep: "处理失败",
    error: getErrorMessage(error),
    finishedAt: new Date(),
  });
}

export async function enqueueAiRewriteTask(taskId: number) {
  if (runningTaskIds.has(taskId)) {
    return;
  }

  runningTaskIds.add(taskId);
  setTimeout(() => {
    runAiRewriteTask(taskId).catch((error) => {
      console.error("AI rewrite task failed:", error);
    });
  }, 0);
}

export async function runAiRewriteTask(taskId: number) {
  if (!runningTaskIds.has(taskId)) {
    runningTaskIds.add(taskId);
  }

  try {
    const [claimedTask] = await db
      .update(aiRewriteTasks)
      .set({
        status: "running",
        progress: 10,
        currentStep: "准备抓取",
        error: null,
        startedAt: new Date(),
        finishedAt: null,
        attempts: sql`${aiRewriteTasks.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiRewriteTasks.id, taskId),
          inArray(aiRewriteTasks.status, ["pending", "failed"]),
        ),
      )
      .returning();

    if (!claimedTask) {
      return;
    }

    try {
      await updateTask(taskId, {
        progress: 35,
        currentStep: "抓取文章并执行 AI 改写",
      });

      const article = await scrapeArticleWithOptions({
        url: claimedTask.sourceUrl,
        rewriteStyleId: claimedTask.rewriteStyleId ?? undefined,
      });

      await updateTask(taskId, {
        progress: 82,
        currentStep: "保存为草稿文章",
        resultTitle: article.title,
        scrapedTitle: article.diagnostics.scrapedTitle ?? article.title,
        scrapedDescription: article.diagnostics.scrapedDescription ?? article.description,
        scrapedHtml: article.htmlContent.slice(0, 60_000),
        aiInputLength: article.diagnostics.aiInputLength ?? null,
        rewriteOutputLength:
          article.diagnostics.rewriteOutputLength ?? article.htmlContent.length,
        diagnostics: JSON.stringify(article.diagnostics),
      });

      const post = await db.transaction(async (tx) => {
        const result = await createPostRecordInTransaction(
          {
            post: {
              title: article.title || "未命名采集文章",
              description: article.description || article.title || "待补充摘要",
              content: article.htmlContent || article.content,
              imgUrl: "",
              published: false,
              categoryId: claimedTask.categoryId,
              recommendedTagName: article.recommendTagName || null,
              keywords: article.keywords.join(","),
            },
            tags: article.tagsName.map((name) => ({ name })),
          },
          tx,
        );

        if (result.error || !result.data) {
          throw new Error(result.error ?? "草稿保存失败");
        }

        const [updatedTask] = await tx
          .update(aiRewriteTasks)
          .set({
            status: "succeeded" satisfies TaskStatus,
            progress: 100,
            currentStep: "已保存草稿",
            postId: result.data.id,
            resultTitle: result.data.title,
            finishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(aiRewriteTasks.id, taskId))
          .returning({ id: aiRewriteTasks.id });

        if (!updatedTask) {
          throw new Error("任务状态更新失败");
        }

        return result.data;
      });

      if (!post) {
        throw new Error("草稿保存失败");
      }

      await syncImageReferencesForPost(post.id);

      try {
        await importServerOffersFromPost(post.id);
        await updateTask(taskId, {
          progress: 100,
          currentStep: "草稿已保存，套餐提取完成",
        });
      } catch (offerError) {
        console.error("Server offer extraction failed:", offerError);
        await updateTask(taskId, {
          progress: 100,
          currentStep: "草稿已保存，套餐提取失败，可在套餐数据页重新导入",
        });
      }
    } catch (error) {
      await failTask(taskId, error);
    }
  } finally {
    runningTaskIds.delete(taskId);
  }
}
