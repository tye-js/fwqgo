import { and, eq, inArray, sql } from "drizzle-orm";
import * as cheerio from "cheerio";

import RewriteArticle from "@/langchain/rewrite-article";
import { normalizeArticleHtml } from "@/lib/content";
import {
  createPostRecordInTransaction,
  getErrorMessage,
} from "@/server/posts/create-post-record";
import { db } from "@/server/db";
import { aiRewriteTasks } from "@/server/db/schema";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { importServerOffersFromPost } from "@/server/offers/server-offers";
import {
  scrapeArticleWithOptions,
  type ScrapedArticle,
  type ScrapeDiagnostics,
} from "@/server/scrape/article-scraper";
import { rewriteAffiliateLinks } from "@/server/scrape/affiliate-link-rewriter";

const runningTaskIds = new Set<number>();

type TaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "manual_required";

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

function needsManualAffiliateReview(
  diagnostics: ScrapeDiagnostics,
) {
  return (diagnostics.affiliateReport?.unmatchedLinks.length ?? 0) > 0;
}

function finishedStepText(input: {
  manualRequired: boolean;
  offerExtraction: "pending" | "success" | "failed";
}) {
  const reviewText = input.manualRequired ? "，存在未命中外链，需人工审核" : "";

  if (input.offerExtraction === "success") {
    return `草稿已保存，套餐提取完成${reviewText}`;
  }

  if (input.offerExtraction === "failed") {
    return `草稿已保存，套餐提取失败，可在套餐数据页重新导入${reviewText}`;
  }

  return `已保存草稿${reviewText}`;
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function textToHtml(value: string) {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

async function createArticleFromManualTask(input: {
  sourceTitle: string | null;
  sourceContent: string | null;
  sourceUrl: string;
  rewriteStyleId?: number;
}): Promise<ScrapedArticle> {
  const rawContent = input.sourceContent?.trim();
  if (!rawContent) {
    throw new Error("手动素材内容为空");
  }

  const trimmedTitle = input.sourceTitle?.trim();
  const sourceTitle =
    typeof trimmedTitle === "string" && trimmedTitle.length > 0
      ? trimmedTitle
      : "手动素材";
  const html = normalizeArticleHtml(
    looksLikeHtml(rawContent) ? rawContent : textToHtml(rawContent),
  );
  const $ = cheerio.load(html, null, false);
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com";
  const affiliateReport = await rewriteAffiliateLinks({
    $,
    baseUrl,
    sourceHost: new URL(baseUrl).hostname,
    removeInternal: false,
  });
  const cleanedHtml = $.html();
  const diagnostics: ScrapeDiagnostics = {
    sourceHost: input.sourceUrl,
    strategy: "manual-material",
    usedPuppeteer: false,
    usedFallback: false,
    usedAiRewrite: false,
    contentLength: cleanedHtml.length,
    scrapedTitle: sourceTitle,
    scrapedDescription: $.text().trim().slice(0, 160),
    cleanedHtmlLength: cleanedHtml.length,
    aiInputLength: cleanedHtml.length,
    aiInputTruncated: false,
    removedSelectors: [],
    affiliateReport,
    warnings: [],
  };

  try {
    const rewritten = await RewriteArticle(cleanedHtml, {
      styleId: input.rewriteStyleId,
    });
    diagnostics.usedAiRewrite = true;
    diagnostics.rewriteOutputLength = rewritten.htmlContent.length;

    return {
      title: rewritten.title || sourceTitle,
      content: normalizeArticleHtml(rewritten.htmlContent),
      htmlContent: normalizeArticleHtml(rewritten.htmlContent),
      description: rewritten.description,
      keywords: rewritten.keywords,
      recommendTagName: rewritten.recommendTagName,
      tagsName: rewritten.tagsName,
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 改写失败";
    diagnostics.aiRewriteError = message;
    diagnostics.warnings.push(`AI 改写失败，已回退为原始素材内容：${message}`);

    return {
      title: sourceTitle,
      content: cleanedHtml,
      htmlContent: cleanedHtml,
      description: diagnostics.scrapedDescription ?? sourceTitle,
      keywords: [],
      recommendTagName: "",
      tagsName: [],
      diagnostics,
    };
  }
}

async function loadTaskArticle(
  claimedTask: typeof aiRewriteTasks.$inferSelect,
) {
  if (claimedTask.sourceType === "text" || claimedTask.sourceType === "email") {
    return createArticleFromManualTask({
      sourceTitle: claimedTask.sourceTitle,
      sourceContent: claimedTask.sourceContent,
      sourceUrl: claimedTask.sourceUrl,
      rewriteStyleId: claimedTask.rewriteStyleId ?? undefined,
    });
  }

  return scrapeArticleWithOptions({
    url: claimedTask.sourceUrl,
    rewriteStyleId: claimedTask.rewriteStyleId ?? undefined,
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

      const article = await loadTaskArticle(claimedTask);
      const manualRequired = needsManualAffiliateReview(article.diagnostics);

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
            status: (manualRequired
              ? "manual_required"
              : "succeeded") satisfies TaskStatus,
            progress: 100,
            currentStep: finishedStepText({
              manualRequired,
              offerExtraction: "pending",
            }),
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
          currentStep: finishedStepText({
            manualRequired,
            offerExtraction: "success",
          }),
        });
      } catch (offerError) {
        console.error("Server offer extraction failed:", offerError);
        await updateTask(taskId, {
          progress: 100,
          currentStep: finishedStepText({
            manualRequired,
            offerExtraction: "failed",
          }),
        });
      }
    } catch (error) {
      await failTask(taskId, error);
    }
  } finally {
    runningTaskIds.delete(taskId);
  }
}
