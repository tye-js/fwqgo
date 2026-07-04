import { and, eq, inArray, sql } from "drizzle-orm";
import * as cheerio from "cheerio";

import RewriteArticle from "@/langchain/rewrite-article";
import {
  contentToArticleMarkdown,
  htmlToArticleMarkdown,
  normalizeArticleHtml,
} from "@fwqgo/core/content";
import { slugify } from "@fwqgo/core/utils";
import {
  createPostRecordInTransaction,
  getErrorMessage,
  prepareArticleContentForStorage,
} from "@/server/posts/create-post-record";
import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  aiTaskSteps,
  postTags,
  posts,
  sourceMaterials,
} from "@fwqgo/db/schema";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { importServerOffersFromPost } from "@/server/offers/server-offers";
import {
  scrapeArticleWithOptions,
  type ScrapedArticle,
  type ScrapeDiagnostics,
} from "@fwqgo/scrape/article-scraper";
import {
  repairMarkdownAffiliateLinks,
  rewriteAffiliateLinks,
} from "@fwqgo/scrape/affiliate-link-rewriter";
import {
  generateEnglishArticleContent,
  generateEnglishMetadata,
  getAiRewriteContentLimit,
} from "@fwqgo/ai/article-rewriter";
import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import { shortenMarkdownOutboundLinks } from "@/server/links/outbound-short-link";

const runningTaskIds = new Set<number>();
const MAX_AI_MARKDOWN_INPUT_LENGTH = 14_000;

type TaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "manual_required";

type StepStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped"
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

async function updateSourceMaterialStatus(
  task: typeof aiRewriteTasks.$inferSelect,
  status: string,
) {
  if (!task.sourceMaterialId) {
    return;
  }

  await db
    .update(sourceMaterials)
    .set({ status, updatedAt: new Date() })
    .where(eq(sourceMaterials.id, task.sourceMaterialId));
}

async function upsertTaskStep(input: {
  taskId: number;
  attempt: number;
  stepKey: string;
  stepName: string;
  status: StepStatus;
  progress: number;
  message?: string | null;
  error?: string | null;
  payload?: unknown;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}) {
  const now = new Date();
  const payload =
    typeof input.payload === "undefined" ? null : JSON.stringify(input.payload);

  await db
    .insert(aiTaskSteps)
    .values({
      taskId: input.taskId,
      attempt: input.attempt,
      stepKey: input.stepKey,
      stepName: input.stepName,
      status: input.status,
      progress: input.progress,
      message: input.message ?? null,
      error: input.error ?? null,
      payload,
      startedAt: input.startedAt ?? (input.status === "running" ? now : null),
      finishedAt:
        input.finishedAt ??
        (["success", "failed", "skipped", "manual_required"].includes(
          input.status,
        )
          ? now
          : null),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [aiTaskSteps.taskId, aiTaskSteps.stepKey, aiTaskSteps.attempt],
      set: {
        stepName: input.stepName,
        status: input.status,
        progress: input.progress,
        message: input.message ?? null,
        error: input.error ?? null,
        payload,
        startedAt: input.startedAt ?? (input.status === "running" ? now : null),
        finishedAt:
          input.finishedAt ??
          (["success", "failed", "skipped", "manual_required"].includes(
            input.status,
          )
            ? now
            : null),
        updatedAt: now,
      },
    });
}

async function failTask(
  task: typeof aiRewriteTasks.$inferSelect,
  error: unknown,
  failedStep?: {
    key: string;
    name: string;
    attempt: number;
    progress: number;
  },
) {
  if (failedStep) {
    await upsertTaskStep({
      taskId: task.id,
      attempt: failedStep.attempt,
      stepKey: failedStep.key,
      stepName: failedStep.name,
      status: "failed",
      progress: failedStep.progress,
      error: getErrorMessage(error),
    });
  }

  await updateTask(task.id, {
    status: "failed",
    progress: 100,
    currentStep: "处理失败",
    error: getErrorMessage(error),
    finishedAt: new Date(),
  });
  await updateSourceMaterialStatus(task, "failed");
}

