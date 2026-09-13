import { and, desc, eq } from "drizzle-orm";
import * as cheerio from "cheerio";
import { z } from "zod";
import { getActiveAiRewriteConfigWithFallback } from "@fwqgo/ai/rewrite-config";
import {
  generateEnglishArticleContent,
  generateEnglishMetadata,
  type AiRewriteAuditEvent,
  type EnglishMetadataOutput,
} from "@fwqgo/ai/article-rewriter";
import { DEFAULT_ARTICLE_COVER } from "@fwqgo/core/article-cover";
import {
  contentToArticleMarkdown,
  renderArticleContentHtml,
} from "@fwqgo/core/content";
import { structuredLog } from "@fwqgo/core/structured-log";
import { TaskLeaseLostError } from "@fwqgo/core/task-lease";
import { db } from "@fwqgo/db";
import {
  aiRewriteArtifacts,
  aiRewriteTasks,
  aiTaskSteps,
  categories,
  posts,
} from "@fwqgo/db/schema";
import { createPostRecordInTransaction } from "@/server/posts/create-post-record";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { regeneratePostInternalLinks } from "@/server/posts/internal-links";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  englishTranslationSourceHash,
  type EnglishTranslationSource,
} from "./english-translation-source";

type Task = typeof aiRewriteTasks.$inferSelect;
type TaskValues = Partial<typeof aiRewriteTasks.$inferInsert>;

export class EnglishTranslationTaskError extends Error {}

export function assertTranslatedArticleStructure(
  source: string,
  translated: string,
) {
  const original = cheerio.load(renderArticleContentHtml(source));
  const english = cheerio.load(renderArticleContentHtml(translated));
  const links = ($: cheerio.CheerioAPI) =>
    $("a[href]")
      .toArray()
      .map((node) => $(node).attr("href") ?? "")
      .sort();
  if (JSON.stringify(links(original)) !== JSON.stringify(links(english))) {
    throw new EnglishTranslationTaskError(
      "英文翻译改变或遗漏了文章链接，未保存草稿，请检查翻译结果后重试",
    );
  }
  if (original("table tr").length !== english("table tr").length) {
    throw new EnglishTranslationTaskError(
      "英文翻译遗漏或改变了表格行，未保存草稿，请检查翻译结果后重试",
    );
  }
}

async function updateTask(task: Task, values: TaskValues) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();
  const updated = await db
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
  if (!updated.length) throw new TaskLeaseLostError();
}

async function saveStep(
  task: Task,
  key: string,
  name: string,
  progress: number,
  content?: string,
  sourceHash?: string,
) {
  await updateTask(task, { progress, currentStep: name });
  const now = new Date();
  const values = {
    stepName: name,
    status: content === undefined ? "running" : "success",
    progress,
    message: name,
    payload:
      content === undefined ? null : JSON.stringify({ sourceHash, content }),
    finishedAt: content === undefined ? null : now,
    updatedAt: now,
  };
  await db
    .insert(aiTaskSteps)
    .values({
      taskId: task.id,
      attempt: task.attempts,
      stepKey: key,
      startedAt: now,
      ...values,
    })
    .onConflictDoUpdate({
      target: [aiTaskSteps.taskId, aiTaskSteps.stepKey, aiTaskSteps.attempt],
      set: values,
    });
}

async function readContentCheckpoint(
  task: Task,
  sourceHash: string,
  stepKey: string,
) {
  const [step] = await db
    .select({ payload: aiTaskSteps.payload })
    .from(aiTaskSteps)
    .where(
      and(
        eq(aiTaskSteps.taskId, task.id),
        eq(aiTaskSteps.stepKey, stepKey),
        eq(aiTaskSteps.status, "success"),
      ),
    )
    .orderBy(desc(aiTaskSteps.attempt))
    .limit(1);
  try {
    const value: unknown = JSON.parse(step?.payload ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "sourceHash" in value &&
      value.sourceHash === sourceHash &&
      "content" in value &&
      typeof value.content === "string" &&
      value.content.trim()
    )
      return value.content;
  } catch {
    /* A legacy or incomplete checkpoint cannot be reused. */
  }
  return null;
}

