import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import * as cheerio from "cheerio";

import { cleanArticleNoise } from "@fwqgo/core/article-noise-cleaner";
import {
  contentToArticleMarkdown,
  normalizeArticleHtml,
} from "@fwqgo/core/content";
import { getManualEnglishSourceId } from "@/features/cms/lib/manual-article";
import { structuredLog } from "@fwqgo/core/structured-log";
import {
  createTaskLeaseOwner,
  getTaskLeaseExpiry,
  TaskLeaseLostError,
  withTaskLeaseHeartbeat,
} from "@fwqgo/core/task-lease";
import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  aiTaskSteps,
  posts,
  sourceMaterials,
} from "@fwqgo/db/schema";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { rewriteAffiliateLinks } from "@/server/links/affiliate-link-rewriter";
import {
  scrapeArticleWithOptions,
  type ScrapedArticle,
  type ScrapeDiagnostics,
} from "@/server/scrape/article-scraper";

type Task = typeof aiRewriteTasks.$inferSelect;
type StepStatus =
  "pending" | "running" | "success" | "failed" | "skipped" | "manual_required";

async function updateTask(
  task: Task,
  values: Partial<typeof aiRewriteTasks.$inferInsert>,
) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();
  const rows = await db
    .update(aiRewriteTasks)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(aiRewriteTasks.id, task.id),
        eq(aiRewriteTasks.status, "running"),
        eq(aiRewriteTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning({ id: aiRewriteTasks.id });
  if (!rows.length) throw new TaskLeaseLostError();
}

async function renewAiTaskLease(task: Task) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();
  const now = new Date();
  const rows = await db
    .update(aiRewriteTasks)
    .set({
      heartbeatAt: now,
      leaseExpiresAt: getTaskLeaseExpiry(now),
      updatedAt: now,
    })
    .where(
      and(
        eq(aiRewriteTasks.id, task.id),
        eq(aiRewriteTasks.status, "running"),
        eq(aiRewriteTasks.leaseOwner, task.leaseOwner),
      ),
    )
    .returning({ id: aiRewriteTasks.id });
  if (!rows.length) throw new TaskLeaseLostError();
}

async function finalizeTask(
  task: Task,
  status: "manual_required" | "failed",
  values: Partial<typeof aiRewriteTasks.$inferInsert>,
) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();
  const leaseOwner = task.leaseOwner;
  await db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(aiRewriteTasks)
      .set({
        ...values,
        status,
        progress: 100,
        finishedAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      })
      .where(
        and(
          eq(aiRewriteTasks.id, task.id),
          eq(aiRewriteTasks.status, "running"),
          eq(aiRewriteTasks.leaseOwner, leaseOwner),
        ),
      )
      .returning({ id: aiRewriteTasks.id });
    if (!updated) throw new TaskLeaseLostError();
    if (task.sourceMaterialId) {
      await tx
        .update(sourceMaterials)
        .set({ status, updatedAt: now })
        .where(eq(sourceMaterials.id, task.sourceMaterialId));
    }
  });
}

async function upsertTaskStep(
  task: Task,
  input: {
    key: string;
    name: string;
    status: StepStatus;
    progress: number;
    message: string;
    error?: string;
  },
) {
  const now = new Date();
  const isTerminal = [
    "success",
    "failed",
    "skipped",
    "manual_required",
  ].includes(input.status);
  const finishedAt = isTerminal ? now : null;
  const startedAt = input.status === "running" ? now : null;
  const values = {
    stepName: input.name,
    status: input.status,
    progress: input.progress,
    message: input.message,
    error: input.error ?? null,
    finishedAt,
    updatedAt: now,
  };
  await db
    .insert(aiTaskSteps)
    .values({
      ...values,
      taskId: task.id,
      attempt: task.attempts,
      stepKey: input.key,
      startedAt,
    })
    .onConflictDoUpdate({
      target: [aiTaskSteps.taskId, aiTaskSteps.stepKey, aiTaskSteps.attempt],
      set: {
        ...values,
        startedAt: sql`coalesce(${aiTaskSteps.startedAt}, excluded."startedAt")`,
      },
    });
}