function needsManualAffiliateReview(diagnostics: ScrapeDiagnostics) {
  const report = diagnostics.affiliateReport;
  return (
    (report?.unmatchedLinks.length ?? 0) + (report?.invalidLinks.length ?? 0) >
    0
  );
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
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

async function getTaskAiInputMaxLength(styleId?: number | null) {
  const config = await getActiveAiRewriteConfig(styleId ?? undefined);
  return config
    ? getAiRewriteContentLimit(config.maxTokens)
    : MAX_AI_MARKDOWN_INPUT_LENGTH;
}

async function getUniqueEnglishArticleSlug(
  baseSlug: string,
  excludePostId?: number,
) {
  const normalizedBaseSlug = slugify(baseSlug) || "server-deal";

  for (let index = 0; index < 20; index += 1) {
    const candidate =
      index === 0 ? normalizedBaseSlug : `${normalizedBaseSlug}-${index + 1}`;
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.slug, candidate),
          excludePostId ? sql`${posts.id} <> ${excludePostId}` : sql`true`,
        ),
      )
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  return excludePostId
    ? `${normalizedBaseSlug}-${excludePostId}`
    : `${normalizedBaseSlug}-${Date.now()}`;
}

async function createEnglishSeoTask(input: {
  parentTask: typeof aiRewriteTasks.$inferSelect;
  post: { id: number; title: string };
  rewrittenChineseContent: string;
}) {
  const sourceUrl = `post://${input.post.id}/english`;
  const sourceSnapshot = input.rewrittenChineseContent.trim().slice(0, 60_000);
  if (!sourceSnapshot) {
    throw new Error("英文 SEO 任务缺少改写后的中文正文");
  }

  const [existing] = await db
    .select({ id: aiRewriteTasks.id, status: aiRewriteTasks.status })
    .from(aiRewriteTasks)
    .where(
      and(
        eq(aiRewriteTasks.sourceType, "english"),
        eq(aiRewriteTasks.sourceUrl, sourceUrl),
        inArray(aiRewriteTasks.status, ["pending", "running", "succeeded"]),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.status === "running") {
      return existing.id;
    }

    await db
      .update(aiRewriteTasks)
      .set({
        status: "pending",
        progress: 0,
        currentStep: "等待翻译中文改写正文并生成英文 SEO",
        error: null,
        sourceTitle: input.post.title,
        sourceContent: sourceSnapshot,
        resultTitle: input.post.title,
        scrapedHtml: sourceSnapshot,
        aiInputLength: null,
        rewriteOutputLength: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(aiRewriteTasks.id, existing.id));

    return existing.id;
  }

  const [task] = await db
    .insert(aiRewriteTasks)
    .values({
      sourceMaterialId: null,
      sourceUrl,
      sourceType: "english",
      sourceTitle: input.post.title,
      sourceContent: sourceSnapshot,
      status: "pending",
      progress: 0,
      currentStep: "等待翻译中文改写正文并生成英文 SEO",
      categoryId: input.parentTask.categoryId,
      rewriteStyleId: input.parentTask.rewriteStyleId,
      postId: input.post.id,
      resultTitle: input.post.title,
      scrapedHtml: sourceSnapshot,
    })
    .returning({ id: aiRewriteTasks.id });

  if (!task) {
    throw new Error("英文 SEO 任务创建失败");
  }

  return task.id;
}

async function getEnglishSourceContent(
  claimedTask: typeof aiRewriteTasks.$inferSelect,
  postContent: string | null,
) {
  for (const value of [
    claimedTask.sourceContent,
    postContent,
    claimedTask.scrapedHtml,
  ]) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function getEnglishParentPostId(
  claimedTask: typeof aiRewriteTasks.$inferSelect,
) {
  const match = /^post:\/\/(\d+)\/english$/.exec(claimedTask.sourceUrl);
  const parsed = match?.[1] ? Number.parseInt(match[1], 10) : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : claimedTask.postId;
}

async function syncPostTagsFromSource(input: {
  sourcePostId: number;
  targetPostId: number;
}) {
  const sourceTags = await db
    .select({ tagId: postTags.tagId })
    .from(postTags)
    .where(eq(postTags.postId, input.sourcePostId));

  await db.transaction(async (tx) => {
    await tx.delete(postTags).where(eq(postTags.postId, input.targetPostId));

    if (sourceTags.length > 0) {
      await tx.insert(postTags).values(
        sourceTags.map((tag) => ({
          postId: input.targetPostId,
          tagId: tag.tagId,
        })),
      );
    }
  });
}

async function upsertEnglishDraftPost(input: {
  parentPost: {
    id: number;
    categoryId: number;
    imgUrl: string | null;
    recommendedTagName: string | null;
    recommendedTagId: number | null;
  };
  existingPostId: number | null;
  title: string;
  slug: string;
  description: string;
  keywords: string[];
  content: string;
}) {
  const [existingByTask] = input.existingPostId
    ? await db
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(eq(posts.id, input.existingPostId), eq(posts.language, "en")),
        )
        .limit(1)
    : [];
  const [existingBySource] = existingByTask
    ? []
    : await db
        .select({ id: posts.id })
        .from(posts)
        .where(
          and(
            eq(posts.translationSourcePostId, input.parentPost.id),
            eq(posts.language, "en"),
          ),
        )
        .limit(1);
  const [existingBySlug] =
    existingByTask || existingBySource
      ? []
      : await db
          .select({ id: posts.id })
          .from(posts)
          .where(and(eq(posts.slug, input.slug), eq(posts.language, "en")))
          .limit(1);
  const existingPostId =
    existingByTask?.id ?? existingBySource?.id ?? existingBySlug?.id ?? null;
  const slug = await getUniqueEnglishArticleSlug(
    input.slug,
    existingPostId ?? undefined,
  );
  const storedContent = await prepareArticleContentForStorage(input.content);
  const keywords = input.keywords.join(",");

  const [post] = existingPostId
    ? await db
        .update(posts)
        .set({
          title: input.title,
          slug,
          description: input.description,
          keywords,
          content: storedContent,
          imgUrl: input.parentPost.imgUrl,
          enTitle: null,
          enSlug: null,
          enDescription: null,
          enKeywords: null,
          enContent: null,
          enImgUrl: null,
          enUpdatedAt: null,
          language: "en",
          translationSourcePostId: input.parentPost.id,
          categoryId: input.parentPost.categoryId,
          recommendedTagName: input.parentPost.recommendedTagName,
          recommendedTagId: input.parentPost.recommendedTagId,
          published: false,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, existingPostId))
        .returning({ id: posts.id, title: posts.title, slug: posts.slug })
    : await db
        .insert(posts)
        .values({
          title: input.title,
          slug,
          description: input.description,
          keywords,
          content: storedContent,
          imgUrl: input.parentPost.imgUrl,
          language: "en",
          translationSourcePostId: input.parentPost.id,
          categoryId: input.parentPost.categoryId,
          recommendedTagName: input.parentPost.recommendedTagName,
          recommendedTagId: input.parentPost.recommendedTagId,
          published: false,
          affiliateReviewStatus: "pending",
        })
        .returning({ id: posts.id, title: posts.title, slug: posts.slug });

  if (!post) {
    throw new Error("英文草稿保存失败");
  }

  await syncPostTagsFromSource({
    sourcePostId: input.parentPost.id,
    targetPostId: post.id,
  });
  await syncImageReferencesForPost(post.id);

  return post;
}

async function runEnglishSeoTask(
  claimedTask: typeof aiRewriteTasks.$inferSelect,
) {
  const attempt = claimedTask.attempts;
  let activeStep = {
    key: "english_generate",
    name: "生成英文正文",
    attempt,
    progress: 20,
  };

  try {
    if (!claimedTask.postId) {
      throw new Error("英文 SEO 任务缺少关联草稿文章");
    }

    const parentPostId = getEnglishParentPostId(claimedTask);
    if (!parentPostId) {
      throw new Error("英文 SEO 任务缺少关联中文草稿");
    }

    const [post] = await db
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        keywords: posts.keywords,
        content: posts.content,
        imgUrl: posts.imgUrl,
        categoryId: posts.categoryId,
        recommendedTagName: posts.recommendedTagName,
        recommendedTagId: posts.recommendedTagId,
        enSlug: posts.enSlug,
      })
      .from(posts)
      .where(eq(posts.id, parentPostId))
      .limit(1);

    if (!post) {
      throw new Error("关联草稿文章不存在");
    }

    const englishSourceContent = await getEnglishSourceContent(
      claimedTask,
      post.content,
    );
    if (!englishSourceContent) {
      throw new Error(
        "英文 SEO 任务缺少改写后的中文正文，请重新运行中文改写任务",
      );
    }

    const markdownInput = contentToArticleMarkdown(englishSourceContent, {
      maxLength: await getTaskAiInputMaxLength(claimedTask.rewriteStyleId),
    });

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_generate",
      stepName: "生成英文正文",
      status: "running",
      progress: 25,
      message: markdownInput.truncated
        ? `正在翻译中文改写正文，Markdown 输入 ${markdownInput.markdown.length} 字符，已截断`
        : `正在翻译中文改写正文，Markdown 输入 ${markdownInput.markdown.length} 字符`,
    });
    await updateTask(claimedTask.id, {
      progress: 35,
      currentStep: "生成英文正文",
      resultTitle: post.title,
      scrapedTitle: post.title,
      scrapedDescription: post.description,
      scrapedHtml: englishSourceContent.slice(0, 60_000),
      aiInputLength: markdownInput.markdown.length,
    });

    const generatedEnglishContent = await generateEnglishArticleContent(
      {
        title: post.title,
        description: post.description,
        keywords: post.keywords,
        markdownContent: markdownInput.markdown,
      },
      { styleId: claimedTask.rewriteStyleId ?? undefined },
    );
    const enContent = await shortenMarkdownOutboundLinks(
      generatedEnglishContent,
    );

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_generate",
      stepName: "生成英文正文",
      status: "success",
      progress: 58,
      message: `英文输出 ${enContent.length} 字符`,
      payload: {
        markdownInputLength: markdownInput.markdown.length,
        markdownInputTruncated: markdownInput.truncated,
      },
    });

    activeStep = {
      key: "english_metadata",
      name: "生成英文 SEO 信息",
      attempt,
      progress: 68,
    };
    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_metadata",
      stepName: "生成英文 SEO 信息",
      status: "running",
      progress: 68,
      message: "正在单独生成英文标题、slug、摘要和关键词",
    });
    await updateTask(claimedTask.id, {
      progress: 68,
      currentStep: "生成英文 SEO 信息",
      rewriteOutputLength: enContent.length,
    });

    const english = await generateEnglishMetadata(
      {
        title: post.title,
        description: post.description,
        keywords: post.keywords,
        enContent,
      },
      { styleId: claimedTask.rewriteStyleId ?? undefined },
    );
    const existingEnglishPostId =
      claimedTask.postId && claimedTask.postId !== post.id
        ? claimedTask.postId
        : null;
    const englishPost = await upsertEnglishDraftPost({
      parentPost: post,
      existingPostId: existingEnglishPostId,
      title: english.enTitle,
      slug: english.enSlug,
      description: english.enDescription,
      keywords: english.enKeywords,
      content: enContent,
    });

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_metadata",
      stepName: "生成英文 SEO 信息",
      status: "success",
      progress: 78,
      message: `英文标题：${english.enTitle}`,
      payload: {
        enTitle: english.enTitle,
        enSlug: englishPost.slug,
        enKeywords: english.enKeywords,
      },
    });

    activeStep = {
      key: "english_save",
      name: "写入英文草稿",
      attempt,
      progress: 82,
    };
    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_save",
      stepName: "写入英文草稿",
      status: "running",
      progress: 82,
      message: "正在写入文章英文 SEO 字段",
    });
    await updateTask(claimedTask.id, {
      progress: 82,
      currentStep: "写入英文 SEO 草稿",
      rewriteOutputLength: enContent.length,
    });

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_save",
      stepName: "写入英文草稿",
      status: "success",
      progress: 100,
      message: `英文草稿已单独生成：/posts/edit/post/${englishPost.slug}`,
      payload: { postId: englishPost.id, enSlug: englishPost.slug },
    });
    await updateTask(claimedTask.id, {
      status: "succeeded",
      progress: 100,
      currentStep: "英文 SEO 版本已生成",
      resultTitle: english.enTitle,
      postId: englishPost.id,
      diagnostics: JSON.stringify({
        sourceHost: "english-seo",
        strategy: "english-seo-version",
        usedAiRewrite: true,
        aiInputLength: markdownInput.markdown.length,
        rewriteOutputLength: enContent.length,
        markdownInputLength: markdownInput.markdown.length,
        markdownInputTruncated: markdownInput.truncated,
        sourceHtmlLength: markdownInput.document.sourceHtmlLength,
        semanticBlockCount: markdownInput.document.blocks.length,
        warnings: markdownInput.truncated
          ? ["英文生成使用的中文 Markdown 输入过长，已按正文结构截断"]
          : [],
      }),
      finishedAt: new Date(),
    });
  } catch (error) {
    await failTask(claimedTask, error, activeStep);
  }
}

