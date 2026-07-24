import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import * as cheerio from "cheerio";

import RewriteArticle from "@/langchain/rewrite-article";
import {
  contentToArticleMarkdown,
  htmlToArticleMarkdown,
  normalizeArticleHtml,
} from "@fwqgo/core/content";
import { parsePostgresIntegerId, slugify } from "@fwqgo/core/utils";
import {
  createTaskLeaseOwner,
  getTaskLeaseExpiry,
  TASK_LEASE_HEARTBEAT_MS,
  TaskLeaseLostError,
} from "@fwqgo/core/task-lease";
import { structuredLog } from "@fwqgo/core/structured-log";
import {
  createPostRecordInTransaction,
  getErrorMessage,
  prepareArticleContentForStorage,
} from "@/server/posts/create-post-record";
import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  aiTaskSteps,
  categories,
  postTags,
  posts,
  sourceMaterials,
  tags,
} from "@fwqgo/db/schema";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { enqueueArticleCoverGenerationTask } from "@/server/images/cover-generation-task-runner";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import {
  scrapeArticleWithOptions,
  type ArticleProcessingProgress,
  type ScrapedArticle,
  type ScrapeDiagnostics,
} from "@/server/scrape/article-scraper";
import {
  getMatchedAffiliateProviderNames,
  repairMarkdownAffiliateLinks,
  rewriteAffiliateLinks,
} from "@/server/links/affiliate-link-rewriter";
import {
  generateEnglishArticleContent,
  generateEnglishMetadata,
  generateArticleMetadata,
  getAiRewriteContentLimit,
  type ArticleRewriteProgress,
  type EnglishMetadataOutput,
} from "@fwqgo/ai/article-rewriter";
import { applyEnglishTaxonomyToPost } from "@fwqgo/ai/english-taxonomy";
import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import { getActiveImageGenerationConfig } from "@/server/images/generation-config";
import { shortenMarkdownOutboundLinks } from "@/server/links/outbound-short-link";

const runningTaskIds = new Set<number>();
const runningTaskLeaseOwners = new Map<number, string>();
const MAX_AI_MARKDOWN_INPUT_LENGTH = 14_000;

function normalizeCoverUrlForLanguageCheck(value: string | null | undefined) {
  if (!value) return "";

  try {
    return decodeURIComponent(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function isGeneratedCoverForLanguage(
  value: string | null | undefined,
  language: "zh" | "en",
) {
  return normalizeCoverUrlForLanguageCheck(value).includes(
    `-${language}-cover.`,
  );
}

function getReusableEnglishCoverUrl(
  existingImgUrl: string | null,
  parentImgUrl: string | null,
) {
  if (!existingImgUrl) return null;
  if (parentImgUrl && existingImgUrl === parentImgUrl) return null;
  if (isGeneratedCoverForLanguage(existingImgUrl, "zh")) return null;

  return existingImgUrl;
}

function shouldForceEnglishCoverGeneration(input: {
  englishImgUrl: string | null;
  parentImgUrl: string | null;
}) {
  if (!input.englishImgUrl) return true;
  if (input.parentImgUrl && input.englishImgUrl === input.parentImgUrl) {
    return true;
  }

  return isGeneratedCoverForLanguage(input.englishImgUrl, "zh");
}

type TaskStatus =
  "pending" | "running" | "succeeded" | "failed" | "manual_required";

type StepStatus =
  "pending" | "running" | "success" | "failed" | "skipped" | "manual_required";

type ActiveTaskStep = {
  key: string;
  name: string;
  attempt: number;
  progress: number;
  payload?: unknown;
};

function getArticleRewriteProgress(input: {
  stage: ArticleRewriteProgress["stage"];
  status: ArticleRewriteProgress["status"];
  attempt?: ArticleRewriteProgress["attempt"];
}) {
  if (input.stage === "fact_extraction") {
    return input.status === "running" ? 54 : 56;
  }

  if (input.stage === "metadata_generation") {
    return input.status === "running" ? 78 : 80;
  }

  const attempt = Math.max(1, Math.min(Math.trunc(input.attempt ?? 1), 3));
  const attemptBase = 58 + (attempt - 1) * 6;
  if (input.stage === "content_generation") {
    return attemptBase + (input.status === "running" ? 0 : 2);
  }

  return attemptBase + (input.status === "running" ? 3 : 5);
}

async function updateTask(
  taskId: number,
  values: Partial<typeof aiRewriteTasks.$inferInsert>,
) {
  const leaseOwner = runningTaskLeaseOwners.get(taskId);
  if (!leaseOwner) throw new TaskLeaseLostError();

  const updated = await db
    .update(aiRewriteTasks)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(aiRewriteTasks.id, taskId),
        eq(aiRewriteTasks.status, "running"),
        eq(aiRewriteTasks.leaseOwner, leaseOwner),
      ),
    )
    .returning({ id: aiRewriteTasks.id });

  if (updated.length === 0) throw new TaskLeaseLostError();
}

async function renewAiTaskLease(task: typeof aiRewriteTasks.$inferSelect) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();
  const now = new Date();
  const renewed = await db
    .update(aiRewriteTasks)
    .set({
      heartbeatAt: now,
      leaseExpiresAt: getTaskLeaseExpiry(now),
      updatedAt: now,
    })
    .where(
      and(
        eq(aiRewriteTasks.id, task.id),
        eq(aiRewriteTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning({ id: aiRewriteTasks.id });
  if (renewed.length === 0) throw new TaskLeaseLostError();
}

async function finalizeTask(
  task: typeof aiRewriteTasks.$inferSelect,
  status: Exclude<TaskStatus, "pending" | "running">,
  values: Partial<typeof aiRewriteTasks.$inferInsert>,
) {
  const leaseOwner = runningTaskLeaseOwners.get(task.id);
  if (!leaseOwner || leaseOwner !== task.leaseOwner) return false;

  const now = new Date();
  return db.transaction(async (tx) => {
    const [updatedTask] = await tx
      .update(aiRewriteTasks)
      .set({ ...values, status, updatedAt: now })
      .where(
        and(
          eq(aiRewriteTasks.id, task.id),
          eq(aiRewriteTasks.status, "running"),
          eq(aiRewriteTasks.leaseOwner, leaseOwner),
        ),
      )
      .returning({ id: aiRewriteTasks.id });

    if (!updatedTask) return false;

    if (task.sourceMaterialId) {
      await tx
        .update(sourceMaterials)
        .set({ status, updatedAt: now })
        .where(eq(sourceMaterials.id, task.sourceMaterialId));
    }

    return true;
  });
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
  const isTerminal = [
    "success",
    "failed",
    "skipped",
    "manual_required",
  ].includes(input.status);
  const startedAt =
    input.startedAt ?? (input.status === "running" ? now : null);
  const finishedAt = isTerminal ? (input.finishedAt ?? now) : null;
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
      startedAt,
      finishedAt,
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
        startedAt: sql`coalesce(${aiTaskSteps.startedAt}, excluded."startedAt")`,
        finishedAt,
        updatedAt: now,
      },
    });
}