async function readManualMaterial(task: Task): Promise<ScrapedArticle> {
  const source = task.sourceContent?.trim();
  if (!source) throw new Error("素材内容为空，请补充原文后重试");
  // This conversion preserves the complete source and table links. It never calls a text model.
  const cleaned = cleanArticleNoise(normalizeArticleHtml(source));
  const $ = cheerio.load(cleaned.html, null, false);
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com";
  const affiliateReport = await rewriteAffiliateLinks({
    $,
    baseUrl,
    sourceHost: new URL(baseUrl).hostname,
    removeInternal: false,
  });
  const html = $.html();
  const markdown = contentToArticleMarkdown(html).markdown;
  if (!markdown.trim()) throw new Error("素材没有可读正文");
  const title = task.sourceTitle?.trim() ?? "手动素材";
  const diagnostics: ScrapeDiagnostics = {
    sourceHost: task.sourceUrl,
    strategy: "manual-material",
    usedPuppeteer: false,
    usedFallback: false,
    usedAiRewrite: false,
    contentLength: markdown.length,
    scrapedTitle: title,
    scrapedDescription: "",
    cleanedHtmlLength: html.length,
    removedSelectors: cleaned.removedSelectors,
    removedContentPatterns: cleaned.removedContentPatterns,
    affiliateReport,
    warnings: [],
  };
  return {
    title,
    description: "",
    content: markdown,
    htmlContent: markdown,
    cleanedHtmlContent: html,
    keywords: [],
    tagsName: [],
    recommendTagName: "",
    diagnostics,
  };
}

async function prepareExistingArticle(task: Task) {
  let postId = task.postId;
  let source = task.scrapedHtml ?? task.sourceContent ?? "";
  if (task.sourceType === "english") {
    const parentId = getManualEnglishSourceId(task.sourceUrl);
    if (!parentId) throw new Error("英文任务缺少中文来源文章");
    const [parent] = await db
      .select({ id: posts.id, content: posts.content, title: posts.title })
      .from(posts)
      .where(eq(posts.id, parentId))
      .limit(1);
    if (!parent) throw new Error("中文来源文章不存在");
    const [translation] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.translationSourcePostId, parentId),
          eq(posts.language, "en"),
        ),
      )
      .limit(1);
    postId = translation?.id ?? null;
    source = parent.content;
  }
  await upsertTaskStep(task, {
    key: "manual_input",
    name: "人工填写正文与 SEO",
    status: "manual_required",
    progress: 100,
    message: postId
      ? "请打开现有文章，人工填写正文和 SEO 后保存"
      : "中文来源已准备，请人工输入英文正文和 SEO",
  });
  await finalizeTask(task, "manual_required", {
    postId,
    scrapedHtml: source,
    requestStage: "manual_required",
    error: null,
    currentStep: postId
      ? "请从文章编辑页人工维护正文与 SEO"
      : "请人工填写英文正文与 SEO 后保存草稿",
    aiInputLength: null,
    rewriteOutputLength: null,
  });
}

async function collectTaskSource(task: Task) {
  if (
    task.sourceType === "english" ||
    task.sourceType === "seo" ||
    task.postId
  ) {
    await prepareExistingArticle(task);
    return;
  }
  await upsertTaskStep(task, {
    key: "source_collect",
    name: "抓取/读取素材",
    status: "running",
    progress: 20,
    message: "正在读取素材",
  });
  const article = ["text", "email", "file"].includes(task.sourceType)
    ? await readManualMaterial(task)
    : await scrapeArticleWithOptions({ url: task.sourceUrl });
  await renewAiTaskLease(task);
  await updateTask(task, {
    scrapedTitle: article.title,
    scrapedDescription:
      article.diagnostics.scrapedDescription ?? article.description,
    scrapedHtml: article.cleanedHtmlContent,
    diagnostics: JSON.stringify(article.diagnostics),
    aiInputLength: null,
    rewriteOutputLength: null,
    currentStep: "素材已清洗，准备人工编辑",
    progress: 80,
  });
  await upsertTaskStep(task, {
    key: "source_collect",
    name: "抓取/读取素材",
    status: "success",
    progress: 40,
    message: "素材读取完成",
  });
  await upsertTaskStep(task, {
    key: "html_clean",
    name: "清洗正文结构",
    status: "success",
    progress: 70,
    message: `已保留完整清洗正文 ${article.cleanedHtmlContent.length} 个字符`,
  });
  const report = article.diagnostics.affiliateReport;
  await upsertTaskStep(task, {
    key: "affiliate_check",
    name: "识别商户与返利链接",
    status: report.invalidLinks.length ? "manual_required" : "success",
    progress: 80,
    message: `命中 ${report.matchedLinks.length} 条，未命中 ${report.unmatchedLinks.length} 条，无效 ${report.invalidLinks.length} 条`,
  });
  await upsertTaskStep(task, {
    key: "manual_input",
    name: "人工填写正文与 SEO",
    status: "manual_required",
    progress: 100,
    message:
      "请人工填写最终正文、标题、slug、摘要、关键词和标签；保存草稿后可手动点击生成封面",
  });
  await finalizeTask(task, "manual_required", {
    currentStep: "素材已准备，请人工填写正文与 SEO",
    requestStage: "manual_required",
    error: null,
  });
}