async function createArticleFromManualTask(input: {
  sourceTitle: string | null;
  sourceContent: string | null;
  sourceUrl: string;
  rewriteStyleId?: number;
  aiInputMaxLength: number;
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
  const markdownInput = htmlToArticleMarkdown(cleanedHtml, {
    maxLength: input.aiInputMaxLength,
  });
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
    aiInputLength: markdownInput.markdown.length,
    aiInputTruncated: markdownInput.truncated,
    removedSelectors: [],
    affiliateReport,
    warnings: markdownInput.truncated
      ? ["AI Markdown 输入过长，已按正文结构截取前半部分核心内容改写"]
      : [],
  };

  try {
    const rewritten = await RewriteArticle(markdownInput.markdown, {
      styleId: input.rewriteStyleId,
    });
    const repairedMarkdown = repairMarkdownAffiliateLinks(
      rewritten.markdownContent,
      affiliateReport,
    );
    diagnostics.usedAiRewrite = true;
    diagnostics.rewriteOutputLength = repairedMarkdown.length;

    return {
      title: rewritten.title || sourceTitle,
      content: repairedMarkdown,
      htmlContent: repairedMarkdown,
      cleanedHtmlContent: cleanedHtml,
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
      cleanedHtmlContent: cleanedHtml,
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
  const aiInputMaxLength = await getTaskAiInputMaxLength(
    claimedTask.rewriteStyleId,
  );

  if (
    claimedTask.sourceType === "text" ||
    claimedTask.sourceType === "email" ||
    claimedTask.sourceType === "file"
  ) {
    return createArticleFromManualTask({
      sourceTitle: claimedTask.sourceTitle,
      sourceContent: claimedTask.sourceContent,
      sourceUrl: claimedTask.sourceUrl,
      rewriteStyleId: claimedTask.rewriteStyleId ?? undefined,
      aiInputMaxLength,
    });
  }

  return scrapeArticleWithOptions({
    url: claimedTask.sourceUrl,
    rewriteStyleId: claimedTask.rewriteStyleId ?? undefined,
    aiInputMaxLength,
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

    if (claimedTask.sourceType === "english") {
      await runEnglishSeoTask(claimedTask);
      return;
    }

    await updateSourceMaterialStatus(claimedTask, "running");
    const attempt = claimedTask.attempts;
    const sourceStep = {
      key: "source_collect",
      name: "抓取/读取素材",
      attempt,
      progress: 20,
    };
    let activeStep = sourceStep;

    try {
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: sourceStep.key,
        stepName: sourceStep.name,
        status: "running",
        progress: sourceStep.progress,
        message: "正在读取素材并准备正文",
      });
      await updateTask(taskId, {
        progress: 35,
        currentStep: "抓取文章并执行 AI 改写",
      });

      const article = await loadTaskArticle(claimedTask);
      const manualRequired = needsManualAffiliateReview(article.diagnostics);

      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: sourceStep.key,
        stepName: sourceStep.name,
        status: "success",
        progress: 30,
        message: `素材读取完成，正文 ${article.diagnostics.contentLength} 字`,
        payload: {
          strategy: article.diagnostics.strategy,
          usedPuppeteer: article.diagnostics.usedPuppeteer,
          usedFallback: article.diagnostics.usedFallback,
        },
      });
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "html_clean",
        stepName: "清洗正文结构",
        status: "success",
        progress: 45,
        message: `清洗后正文 ${article.diagnostics.cleanedHtmlLength ?? article.cleanedHtmlContent.length} 字符，AI Markdown 输入 ${article.diagnostics.aiInputLength ?? "-"} 字符`,
        payload: {
          removedSelectors: article.diagnostics.removedSelectors,
          aiInputTruncated: article.diagnostics.aiInputTruncated,
        },
      });
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "affiliate_check",
        stepName: "识别商户与返利链接",
        status: manualRequired ? "manual_required" : "success",
        progress: 58,
        message: article.diagnostics.affiliateReport
          ? `命中 ${article.diagnostics.affiliateReport.matchedLinks.length} 条，未命中 ${article.diagnostics.affiliateReport.unmatchedLinks.length} 条，无效 ${article.diagnostics.affiliateReport.invalidLinks.length} 条`
          : "没有返利链接诊断",
      });
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "ai_rewrite",
        stepName: "AI 改写文章",
        status: article.diagnostics.usedAiRewrite ? "success" : "skipped",
        progress: 72,
        message: article.diagnostics.usedAiRewrite
          ? `AI 输出 ${article.diagnostics.rewriteOutputLength ?? article.htmlContent.length} 字符`
          : (article.diagnostics.aiRewriteError ??
            "AI 未改写，使用原始采集内容"),
      });
      activeStep = {
        key: "save_draft",
        name: "保存草稿",
        attempt,
        progress: 82,
      };
      await updateTask(taskId, {
        progress: 82,
        currentStep: "保存为草稿文章",
        resultTitle: article.title,
        scrapedTitle: article.diagnostics.scrapedTitle ?? article.title,
        scrapedDescription:
          article.diagnostics.scrapedDescription ?? article.description,
        scrapedHtml: article.cleanedHtmlContent.slice(0, 60_000),
        aiInputLength: article.diagnostics.aiInputLength ?? null,
        rewriteOutputLength:
          article.diagnostics.rewriteOutputLength ?? article.htmlContent.length,
        diagnostics: JSON.stringify(article.diagnostics),
      });

      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "save_draft",
        stepName: "保存草稿",
        status: "running",
        progress: 82,
        message: "正在写入文章草稿",
      });

      const post = claimedTask.postId
        ? {
            id: claimedTask.postId,
            title: claimedTask.resultTitle ?? article.title,
          }
        : await db.transaction(async (tx) => {
            const result = await createPostRecordInTransaction(
              {
                post: {
                  title: article.title || "未命名采集文章",
                  description:
                    article.description || article.title || "待补充摘要",
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

            return result.data;
          });

      if (!post) {
        throw new Error("草稿保存失败");
      }

      const [updatedTask] = await db
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
          postId: post.id,
          resultTitle: post.title,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiRewriteTasks.id, taskId))
        .returning({ id: aiRewriteTasks.id });

      if (!updatedTask) {
        throw new Error("任务状态更新失败");
      }

      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "save_draft",
        stepName: "保存草稿",
        status: "success",
        progress: 90,
        message: claimedTask.postId
          ? `已复用草稿文章 #${post.id}`
          : `已生成草稿文章 #${post.id}`,
        payload: { postId: post.id, title: post.title },
      });
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "image_references",
        stepName: "同步图片引用",
        status: "running",
        progress: 92,
        message: "正在同步文章图片引用",
      });
      activeStep = {
        key: "image_references",
        name: "同步图片引用",
        attempt,
        progress: 92,
      };
      await syncImageReferencesForPost(post.id);
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "image_references",
        stepName: "同步图片引用",
        status: "success",
        progress: 94,
        message: "图片引用同步完成",
      });

      let offerExtractionStatus: "pending" | "success" | "failed" = "pending";
      try {
        activeStep = {
          key: "offer_extract",
          name: "提取服务器套餐",
          attempt,
          progress: 96,
        };
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "offer_extract",
          stepName: "提取服务器套餐",
          status: "running",
          progress: 96,
          message: "正在从草稿内容提取套餐数据",
        });
        await importServerOffersFromPost(post.id, { revalidate: false });
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "offer_extract",
          stepName: "提取服务器套餐",
          status: "success",
          progress: 100,
          message: "套餐提取完成",
        });
        await updateTask(taskId, {
          progress: 100,
          currentStep: finishedStepText({
            manualRequired,
            offerExtraction: "success",
          }),
        });
        offerExtractionStatus = "success";
      } catch (offerError) {
        console.error("Server offer extraction failed:", offerError);
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "offer_extract",
          stepName: "提取服务器套餐",
          status: "failed",
          progress: 100,
          message: "草稿已保存，但套餐提取失败",
          error: getErrorMessage(offerError),
        });
        await updateTask(taskId, {
          progress: 100,
          currentStep: finishedStepText({
            manualRequired,
            offerExtraction: "failed",
          }),
        });
        offerExtractionStatus = "failed";
      }
      try {
        const englishTaskId = await createEnglishSeoTask({
          parentTask: claimedTask,
          post,
          rewrittenChineseContent: article.htmlContent || article.content,
        });
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "english_enqueue",
          stepName: "派生英文 SEO 任务",
          status: "success",
          progress: 100,
          message: `英文 SEO 任务已创建 #${englishTaskId}`,
          payload: { taskId: englishTaskId, postId: post.id },
        });
        await updateTask(taskId, {
          currentStep: `${finishedStepText({
            manualRequired,
            offerExtraction: offerExtractionStatus,
          })}，英文 SEO 任务已创建`,
        });
        await enqueueAiRewriteTask(englishTaskId);
      } catch (englishTaskError) {
        console.error("English SEO task creation failed:", englishTaskError);
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "english_enqueue",
          stepName: "派生英文 SEO 任务",
          status: "failed",
          progress: 100,
          message: "中文草稿已保存，但英文 SEO 任务创建失败",
          error: getErrorMessage(englishTaskError),
        });
      }
      await updateSourceMaterialStatus(
        claimedTask,
        manualRequired ? "manual_required" : "succeeded",
      );
    } catch (error) {
      await failTask(claimedTask, error, activeStep);
    }
  } finally {
    runningTaskIds.delete(taskId);
  }
}