async function failTask(
  task: typeof aiRewriteTasks.$inferSelect,
  error: unknown,
  failedStep?: ActiveTaskStep,
) {
  if (failedStep) {
    try {
      await upsertTaskStep({
        taskId: task.id,
        attempt: failedStep.attempt,
        stepKey: failedStep.key,
        stepName: failedStep.name,
        status: "failed",
        progress: failedStep.progress,
        error: getErrorMessage(error),
        payload: failedStep.payload,
      });
    } catch (stepError) {
      structuredLog("error", "ai.task_failure_step_persist_failed", {
        taskId: task.id,
        stepKey: failedStep.key,
        attempt: failedStep.attempt,
        error: stepError,
      });
    }
  }

  const finalized = await finalizeTask(task, "failed", {
    progress: 100,
    currentStep: "处理失败",
    error: getErrorMessage(error),
    finishedAt: new Date(),
  });

  if (!finalized) {
    structuredLog("warn", "ai.task_failure_ignored_after_lease_loss", {
      taskId: task.id,
      leaseOwner: task.leaseOwner,
      error,
    });
  }
}

function needsManualAffiliateReview(diagnostics: ScrapeDiagnostics) {
  const report = diagnostics.affiliateReport;
  return (report?.invalidLinks.length ?? 0) > 0;
}

function finishedStepText(input: { manualRequired: boolean }) {
  const reviewText = input.manualRequired ? "，存在无效链接，需人工审核" : "";
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

async function bindTaskConfigs(task: typeof aiRewriteTasks.$inferSelect) {
  const rewriteConfig = task.rewriteStyleId
    ? await getActiveAiRewriteConfig(task.rewriteStyleId)
    : task.rewriteConfigName || task.rewriteProvider || task.rewriteModel
      ? null
      : await getActiveAiRewriteConfig();

  if (!rewriteConfig) {
    throw new Error(
      task.rewriteStyleId
        ? `任务绑定的 AI 改写配置 #${task.rewriteStyleId} 已停用或不存在，请启用原配置后重试`
        : task.rewriteConfigName || task.rewriteProvider || task.rewriteModel
          ? "任务绑定的 AI 改写配置已被删除，请重新创建任务"
          : "当前没有可用的默认 AI 改写配置",
    );
  }

  const needsImageConfig = task.sourceType !== "seo";
  const imageConfig = !needsImageConfig
    ? null
    : task.imageConfigId
      ? await getActiveImageGenerationConfig(task.imageConfigId)
      : task.imageConfigName || task.imageProvider || task.imageModel
        ? null
        : await getActiveImageGenerationConfig();

  if (
    needsImageConfig &&
    !imageConfig &&
    (task.imageConfigId ||
      task.imageConfigName ||
      task.imageProvider ||
      task.imageModel)
  ) {
    throw new Error(
      task.imageConfigId
        ? `任务绑定的生图配置 #${task.imageConfigId} 已停用或不存在，请启用原配置后重试`
        : "任务绑定的生图配置已被删除，请重新创建任务",
    );
  }

  const [boundTask] = await db
    .update(aiRewriteTasks)
    .set({
      rewriteStyleId: rewriteConfig.id,
      rewriteConfigName: rewriteConfig.name,
      rewriteProvider: rewriteConfig.provider,
      rewriteModel: rewriteConfig.model,
      rewriteMaxTokens: rewriteConfig.maxTokens,
      imageConfigId: imageConfig?.id ?? null,
      imageConfigName: imageConfig?.name ?? null,
      imageProvider: imageConfig?.provider ?? null,
      imageModel: imageConfig?.model ?? null,
      updatedAt: new Date(),
    })
    .where(
      task.leaseOwner
        ? and(
            eq(aiRewriteTasks.id, task.id),
            eq(aiRewriteTasks.leaseOwner, task.leaseOwner),
          )
        : eq(aiRewriteTasks.id, task.id),
    )
    .returning();

  if (!boundTask) {
    throw new Error("AI 任务配置绑定失败");
  }

  return boundTask;
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

    const [reusedTask] = await db
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
        rewriteStyleId: input.parentTask.rewriteStyleId,
        rewriteConfigName: input.parentTask.rewriteConfigName,
        rewriteProvider: input.parentTask.rewriteProvider,
        rewriteModel: input.parentTask.rewriteModel,
        rewriteMaxTokens: input.parentTask.rewriteMaxTokens,
        imageConfigId: input.parentTask.imageConfigId,
        imageConfigName: input.parentTask.imageConfigName,
        imageProvider: input.parentTask.imageProvider,
        imageModel: input.parentTask.imageModel,
        aiInputLength: null,
        rewriteOutputLength: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiRewriteTasks.id, existing.id),
          ne(aiRewriteTasks.status, "running"),
        ),
      )
      .returning({ id: aiRewriteTasks.id });

    return reusedTask?.id ?? existing.id;
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
      rewriteConfigName: input.parentTask.rewriteConfigName,
      rewriteProvider: input.parentTask.rewriteProvider,
      rewriteModel: input.parentTask.rewriteModel,
      rewriteMaxTokens: input.parentTask.rewriteMaxTokens,
      imageConfigId: input.parentTask.imageConfigId,
      imageConfigName: input.parentTask.imageConfigName,
      imageProvider: input.parentTask.imageProvider,
      imageModel: input.parentTask.imageModel,
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
  const parsed = parsePostgresIntegerId(match?.[1]);

  return parsed ?? claimedTask.postId;
}

function uniqueTagNames(tagNames: string[]) {
  const seenSlugs = new Set<string>();
  const result: Array<{ name: string; slug: string }> = [];

  for (const value of tagNames) {
    const name = value.trim();
    const slug = slugify(name);

    if (!name || !slug || seenSlugs.has(slug)) {
      continue;
    }

    seenSlugs.add(slug);
    result.push({ name, slug });
  }

  return result;
}

