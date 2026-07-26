"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { ilikeContains } from "@/server/db/search";
import {
  confirmKnowledgeTranslationSync,
  deleteKnowledgeArticleRecord,
  saveKnowledgeDraft,
  setKnowledgeAiReference,
  setKnowledgePublication,
  type KnowledgeLanguage,
  type KnowledgeMutationResult,
} from "@/server/knowledge/service";

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}不能超过 ${max} 个字符`).optional();

const nullableOptionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}不能超过 ${max} 个字符`)
    .nullable()
    .optional();

const categoryInputSchema = z.object({
  id: postgresIntegerIdSchema.optional(),
  name: z.string().trim().min(2, "分类名称至少 2 个字符").max(80),
  slug: optionalText(160, "分类 slug"),
  description: optionalText(800, "分类说明"),
  enName: nullableOptionalText(120, "英文分类名称"),
  enSlug: nullableOptionalText(160, "英文分类 slug"),
  enDescription: nullableOptionalText(800, "英文分类说明"),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});

const articleInputSchema = z
  .object({
    id: postgresIntegerIdSchema.optional(),
    language: z.enum(["zh", "en"]),
    translationSourceArticleId: postgresIntegerIdSchema.nullable().optional(),
    categoryId: postgresIntegerIdSchema.optional(),
    expectedContentRevision: z.number().int().positive().optional(),
    title: z.string().trim().min(4, "标题至少 4 个字符").max(240),
    slug: optionalText(320, "slug"),
    summary: optionalText(1_200, "摘要"),
    content: z.string().trim().min(40, "正文至少 40 个字符").max(200_000),
    keywords: optionalText(2_000, "关键词"),
    aliases: optionalText(2_000, "别名"),
    retrievalTerms: optionalText(2_000, "检索词"),
    sourceNotes: optionalText(10_000, "来源说明"),
  })
  .superRefine((input, context) => {
    if (input.id && !input.expectedContentRevision) {
      context.addIssue({
        code: "custom",
        path: ["expectedContentRevision"],
        message: "缺少内容版本，请刷新后重试",
      });
    }
    if (!input.id && input.language === "zh" && !input.categoryId) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "请选择知识分类",
      });
    }
    if (
      !input.id &&
      input.language === "en" &&
      !input.translationSourceArticleId
    ) {
      context.addIssue({
        code: "custom",
        path: ["translationSourceArticleId"],
        message: "创建英文稿必须指定中文源稿",
      });
    }
  });

const versionCommandSchema = z.object({
  id: postgresIntegerIdSchema,
  expectedContentRevision: z.number().int().positive(),
});

const publicationCommandSchema = versionCommandSchema.extend({
  published: z.boolean(),
});

const aiReferenceCommandSchema = versionCommandSchema.extend({
  allowAiReference: z.boolean(),
});

const idSchema = z.object({ id: postgresIntegerIdSchema });
type KnowledgeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function textOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizedSlug(value: string | undefined, fallback: string) {
  const slug = slugify(textOrNull(value) ?? fallback, 160);
  if (!slug) {
    throw new Error("无法生成 slug，请输入包含中文、字母或数字的 slug");
  }
  return slug;
}

function normalizedEnglishSlug(value: string | null | undefined) {
  const normalized = textOrNull(value);
  if (!normalized) return null;
  const slug = slugify(normalized, 160);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("英文分类 slug 只能使用小写字母、数字和连字符");
  }
  return slug;
}

async function ensureCategorySlugAvailable(
  tx: KnowledgeTransaction,
  field: "slug" | "enSlug",
  slug: string,
  id?: number,
) {
  const column = knowledgeCategories[field];
  const condition = id
    ? and(eq(column, slug), ne(knowledgeCategories.id, id))
    : eq(column, slug);
  const [conflict] = await tx
    .select({ id: knowledgeCategories.id })
    .from(knowledgeCategories)
    .where(condition)
    .limit(1);
  if (conflict) {
    throw new Error(
      `${field === "enSlug" ? "英文分类" : "分类"} slug「${slug}」已存在`,
    );
  }
}

function refreshKnowledgeCms() {
  revalidatePath("/knowledge");
}