async function saveAudit(task: Task, event: AiRewriteAuditEvent) {
  await updateTask(task, {});
  const now = new Date();
  const values = {
    stageName: event.stageName,
    status: event.status,
    configSnapshot: JSON.stringify(event.config),
    model: event.config.model,
    maxTokens: event.maxTokens,
    temperature: event.temperature,
    prompt: event.prompt,
    promptLength: event.prompt.length,
    response: event.response ?? null,
    responseLength: event.response?.length ?? null,
    readableContent: event.readableContent ?? null,
    readableContentLength: event.readableContent?.length ?? null,
    metadata: JSON.stringify(event.metadata ?? {}),
    finishReason: event.finishReason ?? null,
    promptTokens: event.promptTokens ?? null,
    completionTokens: event.completionTokens ?? null,
    totalTokens: event.totalTokens ?? null,
    error: event.error ?? null,
    finishedAt: event.status === "running" ? null : now,
    updatedAt: now,
  };
  await db
    .insert(aiRewriteArtifacts)
    .values({
      taskId: task.id,
      taskAttempt: task.attempts,
      stage: event.stage,
      stageAttempt: event.stageAttempt,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        aiRewriteArtifacts.taskId,
        aiRewriteArtifacts.taskAttempt,
        aiRewriteArtifacts.stage,
        aiRewriteArtifacts.stageAttempt,
      ],
      set: values,
    });
}

async function finishEnglishDraft(
  task: Task,
  source: EnglishTranslationSource,
  output?: { content: string; metadata: EnglishMetadataOutput },
) {
  const post = await db.transaction(async (tx) => {
    const [currentTask] = await tx
      .select()
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.id, task.id))
      .for("update")
      .limit(1);
    if (
      currentTask?.status !== "running" ||
      currentTask.leaseOwner !== task.leaseOwner
    )
      throw new TaskLeaseLostError();
    const [parent] = await tx
      .select()
      .from(posts)
      .where(eq(posts.id, source.sourcePostId))
      .for("update")
      .limit(1);
    if (parent?.language !== "zh")
      throw new EnglishTranslationTaskError(
        "中文来源文章不存在，无法保存英文稿",
      );
    const [existing] = await tx
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.translationSourcePostId, parent.id),
          eq(posts.language, "en"),
        ),
      )
      .limit(1);
    let savedPost = existing;
    if (!savedPost) {
      if (!output)
        throw new EnglishTranslationTaskError("英文稿状态已变化，请刷新后重试");
      if (englishTranslationSourceHash(parent) !== source.sourceHash) {
        throw new EnglishTranslationTaskError(
          "中文文章已更新，翻译结果已保留在任务记录中，请重新点击生成英文文章",
        );
      }
      const metadata = output.metadata;
      const result = await createPostRecordInTransaction(
        {
          post: {
            title: metadata.enTitle,
            slug: `${metadata.enSlug.slice(0, 260)}-en-${parent.id}`,
            description: metadata.enDescription,
            content: output.content,
            keywords: metadata.enKeywords.join(","),
            recommendedTagName: metadata.enRecommendTagName,
            language: "en",
            translationSourcePostId: parent.id,
            categoryId: parent.categoryId,
            published: false,
            imgUrl: DEFAULT_ARTICLE_COVER,
          },
          tags: metadata.enTags.map(({ name }) => ({ name })),
        },
        tx,
      );
      if (result.error || !result.data)
        throw new EnglishTranslationTaskError(
          result.error ?? "英文草稿保存失败",
        );
      savedPost = result.data;
    }
    const now = new Date();
    await tx
      .update(aiRewriteTasks)
      .set({
        postId: savedPost.id,
        resultTitle: savedPost.title,
        status: "succeeded",
        progress: 100,
        currentStep: existing
          ? "已有英文文章已保留"
          : "英文翻译已保存为独立草稿",
        requestStage: "checkpointed",
        rewriteOutputLength: savedPost.content.length,
        finishedAt: now,
        updatedAt: now,
        error: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      })
      .where(eq(aiRewriteTasks.id, task.id));
    await tx
      .insert(aiTaskSteps)
      .values({
        taskId: task.id,
        attempt: task.attempts,
        stepKey: "english_save",
        stepName: "保存英文草稿",
        status: "success",
        progress: 100,
        message: `英文文章 #${savedPost.id}`,
        finishedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [aiTaskSteps.taskId, aiTaskSteps.stepKey, aiTaskSteps.attempt],
        set: {
          status: "success",
          progress: 100,
          message: `英文文章 #${savedPost.id}`,
          finishedAt: now,
          updatedAt: now,
        },
      });
    return savedPost;
  });
  try {
    await syncImageReferencesForPost(post.id);
    await regeneratePostInternalLinks({
      postId: post.id,
      mode: "activate-high-confidence",
      generatedBy: "rule",
      includeKnowledge: false,
    });
    schedulePublicWebCache("post.changed", {
      postIds: [post.id],
      postSlugs: [post.slug],
      categoryIds: [post.categoryId],
    });
  } catch (error) {
    structuredLog("warn", "article.english_translation_maintenance_failed", {
      postId: post.id,
      error,
    });
  }
}