async function ensureTagRowsByName(tagNames: string[]) {
  const normalizedTags = uniqueTagNames(tagNames);
  const tagRows: Array<{ id: number; name: string; slug: string }> = [];

  for (const tag of normalizedTags) {
    const [existingTag] = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .where(or(eq(tags.slug, tag.slug), eq(tags.name, tag.name)))
      .limit(1);

    if (existingTag) {
      tagRows.push(existingTag);
      continue;
    }

    const [insertedTag] = await db
      .insert(tags)
      .values({ name: tag.name, slug: tag.slug })
      .onConflictDoNothing()
      .returning({ id: tags.id, name: tags.name, slug: tags.slug });

    if (insertedTag) {
      tagRows.push(insertedTag);
      continue;
    }

    const [createdByConcurrentTask] = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .where(or(eq(tags.slug, tag.slug), eq(tags.name, tag.name)))
      .limit(1);

    if (createdByConcurrentTask) {
      tagRows.push(createdByConcurrentTask);
    }
  }

  return tagRows;
}

async function replacePostTagsByNames(postId: number, tagNames: string[]) {
  const tagRows = await ensureTagRowsByName(tagNames);

  await db.transaction(async (tx) => {
    await tx.delete(postTags).where(eq(postTags.postId, postId));

    if (tagRows.length > 0) {
      await tx
        .insert(postTags)
        .values(
          tagRows.map((tag) => ({
            postId,
            tagId: tag.id,
          })),
        )
        .onConflictDoNothing();
    }
  });

  return tagRows;
}

async function enqueueCoverForDraftPost(input: {
  taskId: number;
  attempt: number;
  stepKey: string;
  stepName: string;
  progress: number;
  postId: number;
  language: "zh" | "en";
  configId?: number | null;
  force?: boolean;
}) {
  if (!input.configId) {
    await upsertTaskStep({
      taskId: input.taskId,
      attempt: input.attempt,
      stepKey: input.stepKey,
      stepName: input.stepName,
      status: "skipped",
      progress: input.progress,
      message: "任务创建时没有可用的生图配置，已跳过自动封面",
    });
    return { status: "skipped" as const, url: null };
  }

  const [post] = await db
    .select({
      id: posts.id,
      title: posts.title,
      imgUrl: posts.imgUrl,
    })
    .from(posts)
    .where(eq(posts.id, input.postId))
    .limit(1);

  if (!post) {
    await upsertTaskStep({
      taskId: input.taskId,
      attempt: input.attempt,
      stepKey: input.stepKey,
      stepName: input.stepName,
      status: "failed",
      progress: input.progress,
      message: "草稿已保存，但没有找到文章记录，无法生成封面图",
    });
    return { status: "failed" as const, url: null };
  }

  if (post.imgUrl && !input.force) {
    await upsertTaskStep({
      taskId: input.taskId,
      attempt: input.attempt,
      stepKey: input.stepKey,
      stepName: input.stepName,
      status: "skipped",
      progress: input.progress,
      message: "文章已有封面图，跳过自动生图",
      payload: { postId: post.id, url: post.imgUrl },
    });
    return { status: "skipped" as const, url: post.imgUrl };
  }

  try {
    const { task, reused } = await enqueueArticleCoverGenerationTask({
      batchId: `ai-rewrite-${input.taskId}-${input.language}-cover`,
      postId: post.id,
      title: post.title,
      configId: input.configId,
      createdBy: null,
      restartTerminal:
        input.force === true || post.imgUrl == null || post.imgUrl.length === 0,
    });

    await upsertTaskStep({
      taskId: input.taskId,
      attempt: input.attempt,
      stepKey: input.stepKey,
      stepName: input.stepName,
      status: "success",
      progress: input.progress,
      message:
        input.language === "en"
          ? `英文封面任务已${reused ? "复用" : "加入"}独立队列 #${task.id}`
          : `中文封面任务已${reused ? "复用" : "加入"}独立队列 #${task.id}`,
      payload: {
        postId: post.id,
        language: input.language,
        coverTaskId: task.id,
        batchId: task.batchId,
        status: task.status,
        reused,
      },
    });

    return {
      status: "queued" as const,
      coverTaskId: task.id,
      batchId: task.batchId,
    };
  } catch (error) {
    structuredLog("error", "ai.cover_enqueue_failed", {
      taskId: input.taskId,
      postId: input.postId,
      error,
    });
    await upsertTaskStep({
      taskId: input.taskId,
      attempt: input.attempt,
      stepKey: input.stepKey,
      stepName: input.stepName,
      status: "failed",
      progress: input.progress,
      message: "草稿已保存，但自动封面任务入队失败",
      error: getErrorMessage(error),
      payload: {
        postId: post.id,
        language: input.language,
      },
    });

    return { status: "failed" as const, coverTaskId: null, batchId: null };
  }
}