function notifyKnowledgeMutation(result: KnowledgeMutationResult) {
  refreshKnowledgeCms();
  schedulePublicWebCache("knowledge.changed", {
    knowledgeArticleIds: result.affectedArticleIds,
    knowledgeSlugs: result.affectedSlugs,
  });
}

export const saveKnowledgeCategory = defineAdminAction({
  action: "knowledge.category.save",
  entityType: "knowledge_category",
  parse: (input: z.input<typeof categoryInputSchema>) =>
    categoryInputSchema.parse(input),
  execute: async (input) => {
    const category = await db.transaction(async (tx) => {
      if (input.id) {
        const [current] = await tx
          .select({ id: knowledgeCategories.id })
          .from(knowledgeCategories)
          .where(eq(knowledgeCategories.id, input.id))
          .for("update")
          .limit(1);
        if (!current) throw new Error("分类不存在或保存失败");
      }

      const slug = normalizedSlug(input.slug, input.name);
      const enSlug = normalizedEnglishSlug(input.enSlug);
      const enName = textOrNull(input.enName);
      const enDescription = textOrNull(input.enDescription);
      await ensureCategorySlugAvailable(tx, "slug", slug, input.id);
      if (enSlug) {
        await ensureCategorySlugAvailable(tx, "enSlug", enSlug, input.id);
      }

      if (input.id && (!enName || !enSlug || !enDescription)) {
        const [publishedEnglish] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(knowledgeArticles)
          .where(
            and(
              eq(knowledgeArticles.categoryId, input.id),
              eq(knowledgeArticles.language, "en"),
              eq(knowledgeArticles.published, true),
            ),
          );
        if ((publishedEnglish?.count ?? 0) > 0) {
          throw new Error(
            "该分类仍有已发布英文知识稿，不能清空英文名称、slug 或说明",
          );
        }
      }

      const values = {
        name: input.name,
        slug,
        description: textOrNull(input.description),
        enName,
        enSlug,
        enDescription,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      };
      const [saved] = input.id
        ? await tx
            .update(knowledgeCategories)
            .set(values)
            .where(eq(knowledgeCategories.id, input.id))
            .returning()
        : await tx.insert(knowledgeCategories).values(values).returning();
      if (!saved) throw new Error("分类不存在或保存失败");
      return saved;
    });

    refreshKnowledgeCms();
    schedulePublicWebCache("knowledge.changed");
    return category;
  },
  successMessage: "知识分类已保存",
  errorTitle: "知识分类保存失败",
  errorSuggestion: "请检查中英文分类名称和 slug 是否重复。",
  entityId: (input, result) => result?.id ?? input.id,
});

export const deleteKnowledgeCategory = defineAdminAction({
  action: "knowledge.category.delete",
  entityType: "knowledge_category",
  parse: (input: z.input<typeof idSchema>) => idSchema.parse(input),
  execute: async ({ id }) => {
    const deleted = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: knowledgeCategories.id })
        .from(knowledgeCategories)
        .where(eq(knowledgeCategories.id, id))
        .for("update")
        .limit(1);
      if (!current) throw new Error("分类不存在");

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.categoryId, id));
      if ((countRow?.count ?? 0) > 0) {
        throw new Error("该分类仍有知识条目，请先移动或删除这些条目");
      }

      const [result] = await tx
        .delete(knowledgeCategories)
        .where(eq(knowledgeCategories.id, id))
        .returning({ id: knowledgeCategories.id });
      if (!result) throw new Error("分类不存在");
      return result;
    });

    refreshKnowledgeCms();
    schedulePublicWebCache("knowledge.changed");
    return deleted;
  },
  successMessage: "知识分类已删除",
  errorTitle: "知识分类删除失败",
  entityId: (input) => input.id,
});

export const saveKnowledgeArticle = defineAdminAction({
  action: "knowledge.article.draft.save",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof articleInputSchema>) =>
    articleInputSchema.parse(input),
  execute: async (input, session) => {
    const result = await saveKnowledgeDraft(input, session.userId);
    notifyKnowledgeMutation(result);
    return result.article;
  },
  successMessage: (result) =>
    result.language === "en" ? "英文知识草稿已保存" : "中文知识草稿已保存",
  errorTitle: "知识草稿保存失败",
  errorSuggestion: "请检查必填项、内容版本、slug 和正文长度。",
  entityId: (input, result) => result?.id ?? input.id,
});