export async function runEnglishTranslationTask(
  task: Task,
  source: EnglishTranslationSource,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const [parent] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, source.sourcePostId))
    .limit(1);
  if (parent?.language !== "zh")
    throw new EnglishTranslationTaskError("中文来源文章不存在");
  const [existing] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.translationSourcePostId, parent.id),
        eq(posts.language, "en"),
      ),
    )
    .limit(1);
  if (existing) {
    await finishEnglishDraft(task, source);
    return;
  }
  if (englishTranslationSourceHash(parent) !== source.sourceHash)
    throw new EnglishTranslationTaskError(
      "中文文章已更新，请重新点击生成英文文章",
    );
  const markdown = contentToArticleMarkdown(task.sourceContent ?? "").markdown;
  if (!markdown.trim())
    throw new EnglishTranslationTaskError("中文正文为空，无法翻译");
  await updateTask(task, { aiInputLength: markdown.length });
  let config:
    | Awaited<ReturnType<typeof getActiveAiRewriteConfigWithFallback>>
    | undefined;
  async function requestOptions() {
    if (!config) {
      config = await getActiveAiRewriteConfigWithFallback(
        task.rewriteStyleId ?? undefined,
      );
      if (!config?.apiKey?.trim())
        throw new EnglishTranslationTaskError(
          "没有可用的英文翻译模型，请先检查 AI 接口配置",
        );
      await updateTask(task, {
        rewriteStyleId: config.id,
        rewriteConfigName: config.name,
        rewriteProvider: config.provider,
        rewriteModel: config.model,
        rewriteMaxTokens: config.maxTokens,
      });
    }
    return {
      styleId: config.id,
      signal,
      onAudit: (event: AiRewriteAuditEvent) => saveAudit(task, event),
      onRequestStage: (
        requestStage: "request_started" | "response_received" | "checkpointed",
      ) => updateTask(task, { requestStage }),
    };
  }
  let translated = await readContentCheckpoint(
    task,
    source.sourceHash,
    "english_translation",
  );
  if (!translated) {
    await saveStep(task, "english_translation", "正在翻译完整中文正文", 25);
    translated = await generateEnglishArticleContent(
      {
        title: task.sourceTitle ?? parent.title,
        description: source.description,
        keywords: source.keywords,
        markdownContent: markdown,
      },
      await requestOptions(),
    );
    assertTranslatedArticleStructure(markdown, translated);
    await saveStep(
      task,
      "english_translation",
      "英文正文翻译完成",
      70,
      translated,
      source.sourceHash,
    );
  } else {
    await saveStep(
      task,
      "english_translation",
      "已恢复完整英文正文",
      70,
      translated,
      source.sourceHash,
    );
  }
  assertTranslatedArticleStructure(markdown, translated);
  signal.throwIfAborted();
  const metadataCheckpoint = await readContentCheckpoint(
    task,
    source.sourceHash,
    "english_metadata",
  );
  let metadata: EnglishMetadataOutput | null = null;
  if (metadataCheckpoint) {
    try {
      const parsed = z
        .object({
          enTitle: z.string().min(1),
          enSlug: z.string().regex(/^[a-z0-9-]+$/),
          enDescription: z.string(),
          enKeywords: z.array(z.string()),
          enTags: z.array(z.object({ name: z.string(), slug: z.string() })),
          enRecommendTagName: z.string(),
          enCategoryName: z.string().nullable(),
          enCategorySlug: z.string().nullable(),
        })
        .safeParse(JSON.parse(metadataCheckpoint));
      if (parsed.success) metadata = parsed.data;
    } catch {
      /* Rebuild only an invalid metadata checkpoint. */
    }
  }
  if (!metadata) {
    await saveStep(
      task,
      "english_metadata",
      "正在生成对应的英文标题与摘要",
      80,
    );
    const [category] = await db
      .select({
        name: categories.name,
        slug: categories.slug,
        enName: categories.enName,
        enSlug: categories.enSlug,
      })
      .from(categories)
      .where(eq(categories.id, parent.categoryId))
      .limit(1);
    metadata = await generateEnglishMetadata(
      {
        title: task.sourceTitle ?? parent.title,
        description: source.description,
        keywords: source.keywords,
        enContent: translated,
        category,
      },
      await requestOptions(),
    );
    await saveStep(
      task,
      "english_metadata",
      "英文标题与摘要已完成",
      90,
      JSON.stringify(metadata),
      source.sourceHash,
    );
  } else {
    await saveStep(
      task,
      "english_metadata",
      "已恢复英文标题与摘要",
      90,
      JSON.stringify(metadata),
      source.sourceHash,
    );
  }
  signal.throwIfAborted();
  await finishEnglishDraft(task, source, { content: translated, metadata });
}