async function upsertEnglishDraftPost(input: {
  parentPost: {
    id: number;
    categoryId: number;
    imgUrl: string | null;
  };
  existingPostId: number | null;
  title: string;
  slug: string;
  description: string;
  keywords: string[];
  content: string;
  metadata: EnglishMetadataOutput;
}) {
  const [existingByTask] = input.existingPostId
    ? await db
        .select({ id: posts.id, imgUrl: posts.imgUrl, slug: posts.slug })
        .from(posts)
        .where(
          and(eq(posts.id, input.existingPostId), eq(posts.language, "en")),
        )
        .limit(1)
    : [];
  const [existingBySource] = existingByTask
    ? []
    : await db
        .select({ id: posts.id, imgUrl: posts.imgUrl, slug: posts.slug })
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
          .select({ id: posts.id, imgUrl: posts.imgUrl, slug: posts.slug })
          .from(posts)
          .where(and(eq(posts.slug, input.slug), eq(posts.language, "en")))
          .limit(1);
  const existingPost = existingByTask ?? existingBySource ?? existingBySlug;
  const existingPostId = existingPost?.id ?? null;
  const existingImgUrl = existingPost?.imgUrl ?? null;
  const reusableEnglishImgUrl = getReusableEnglishCoverUrl(
    existingImgUrl,
    input.parentPost.imgUrl,
  );
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
          imgUrl: reusableEnglishImgUrl,
          language: "en",
          translationSourcePostId: input.parentPost.id,
          categoryId: input.parentPost.categoryId,
          recommendedTagName: null,
          recommendedTagId: null,
          published: false,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, existingPostId))
        .returning({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          imgUrl: posts.imgUrl,
        })
    : await db
        .insert(posts)
        .values({
          title: input.title,
          slug,
          description: input.description,
          keywords,
          content: storedContent,
          imgUrl: null,
          language: "en",
          translationSourcePostId: input.parentPost.id,
          categoryId: input.parentPost.categoryId,
          recommendedTagName: null,
          recommendedTagId: null,
          published: false,
          affiliateReviewStatus: "pending",
        })
        .returning({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          imgUrl: posts.imgUrl,
        });

  if (!post) {
    throw new Error("英文草稿保存失败");
  }

  await applyEnglishTaxonomyToPost({
    postId: post.id,
    categoryId: input.parentPost.categoryId,
    metadata: input.metadata,
  });

  return { ...post, previousSlug: existingPost?.slug ?? null };
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
        categoryName: categories.name,
        categorySlug: categories.slug,
        categoryEnName: categories.enName,
        categoryEnSlug: categories.enSlug,
      })
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
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
      message: "正在生成英文标题、分类、标签和 SEO 元信息",
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
        category: {
          name: post.categoryName,
          slug: post.categorySlug,
          enName: post.categoryEnName,
          enSlug: post.categoryEnSlug,
        },
      },
      { styleId: claimedTask.rewriteStyleId ?? undefined },
    );
    const existingEnglishPostId =
      claimedTask.postId && claimedTask.postId !== post.id
        ? claimedTask.postId
        : null;
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
        enSlug: english.enSlug,
        enKeywords: english.enKeywords,
        enCategoryName: english.enCategoryName,
        enCategorySlug: english.enCategorySlug,
        enTags: english.enTags,
        enRecommendTagName: english.enRecommendTagName,
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

    await renewAiTaskLease(claimedTask);
    const englishPost = await upsertEnglishDraftPost({
      parentPost: post,
      existingPostId: existingEnglishPostId,
      title: english.enTitle,
      slug: english.enSlug,
      description: english.enDescription,
      keywords: english.enKeywords,
      content: enContent,
      metadata: english,
    });
    await updateTask(claimedTask.id, {
      progress: 88,
      currentStep: "英文草稿已保存，正在执行后续处理",
      resultTitle: englishPost.title,
      postId: englishPost.id,
    });
    schedulePublicWebCache("post.changed", {
      postIds: [englishPost.id],
      postSlugs: englishPost.previousSlug
        ? [englishPost.previousSlug, englishPost.slug]
        : [englishPost.slug],
      categoryIds: [post.categoryId],
    });

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_save",
      stepName: "写入英文草稿",
      status: "success",
      progress: 88,
      message: `英文草稿已单独生成：/posts/edit/post/${encodeURIComponent(englishPost.slug)}`,
      payload: { postId: englishPost.id, enSlug: englishPost.slug },
    });

    const postProcessWarnings: string[] = [];
    const coverResult = await enqueueCoverForDraftPost({
      taskId: claimedTask.id,
      attempt,
      stepKey: "english_cover",
      stepName: "自动生成英文封面",
      progress: 92,
      postId: englishPost.id,
      language: "en",
      configId: claimedTask.imageConfigId,
      force: shouldForceEnglishCoverGeneration({
        englishImgUrl: englishPost.imgUrl,
        parentImgUrl: post.imgUrl,
      }),
    });
    if (coverResult.status === "failed") {
      postProcessWarnings.push("英文封面任务入队失败");
    }

    activeStep = {
      key: "english_image_references",
      name: "同步英文图片引用",
      attempt,
      progress: 94,
    };
    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: activeStep.key,
      stepName: activeStep.name,
      status: "running",
      progress: activeStep.progress,
      message: "正在同步英文文章图片引用",
    });
    try {
      await syncImageReferencesForPost(englishPost.id);
      await upsertTaskStep({
        taskId: claimedTask.id,
        attempt,
        stepKey: activeStep.key,
        stepName: activeStep.name,
        status: "success",
        progress: 96,
        message: "英文文章图片引用同步完成",
      });
    } catch (error) {
      structuredLog("error", "ai.english_image_references_sync_failed", {
        taskId: claimedTask.id,
        postId: englishPost.id,
        error,
      });
      await upsertTaskStep({
        taskId: claimedTask.id,
        attempt,
        stepKey: activeStep.key,
        stepName: activeStep.name,
        status: "failed",
        progress: 96,
        message: "英文草稿已保存，但图片引用索引同步失败",
        error: getErrorMessage(error),
      });
      postProcessWarnings.push("英文图片引用索引同步失败");
    }

    activeStep = {
      key: "english_finalize",
      name: "完成英文任务",
      attempt,
      progress: 98,
    };
    const finalized = await finalizeTask(claimedTask, "succeeded", {
      progress: 100,
      currentStep:
        postProcessWarnings.length > 0
          ? `英文 SEO 版本已生成；${postProcessWarnings.join("；")}`
          : "英文 SEO 版本已生成",
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
        warnings: [
          ...(markdownInput.truncated
            ? ["英文生成使用的中文 Markdown 输入过长，已按正文结构截断"]
            : []),
          ...postProcessWarnings,
        ],
      }),
      finishedAt: new Date(),
    });
    if (!finalized) throw new TaskLeaseLostError();
  } catch (error) {
    await failTask(claimedTask, error, activeStep);
  }
}