export const updateKnowledgePublication = defineAdminAction({
  action: "knowledge.article.publication.update",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof publicationCommandSchema>) =>
    publicationCommandSchema.parse(input),
  execute: async (input) => {
    const result = await setKnowledgePublication(input);
    notifyKnowledgeMutation(result);
    return result.article;
  },
  successMessage: (result) =>
    result.published ? "知识条目已发布" : "知识条目已取消发布",
  errorTitle: "知识发布状态更新失败",
  errorSuggestion: "请检查必填资料、译文同步状态和当前内容版本。",
  entityId: (input) => input.id,
});

export const updateKnowledgeAiReference = defineAdminAction({
  action: "knowledge.article.ai_reference.update",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof aiReferenceCommandSchema>) =>
    aiReferenceCommandSchema.parse(input),
  execute: async (input) => {
    const result = await setKnowledgeAiReference(input);
    notifyKnowledgeMutation(result);
    return result.article;
  },
  successMessage: (result) =>
    result.allowAiReference ? "已允许 AI 引用" : "已关闭 AI 引用",
  errorTitle: "AI 引用状态更新失败",
  errorSuggestion: "只有已发布且版本同步的条目才能允许 AI 引用。",
  entityId: (input) => input.id,
});

export const confirmKnowledgeTranslation = defineAdminAction({
  action: "knowledge.article.translation.confirm",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof versionCommandSchema>) =>
    versionCommandSchema.parse(input),
  execute: async (input) => {
    const result = await confirmKnowledgeTranslationSync(input);
    notifyKnowledgeMutation(result);
    return result.article;
  },
  successMessage: "已确认英文稿同步到中文源稿当前版本",
  errorTitle: "译文同步确认失败",
  errorSuggestion: "请先保存完整英文草稿，并刷新确认当前内容版本。",
  entityId: (input) => input.id,
});

export const deleteKnowledgeArticle = defineAdminAction({
  action: "knowledge.article.delete",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof versionCommandSchema>) =>
    versionCommandSchema.parse(input),
  execute: async (input) => {
    const result = await deleteKnowledgeArticleRecord(input);
    notifyKnowledgeMutation(result);
    return result.article;
  },
  successMessage: "知识条目已删除",
  errorTitle: "知识条目删除失败",
  errorSuggestion: "中文源稿存在英文稿时，必须先删除英文稿。",
  entityId: (input) => input.id,
});