export async function runAiRewriteTask(taskId: number) {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) return;
  const leaseOwner = createTaskLeaseOwner("article-collection");
  const claimedAt = new Date();
  const task = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(aiRewriteTasks)
      .set({
        status: "running",
        progress: 10,
        currentStep: "准备读取素材",
        error: null,
        startedAt: claimedAt,
        finishedAt: null,
        requestStage: "queued",
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
    if (claimed?.sourceMaterialId) {
      await tx
        .update(sourceMaterials)
        .set({ status: "running", updatedAt: claimedAt })
        .where(eq(sourceMaterials.id, claimed.sourceMaterialId));
    }
    return claimed;
  });
  if (!task) return;
  try {
    await withTaskLeaseHeartbeat({
      renew: async () => {
        try {
          await renewAiTaskLease(task);
          return true;
        } catch (error) {
          if (error instanceof TaskLeaseLostError) return false;
          throw error;
        }
      },
      onRenewError: (error) =>
        structuredLog("error", "article.collection_heartbeat_failed", {
          taskId,
          error,
        }),
      run: async (signal) => {
        signal.throwIfAborted();
        await collectTaskSource(task);
      },
    });
  } catch (error) {
    if (error instanceof TaskLeaseLostError) return;
    structuredLog("error", "article.collection_failed", { taskId, error });
    const message = "素材读取失败，请检查来源地址和正文内容后重试";
    try {
      await renewAiTaskLease(task);
      try {
        await upsertTaskStep(task, {
          key: "source_collect",
          name: "抓取/读取素材",
          status: "failed",
          progress: 100,
          message,
          error: message,
        });
      } catch (stepError) {
        structuredLog(
          "error",
          "article.collection_failure_step_persist_failed",
          { taskId, error: stepError },
        );
      }
      await finalizeTask(task, "failed", {
        currentStep: message,
        error: message,
      });
    } catch (finalizeError) {
      if (!(finalizeError instanceof TaskLeaseLostError)) throw finalizeError;
    }
  } finally {
    try {
      await db
        .update(aiRewriteTasks)
        .set({ leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null })
        .where(
          and(
            eq(aiRewriteTasks.id, taskId),
            eq(aiRewriteTasks.leaseOwner, leaseOwner),
          ),
        );
    } catch (error) {
      structuredLog("error", "article.collection_lease_release_failed", {
        taskId,
        error,
      });
    }
  }
}

async function recoverInterruptedAiRewriteTasks() {
  const now = new Date();
  await db.transaction(async (tx) => {
    // Old AI requests may have completed upstream. Preserve their results for manual entry.
    const uncertain = await tx
      .update(aiRewriteTasks)
      .set({
        status: "manual_required",
        progress: 100,
        requestStage: "manual_required",
        currentStep: "历史 AI 请求已停止自动处理，请人工填写正文和 SEO",
        error: null,
        finishedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiRewriteTasks.status, "running"),
          inArray(aiRewriteTasks.requestStage, [
            "request_started",
            "response_received",
            "checkpointed",
            "manual_required",
          ]),
          or(
            isNull(aiRewriteTasks.leaseExpiresAt),
            lt(aiRewriteTasks.leaseExpiresAt, now),
          ),
        ),
      )
      .returning({ sourceMaterialId: aiRewriteTasks.sourceMaterialId });
    const recovered = await tx
      .update(aiRewriteTasks)
      .set({
        status: "pending",
        requestStage: "queued",
        currentStep: "素材读取中断，已重新排队",
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
          eq(aiRewriteTasks.requestStage, "queued"),
          or(
            isNull(aiRewriteTasks.leaseExpiresAt),
            lt(aiRewriteTasks.leaseExpiresAt, now),
          ),
        ),
      )
      .returning({ sourceMaterialId: aiRewriteTasks.sourceMaterialId });
    for (const [rows, status] of [
      [uncertain, "manual_required"],
      [recovered, "queued"],
    ] as const) {
      const ids = rows.flatMap((row) =>
        row.sourceMaterialId === null ? [] : [row.sourceMaterialId],
      );
      if (ids.length)
        await tx
          .update(sourceMaterials)
          .set({ status, updatedAt: now })
          .where(inArray(sourceMaterials.id, ids));
    }
  });
}

async function runAiRewriteWorker() {
  await recoverInterruptedAiRewriteTasks();
  while (true) {
    const [task] = await db
      .select({ id: aiRewriteTasks.id })
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.status, "pending"))
      .orderBy(aiRewriteTasks.createdAt, aiRewriteTasks.id)
      .limit(1);
    if (!task) return;
    await runAiRewriteTask(task.id);
  }
}

export async function ensureAiRewriteWorker() {
  await enqueueAdminBackgroundJob({
    key: "ai-rewrite-worker",
    label: "Article collection worker",
    run: runAiRewriteWorker,
  });
}

export async function enqueueAiRewriteTask(taskId: number) {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) return;
  await ensureAiRewriteWorker();
}