async function runSeoMetadataTask(
  claimedTask: typeof aiRewriteTasks.$inferSelect,
) {
  const attempt = claimedTask.attempts;
  let activeStep = {
    key: "seo_metadata",
    name: "生成文章 SEO",
    attempt,
    progress: 35,
  };

  try {
    if (!claimedTask.postId) {
      throw new Error("SEO 更新任务缺少文章 ID");
    }

    const [post] = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        description: posts.description,
        keywords: posts.keywords,
        content: posts.content,
        categoryId: posts.categoryId,
        categoryName: categories.name,
        categorySlug: categories.slug,
        categoryEnName: categories.enName,
        categoryEnSlug: categories.enSlug,
        language: posts.language,
      })
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .where(eq(posts.id, claimedTask.postId))
      .limit(1);

    if (!post) {
      throw new Error("文章不存在或已被删除");
    }

    const sourceContent = claimedTask.sourceContent?.trim() ?? post.content;
    const markdownInput = contentToArticleMarkdown(sourceContent, {
      maxLength: await getTaskAiInputMaxLength(claimedTask.rewriteStyleId),
    });

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "seo_prepare",
      stepName: "准备 SEO 输入",
      status: "success",
      progress: 25,
      message: markdownInput.truncated
        ? `正文 Markdown 输入 ${markdownInput.markdown.length} 字符，已截断`
        : `正文 Markdown 输入 ${markdownInput.markdown.length} 字符`,
      payload: {
        language: post.language,
        markdownInputLength: markdownInput.markdown.length,
        markdownInputTruncated: markdownInput.truncated,
      },
    });

    await updateTask(claimedTask.id, {
      progress: 35,
      currentStep: "生成文章 SEO",
      resultTitle: post.title,
      scrapedTitle: post.title,
      scrapedDescription: post.description,
      scrapedHtml: sourceContent.slice(0, 60_000),
      aiInputLength: markdownInput.markdown.length,
    });

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "seo_metadata",
      stepName: post.language === "en" ? "生成英文 SEO" : "生成中文 SEO",
      status: "running",
      progress: 45,
      message:
        post.language === "en"
          ? "正在生成英文标题、分类、标签和 SEO 元信息"
          : "正在生成中文标题、摘要、关键词和标签",
    });

    const isEnglishPost = post.language === "en";
    const updateResult = isEnglishPost
      ? await (async () => {
          const metadata = await generateEnglishMetadata(
            {
              title: post.title,
              description: post.description,
              keywords: post.keywords,
              enContent: markdownInput.markdown,
              category: {
                name: post.categoryName,
                slug: post.categorySlug,
                enName: post.categoryEnName,
                enSlug: post.categoryEnSlug,
              },
            },
            { styleId: claimedTask.rewriteStyleId ?? undefined },
          );
          await renewAiTaskLease(claimedTask);
          const nextSlug = await getUniqueEnglishArticleSlug(
            metadata.enSlug || metadata.enTitle,
            post.id,
          );
          const [updatedPost] = await db
            .update(posts)
            .set({
              title: metadata.enTitle,
              slug: nextSlug,
              description: metadata.enDescription,
              keywords: metadata.enKeywords.join(","),
              updatedAt: new Date(),
            })
            .where(eq(posts.id, post.id))
            .returning({
              id: posts.id,
              title: posts.title,
              slug: posts.slug,
              categoryId: posts.categoryId,
            });
          const taxonomy = updatedPost
            ? await applyEnglishTaxonomyToPost({
                postId: post.id,
                categoryId: post.categoryId,
                metadata,
              })
            : null;

          return {
            updatedPost,
            title: metadata.enTitle,
            slug: nextSlug,
            description: metadata.enDescription,
            keywords: metadata.enKeywords,
            tagCount: taxonomy?.tags.length ?? null,
          };
        })()
      : await (async () => {
          const metadata = await generateArticleMetadata(
            { markdownContent: markdownInput.markdown },
            { styleId: claimedTask.rewriteStyleId ?? undefined },
          );
          await renewAiTaskLease(claimedTask);
          const nextSlug = await getUniqueEnglishArticleSlug(
            metadata.title,
            post.id,
          );
          const tagRows = await replacePostTagsByNames(post.id, [
            metadata.recommendTagName,
            ...metadata.tagsName,
          ]);
          const recommendedTagSlug = slugify(metadata.recommendTagName);
          const recommendedTag =
            tagRows.find((tag) => tag.slug === recommendedTagSlug) ?? null;
          const [updatedPost] = await db
            .update(posts)
            .set({
              title: metadata.title,
              slug: nextSlug,
              description: metadata.description,
              keywords: metadata.keywords.join(","),
              recommendedTagName:
                recommendedTag?.name ?? metadata.recommendTagName,
              recommendedTagId: recommendedTag?.id ?? null,
              updatedAt: new Date(),
            })
            .where(eq(posts.id, post.id))
            .returning({
              id: posts.id,
              title: posts.title,
              slug: posts.slug,
              categoryId: posts.categoryId,
            });

          return {
            updatedPost,
            title: metadata.title,
            slug: nextSlug,
            description: metadata.description,
            keywords: metadata.keywords,
            tagCount: tagRows.length,
          };
        })();

    if (!updateResult.updatedPost) {
      throw new Error("文章 SEO 写入失败");
    }

    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "seo_metadata",
      stepName: isEnglishPost ? "生成英文 SEO" : "生成中文 SEO",
      status: "success",
      progress: 78,
      message: `SEO 标题：${updateResult.title}`,
      payload: {
        slug: updateResult.slug,
        description: updateResult.description,
        keywords: updateResult.keywords,
        tagCount: updateResult.tagCount,
      },
    });

    activeStep = {
      key: "seo_save",
      name: "写入文章 SEO",
      attempt,
      progress: 88,
    };
    await upsertTaskStep({
      taskId: claimedTask.id,
      attempt,
      stepKey: "seo_save",
      stepName: "写入文章 SEO",
      status: "success",
      progress: 95,
      message: `已更新文章 #${post.id}`,
      payload: {
        postId: post.id,
        oldSlug: post.slug,
        newSlug: updateResult.slug,
      },
    });

    schedulePublicWebCache("post.changed", {
      postIds: [post.id],
      postSlugs: [post.slug, updateResult.slug],
      categoryIds: [post.categoryId],
    });

    activeStep = {
      key: "seo_finalize",
      name: "完成 SEO 任务",
      attempt,
      progress: 98,
    };
    const finalized = await finalizeTask(claimedTask, "succeeded", {
      progress: 100,
      currentStep: "文章 SEO 已更新",
      resultTitle: updateResult.title,
      postId: post.id,
      rewriteOutputLength: updateResult.description.length,
      diagnostics: JSON.stringify({
        sourceHost: "post-seo",
        strategy: isEnglishPost ? "english-post-seo" : "chinese-post-seo",
        usedAiRewrite: true,
        aiInputLength: markdownInput.markdown.length,
        rewriteOutputLength: updateResult.description.length,
        markdownInputLength: markdownInput.markdown.length,
        markdownInputTruncated: markdownInput.truncated,
        sourceHtmlLength: markdownInput.document.sourceHtmlLength,
        semanticBlockCount: markdownInput.document.blocks.length,
        warnings: markdownInput.truncated
          ? ["SEO 生成使用的 Markdown 输入过长，已按正文结构截断"]
          : [],
      }),
      finishedAt: new Date(),
    });
    if (!finalized) throw new TaskLeaseLostError();
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
  onProgress?: (progress: ArticleProcessingProgress) => void | Promise<void>;
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
  const progressSnapshot = () => ({
    title: sourceTitle,
    description: diagnostics.scrapedDescription ?? "",
    cleanedHtmlContent: cleanedHtml,
    diagnostics,
  });
  await input.onProgress?.({
    stage: "content_prepared",
    snapshot: progressSnapshot(),
  });

  let rewritten: Awaited<ReturnType<typeof RewriteArticle>>;
  try {
    rewritten = await RewriteArticle(markdownInput.markdown, {
      styleId: input.rewriteStyleId,
      providerNames: getMatchedAffiliateProviderNames(affiliateReport),
      onProgress: async (ai) => {
        await input.onProgress?.({
          stage: "ai_progress",
          snapshot: progressSnapshot(),
          ai,
        });
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    diagnostics.aiRewriteError = message;
    await input.onProgress?.({
      stage: "ai_failed",
      snapshot: progressSnapshot(),
      error: message,
    });
    throw error;
  }
  const repairedMarkdown = repairMarkdownAffiliateLinks(
    rewritten.markdownContent,
    affiliateReport,
  );
  diagnostics.usedAiRewrite = true;
  diagnostics.rewriteOutputLength = repairedMarkdown.length;
  diagnostics.rewriteQuality = rewritten.quality;

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
}

async function loadTaskArticle(
  claimedTask: typeof aiRewriteTasks.$inferSelect,
  onProgress?: (progress: ArticleProcessingProgress) => void | Promise<void>,
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
      onProgress,
    });
  }

  return scrapeArticleWithOptions({
    url: claimedTask.sourceUrl,
    rewriteStyleId: claimedTask.rewriteStyleId ?? undefined,
    aiInputMaxLength,
    onProgress,
  });
}