export async function getKnowledgeAdminOverview(
  query = "",
  language: KnowledgeLanguage = "zh",
) {
  await requireAdminSession();
  const normalizedQuery = query.trim().slice(0, 120);
  const articleCondition = and(
    eq(knowledgeArticles.language, language),
    normalizedQuery
      ? or(
          ilikeContains(knowledgeArticles.title, normalizedQuery),
          ilikeContains(knowledgeArticles.summary, normalizedQuery),
          ilikeContains(knowledgeArticles.keywords, normalizedQuery),
          ilikeContains(knowledgeArticles.aliases, normalizedQuery),
        )
      : undefined,
  );
  const sourceArticle = alias(knowledgeArticles, "knowledge_source_article");
  const translationArticle = alias(
    knowledgeArticles,
    "knowledge_translation_article",
  );

  const [categories, articles] = await Promise.all([
    db
      .select({
        id: knowledgeCategories.id,
        name: knowledgeCategories.name,
        slug: knowledgeCategories.slug,
        description: knowledgeCategories.description,
        enName: knowledgeCategories.enName,
        enSlug: knowledgeCategories.enSlug,
        enDescription: knowledgeCategories.enDescription,
        sortOrder: knowledgeCategories.sortOrder,
        articleCount: sql<number>`count(${knowledgeArticles.id})::int`,
      })
      .from(knowledgeCategories)
      .leftJoin(
        knowledgeArticles,
        and(
          eq(knowledgeArticles.categoryId, knowledgeCategories.id),
          eq(knowledgeArticles.language, language),
        ),
      )
      .groupBy(knowledgeCategories.id)
      .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.id)),
    db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        slug: knowledgeArticles.slug,
        summary: knowledgeArticles.summary,
        language: knowledgeArticles.language,
        categoryName: knowledgeCategories.name,
        categoryEnName: knowledgeCategories.enName,
        published: knowledgeArticles.published,
        allowAiReference: knowledgeArticles.allowAiReference,
        contentRevision: knowledgeArticles.contentRevision,
        translatedFromRevision: knowledgeArticles.translatedFromRevision,
        translationSourceArticleId:
          knowledgeArticles.translationSourceArticleId,
        sourceContentRevision: sourceArticle.contentRevision,
        sourcePublished: sourceArticle.published,
        translationArticleId: translationArticle.id,
        translationPublished: translationArticle.published,
        translationContentRevision: translationArticle.contentRevision,
        translationTranslatedFromRevision:
          translationArticle.translatedFromRevision,
        contentUpdatedAt: knowledgeArticles.contentUpdatedAt,
        updatedAt: knowledgeArticles.updatedAt,
        createdAt: knowledgeArticles.createdAt,
      })
      .from(knowledgeArticles)
      .innerJoin(
        knowledgeCategories,
        eq(knowledgeArticles.categoryId, knowledgeCategories.id),
      )
      .leftJoin(
        sourceArticle,
        eq(knowledgeArticles.translationSourceArticleId, sourceArticle.id),
      )
      .leftJoin(
        translationArticle,
        and(
          eq(
            translationArticle.translationSourceArticleId,
            knowledgeArticles.id,
          ),
          eq(translationArticle.language, "en"),
        ),
      )
      .where(articleCondition)
      .orderBy(
        desc(knowledgeArticles.contentUpdatedAt),
        desc(knowledgeArticles.id),
      )
      .limit(300),
  ]);

  return { categories, articles, language };
}

export async function getKnowledgeAdminArticle(id: number) {
  await requireAdminSession();
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [article] = await db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);
  if (!article) return null;

  const sourceId =
    article.language === "en" ? article.translationSourceArticleId : null;
  const [source] = sourceId
    ? await db
        .select({
          id: knowledgeArticles.id,
          title: knowledgeArticles.title,
          slug: knowledgeArticles.slug,
          published: knowledgeArticles.published,
          contentRevision: knowledgeArticles.contentRevision,
        })
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.id, sourceId))
        .limit(1)
    : [];
  const [translation] =
    article.language === "zh"
      ? await db
          .select({
            id: knowledgeArticles.id,
            title: knowledgeArticles.title,
            slug: knowledgeArticles.slug,
            published: knowledgeArticles.published,
            contentRevision: knowledgeArticles.contentRevision,
            translatedFromRevision: knowledgeArticles.translatedFromRevision,
          })
          .from(knowledgeArticles)
          .where(
            and(
              eq(knowledgeArticles.translationSourceArticleId, article.id),
              eq(knowledgeArticles.language, "en"),
            ),
          )
          .limit(1)
      : [];

  return {
    ...article,
    source: source ?? null,
    translation: translation ?? null,
  };
}

export async function getKnowledgeTranslationDraftSource(id: number) {
  await requireAdminSession();
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [source] = await db
    .select()
    .from(knowledgeArticles)
    .where(
      and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.language, "zh")),
    )
    .limit(1);
  if (!source) return null;

  const [translation] = await db
    .select({ id: knowledgeArticles.id })
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.translationSourceArticleId, source.id),
        eq(knowledgeArticles.language, "en"),
      ),
    )
    .limit(1);
  if (translation) throw new Error("该中文源稿已经具有英文稿");
  return source;
}

export async function getKnowledgeArticlesByIds(ids: number[]) {
  await requireAdminSession();
  const normalizedIds = [...new Set(ids)].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );
  if (normalizedIds.length === 0) return [];
  return db
    .select()
    .from(knowledgeArticles)
    .where(inArray(knowledgeArticles.id, normalizedIds));
}