export async function enqueueAiRewriteTask(taskId: number) {
  if (!Number.isInteger(taskId) || taskId <= 0) return;
  await ensureAiRewriteWorker();
}

async function getNextPendingAiRewriteTaskId() {
  const [task] = await db
    .select({ id: aiRewriteTasks.id })
    .from(aiRewriteTasks)
    .where(eq(aiRewriteTasks.status, "pending"))
    .orderBy(aiRewriteTasks.createdAt, aiRewriteTasks.id)
    .limit(1);

  return task?.id ?? null;
}

async function recoverInterruptedAiRewriteTasks() {
  const now = new Date();
  const recoveredTasks = await db.transaction(async (tx) => {
    const rows = await tx
      .update(aiRewriteTasks)
      .set({
        status: "pending",
        progress: 0,
        currentStep: "检测到上次执行中断，已自动重新排队",
        error: null,
        startedAt: null,
        finishedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiRewriteTasks.status, "running"),
          or(
            isNull(aiRewriteTasks.leaseExpiresAt),
            lt(aiRewriteTasks.leaseExpiresAt, now),
          ),
        ),
      )
      .returning({
        id: aiRewriteTasks.id,
        sourceMaterialId: aiRewriteTasks.sourceMaterialId,
      });
    const sourceMaterialIds = [
      ...new Set(
        rows
          .map((row) => row.sourceMaterialId)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];

    if (sourceMaterialIds.length > 0) {
      await tx
        .update(sourceMaterials)
        .set({ status: "queued", updatedAt: now })
        .where(inArray(sourceMaterials.id, sourceMaterialIds));
    }

    return rows;
  });

  if (recoveredTasks.length > 0) {
    structuredLog("warn", "ai.tasks_recovered", {
      count: recoveredTasks.length,
      taskIds: recoveredTasks.map((task) => task.id),
    });
  }
}

async function runAiRewriteWorker() {
  await recoverInterruptedAiRewriteTasks();

  while (true) {
    const taskId = await getNextPendingAiRewriteTaskId();
    if (!taskId) return;
    await runAiRewriteTask(taskId);
  }
}

export async function ensureAiRewriteWorker() {
  await enqueueAdminBackgroundJob({
    key: "ai-rewrite-worker",
    label: "AI rewrite worker",
    run: runAiRewriteWorker,
  });
}

export async function runAiRewriteTask(taskId: number) {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) return;
  if (runningTaskIds.has(taskId)) return;
  runningTaskIds.add(taskId);

  let leaseHeartbeat: ReturnType<typeof setInterval> | null = null;
  let leaseOwner: string | null = null;
  let leaseHeartbeatRunning = false;
  let leaseLost = false;

  try {
    leaseOwner = createTaskLeaseOwner("ai-rewrite");
    const claimedAt = new Date();
    let [claimedTask] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(aiRewriteTasks)
        .set({
          status: "running",
          progress: 10,
          currentStep: "准备抓取",
          error: null,
          startedAt: claimedAt,
          finishedAt: null,
          attempts: sql`${aiRewriteTasks.attempts} + 1`,
          leaseOwner,
          leaseExpiresAt: getTaskLeaseExpiry(claimedAt),
          heartbeatAt: claimedAt,
          updatedAt: claimedAt,
        })
        .where(
          and(
            eq(aiRewriteTasks.id, taskId),
            inArray(aiRewriteTasks.status, ["pending", "failed"]),
          ),
        )
        .returning();
      const task = rows[0];

      if (task?.sourceMaterialId) {
        await tx
          .update(sourceMaterials)
          .set({ status: "running", updatedAt: claimedAt })
          .where(eq(sourceMaterials.id, task.sourceMaterialId));
      }

      return rows;
    });

    if (!claimedTask) {
      return;
    }

    const leasedTask = claimedTask;
    runningTaskLeaseOwners.set(taskId, leaseOwner);
    leaseHeartbeat = setInterval(() => {
      if (leaseHeartbeatRunning || leaseLost) return;
      leaseHeartbeatRunning = true;
      void renewAiTaskLease(leasedTask)
        .catch((error) => {
          if (error instanceof TaskLeaseLostError) leaseLost = true;
          structuredLog("error", "ai.task_heartbeat_failed", {
            taskId,
            leaseOwner,
            error,
          });
        })
        .finally(() => {
          leaseHeartbeatRunning = false;
        });
    }, TASK_LEASE_HEARTBEAT_MS);
    leaseHeartbeat.unref?.();

    try {
      claimedTask = await bindTaskConfigs(claimedTask);
      await upsertTaskStep({
        taskId: claimedTask.id,
        attempt: claimedTask.attempts,
        stepKey: "config_bind",
        stepName: "绑定 AI 配置",
        status: "success",
        progress: 10,
        message: claimedTask.imageConfigId
          ? `改写：${claimedTask.rewriteConfigName ?? `#${claimedTask.rewriteStyleId}`}；生图：${claimedTask.imageConfigName ?? `#${claimedTask.imageConfigId}`}`
          : `改写：${claimedTask.rewriteConfigName ?? `#${claimedTask.rewriteStyleId}`}；未配置自动生图`,
        payload: {
          rewrite: {
            id: claimedTask.rewriteStyleId,
            name: claimedTask.rewriteConfigName,
            provider: claimedTask.rewriteProvider,
            model: claimedTask.rewriteModel,
            maxTokens: claimedTask.rewriteMaxTokens,
          },
          image: claimedTask.imageConfigId
            ? {
                id: claimedTask.imageConfigId,
                name: claimedTask.imageConfigName,
                provider: claimedTask.imageProvider,
                model: claimedTask.imageModel,
              }
            : null,
        },
      });
    } catch (error) {
      await failTask(claimedTask, error, {
        key: "config_bind",
        name: "绑定 AI 配置",
        attempt: claimedTask.attempts,
        progress: 10,
      });
      return;
    }

    if (claimedTask.sourceType === "seo") {
      await runSeoMetadataTask(claimedTask);
      return;
    }

    if (claimedTask.sourceType === "english") {
      await runEnglishSeoTask(claimedTask);
      return;
    }

    const attempt = claimedTask.attempts;
    const sourceStep = {
      key: "source_collect",
      name: "抓取/读取素材",
      attempt,
      progress: 20,
    };
    const aiStep = {
      key: "ai_rewrite",
      name: "AI 改写文章",
      attempt,
      progress: 54,
    };
    let activeStep: ActiveTaskStep = sourceStep;

    const persistArticleProgress = async (event: ArticleProcessingProgress) => {
      const snapshot = event.snapshot;
      const diagnostics = JSON.stringify(snapshot.diagnostics);
      const commonTaskValues: Partial<typeof aiRewriteTasks.$inferInsert> = {
        scrapedTitle: snapshot.title,
        scrapedDescription: snapshot.description,
        scrapedHtml: snapshot.cleanedHtmlContent.slice(0, 60_000),
        aiInputLength: snapshot.diagnostics.aiInputLength ?? null,
        diagnostics,
      };

      if (event.stage === "content_prepared") {
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: sourceStep.key,
          stepName: sourceStep.name,
          status: "success",
          progress: 30,
          message: `素材读取完成，正文 ${snapshot.diagnostics.contentLength} 字`,
          payload: {
            strategy: snapshot.diagnostics.strategy,
            usedPuppeteer: snapshot.diagnostics.usedPuppeteer,
            usedFallback: snapshot.diagnostics.usedFallback,
          },
        });
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "html_clean",
          stepName: "清洗正文结构",
          status: "success",
          progress: 45,
          message: `清洗后正文 ${snapshot.diagnostics.cleanedHtmlLength ?? snapshot.cleanedHtmlContent.length} 字符，AI Markdown 输入 ${snapshot.diagnostics.aiInputLength ?? "-"} 字符`,
          payload: {
            removedSelectors: snapshot.diagnostics.removedSelectors,
            aiInputTruncated: snapshot.diagnostics.aiInputTruncated,
          },
        });
        const affiliateReport = snapshot.diagnostics.affiliateReport;
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "affiliate_check",
          stepName: "识别商户与返利链接",
          status:
            affiliateReport.invalidLinks.length > 0
              ? "manual_required"
              : "success",
          progress: 58,
          message: `命中 ${affiliateReport.matchedLinks.length} 条，未命中 ${affiliateReport.unmatchedLinks.length} 条，无效 ${affiliateReport.invalidLinks.length} 条`,
        });
        activeStep = aiStep;
        await updateTask(taskId, {
          ...commonTaskValues,
          progress: 50,
          currentStep: "正文已清洗，准备执行 AI 改写",
        });
        return;
      }

      if (event.stage === "ai_failed") {
        await updateTask(taskId, {
          ...commonTaskValues,
          currentStep: `AI 改写失败：${event.error}`,
          error: event.error,
        });
        return;
      }

      const progress = getArticleRewriteProgress(event.ai);
      const payload = {
        stage: event.ai.stage,
        status: event.ai.status,
        attempt: event.ai.attempt ?? null,
        maxTokens: event.ai.maxTokens,
        inputLength: event.ai.inputLength ?? null,
        outputLength: event.ai.outputLength ?? null,
      };
      activeStep = {
        ...aiStep,
        progress,
        payload,
      };
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: aiStep.key,
        stepName: aiStep.name,
        status: "running",
        progress,
        message: event.ai.message,
        payload,
      });
      const taskValues: Partial<typeof aiRewriteTasks.$inferInsert> = {
        ...commonTaskValues,
        progress,
        currentStep: `AI 改写：${event.ai.message}`,
      };
      if (
        event.ai.stage === "content_generation" &&
        event.ai.status === "success" &&
        typeof event.ai.outputLength === "number"
      ) {
        taskValues.rewriteOutputLength = event.ai.outputLength;
      }
      await updateTask(taskId, taskValues);
    };

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

      const article = await loadTaskArticle(
        claimedTask,
        persistArticleProgress,
      );
      const manualRequired = needsManualAffiliateReview(article.diagnostics);

      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: sourceStep.key,
        stepName: sourceStep.name,
        status: "success",
        progress: 30,
        message: `素材读取完成，清洗正文 ${article.diagnostics.cleanedHtmlLength ?? article.cleanedHtmlContent.length} 字`,
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
        progress: 80,
        message: article.diagnostics.usedAiRewrite
          ? article.diagnostics.rewriteQuality
            ? `AI 输出 ${article.diagnostics.rewriteOutputLength ?? article.htmlContent.length} 字符；原创度 ${article.diagnostics.rewriteQuality.originalityScore}%；事实覆盖 ${article.diagnostics.rewriteQuality.criticalFactCoverage}%；${article.diagnostics.rewriteQuality.attempts} 轮通过`
            : `AI 输出 ${article.diagnostics.rewriteOutputLength ?? article.htmlContent.length} 字符`
          : (article.diagnostics.aiRewriteError ??
            "AI 未改写，使用原始采集内容"),
        payload: article.diagnostics.rewriteQuality
          ? {
              promptVersion: article.diagnostics.rewriteQuality.promptVersion,
              originalityScore:
                article.diagnostics.rewriteQuality.originalityScore,
              criticalFactCoverage:
                article.diagnostics.rewriteQuality.criticalFactCoverage,
              factualScore: article.diagnostics.rewriteQuality.factualScore,
              attempts: article.diagnostics.rewriteQuality.attempts,
              knowledgeReferences:
                article.diagnostics.rewriteQuality.knowledgeReferences,
              providerReferences:
                article.diagnostics.rewriteQuality.providerReferences,
            }
          : undefined,
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

      await renewAiTaskLease(claimedTask);
      const reusedDraft = claimedTask.postId !== null;
      const taskLeaseOwner = claimedTask.leaseOwner;
      if (!taskLeaseOwner) throw new TaskLeaseLostError();

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

            const [checkpointedTask] = await tx
              .update(aiRewriteTasks)
              .set({
                progress: 88,
                currentStep: "草稿已保存，正在执行后续处理",
                postId: result.data.id,
                resultTitle: result.data.title,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(aiRewriteTasks.id, taskId),
                  eq(aiRewriteTasks.status, "running"),
                  eq(aiRewriteTasks.leaseOwner, taskLeaseOwner),
                ),
              )
              .returning({ id: aiRewriteTasks.id });

            if (!checkpointedTask) throw new TaskLeaseLostError();
            return result.data;
          });

      if (!post) {
        throw new Error("草稿保存失败");
      }

      if (reusedDraft) {
        await updateTask(taskId, {
          progress: 88,
          currentStep: "已找到上次保存的草稿，正在继续后续处理",
          postId: post.id,
          resultTitle: post.title,
        });
      }

      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: "save_draft",
        stepName: "保存草稿",
        status: "success",
        progress: 90,
        message: reusedDraft
          ? `已复用草稿文章 #${post.id}`
          : `已生成草稿文章 #${post.id}`,
        payload: { postId: post.id, title: post.title },
      });

      const postProcessWarnings: string[] = [];
      const coverResult = await enqueueCoverForDraftPost({
        taskId,
        attempt,
        stepKey: "cover_generate",
        stepName: "自动生成中文封面",
        progress: 91,
        postId: post.id,
        language: "zh",
        configId: claimedTask.imageConfigId,
      });
      if (coverResult.status === "failed") {
        postProcessWarnings.push("中文封面任务入队失败");
      }

      activeStep = {
        key: "image_references",
        name: "同步图片引用",
        attempt,
        progress: 92,
      };
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: activeStep.key,
        stepName: activeStep.name,
        status: "running",
        progress: activeStep.progress,
        message: "正在同步文章图片引用",
      });
      try {
        await syncImageReferencesForPost(post.id);
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: activeStep.key,
          stepName: activeStep.name,
          status: "success",
          progress: 94,
          message: "图片引用同步完成",
        });
      } catch (error) {
        structuredLog("error", "ai.image_references_sync_failed", {
          taskId,
          postId: post.id,
          error,
        });
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: activeStep.key,
          stepName: activeStep.name,
          status: "failed",
          progress: 94,
          message: "中文草稿已保存，但图片引用索引同步失败",
          error: getErrorMessage(error),
        });
        postProcessWarnings.push("图片引用索引同步失败");
      }

      activeStep = {
        key: "offer_source",
        name: "套餐数据来源",
        attempt,
        progress: 96,
      };
      await upsertTaskStep({
        taskId,
        attempt,
        stepKey: activeStep.key,
        stepName: activeStep.name,
        status: "success",
        progress: activeStep.progress,
        message: "文章不再提取套餐；套餐由供应商官网采集并单独审核",
        payload: { source: "provider_catalog", postId: post.id },
      });
      let englishTaskId: number | null = null;
      try {
        englishTaskId = await createEnglishSeoTask({
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
          progress: 98,
          message: `英文 SEO 任务已创建 #${englishTaskId}`,
          payload: { taskId: englishTaskId, postId: post.id },
        });
        await enqueueAiRewriteTask(englishTaskId);
      } catch (englishTaskError) {
        structuredLog("error", "ai.english_task_enqueue_failed", {
          taskId,
          postId: post.id,
          error: englishTaskError,
        });
        await upsertTaskStep({
          taskId,
          attempt,
          stepKey: "english_enqueue",
          stepName: "派生英文 SEO 任务",
          status: "failed",
          progress: 98,
          message: "中文草稿已保存，但英文 SEO 任务创建或入队失败",
          error: getErrorMessage(englishTaskError),
        });
        postProcessWarnings.push("英文 SEO 任务创建或入队失败");
      }

      activeStep = {
        key: "task_finalize",
        name: "完成改写任务",
        attempt,
        progress: 99,
      };
      const completionParts = [finishedStepText({ manualRequired })];
      if (englishTaskId) {
        completionParts.push(`英文 SEO 任务已创建 #${englishTaskId}`);
      }
      completionParts.push(...postProcessWarnings);
      const terminalStatus = manualRequired ? "manual_required" : "succeeded";
      const finalized = await finalizeTask(claimedTask, terminalStatus, {
        progress: 100,
        currentStep: completionParts.join("；"),
        postId: post.id,
        resultTitle: post.title,
        diagnostics: JSON.stringify({
          ...article.diagnostics,
          warnings: [...article.diagnostics.warnings, ...postProcessWarnings],
        }),
        finishedAt: new Date(),
      });
      if (!finalized) throw new TaskLeaseLostError();
    } catch (error) {
      await failTask(claimedTask, error, activeStep);
    }
  } finally {
    if (leaseHeartbeat) clearInterval(leaseHeartbeat);
    if (leaseOwner) {
      try {
        await db
          .update(aiRewriteTasks)
          .set({
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(aiRewriteTasks.id, taskId),
              eq(aiRewriteTasks.leaseOwner, leaseOwner),
            ),
          );
      } catch (error) {
        structuredLog("error", "ai.task_lease_release_failed", {
          taskId,
          leaseOwner,
          error,
        });
      }
    }
    runningTaskLeaseOwners.delete(taskId);
    runningTaskIds.delete(taskId);
  }
}
