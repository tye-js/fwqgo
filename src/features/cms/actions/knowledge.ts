"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { ilikeContains } from "@/server/db/search";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label}不能超过 ${max} 个字符`).optional();

const categoryInputSchema = z.object({
  id: postgresIntegerIdSchema.optional(),
  name: z.string().trim().min(2, "分类名称至少 2 个字符").max(80),
  slug: optionalText(160, "分类 slug"),
  description: optionalText(800, "分类说明"),
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
});

const articleInputSchema = z.object({
  id: postgresIntegerIdSchema.optional(),
  categoryId: postgresIntegerIdSchema,
  title: z.string().trim().min(4, "标题至少 4 个字符").max(240),
  slug: optionalText(320, "slug"),
  summary: optionalText(1_200, "摘要"),
  content: z.string().trim().min(40, "正文至少 40 个字符").max(200_000),
  keywords: optionalText(2_000, "关键词"),
  aliases: optionalText(2_000, "别名"),
  retrievalTerms: optionalText(2_000, "检索词"),
  sourceNotes: optionalText(10_000, "来源说明"),
  published: z.boolean().default(false),
  allowAiReference: z.boolean().default(true),
});

const idSchema = z.object({ id: postgresIntegerIdSchema });

function textOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return null;
  return trimmed;
}

function normalizedSlug(value: string | undefined, fallback: string) {
  const requested = value?.trim();
  let source: string;
  if (requested === undefined || requested.length === 0) {
    source = fallback;
  } else {
    source = requested;
  }
  const slug = slugify(source).slice(0, 320);
  if (!slug)
    throw new Error("无法生成 slug，请输入包含中文、字母或数字的 slug");
  return slug;
}

async function ensureCategorySlugAvailable(slug: string, id?: number) {
  const condition = id
    ? and(eq(knowledgeCategories.slug, slug), ne(knowledgeCategories.id, id))
    : eq(knowledgeCategories.slug, slug);
  const [conflict] = await db
    .select({ id: knowledgeCategories.id })
    .from(knowledgeCategories)
    .where(condition)
    .limit(1);
  if (conflict) throw new Error(`分类 slug「${slug}」已存在`);
}

async function ensureArticleSlugAvailable(slug: string, id?: number) {
  const condition = id
    ? and(eq(knowledgeArticles.slug, slug), ne(knowledgeArticles.id, id))
    : eq(knowledgeArticles.slug, slug);
  const [conflict] = await db
    .select({ id: knowledgeArticles.id })
    .from(knowledgeArticles)
    .where(condition)
    .limit(1);
  if (conflict) throw new Error(`知识条目 slug「${slug}」已存在`);
}

function refreshKnowledgeCms() {
  revalidatePath("/knowledge");
}

export const saveKnowledgeCategory = defineAdminAction({
  action: "knowledge.category.save",
  entityType: "knowledge_category",
  parse: (input: z.input<typeof categoryInputSchema>) =>
    categoryInputSchema.parse(input),
  execute: async (input) => {
    const slug = normalizedSlug(input.slug, input.name);
    await ensureCategorySlugAvailable(slug, input.id);

    const values = {
      name: input.name,
      slug,
      description: textOrNull(input.description),
      sortOrder: input.sortOrder,
      updatedAt: new Date(),
    };
    const [category] = input.id
      ? await db
          .update(knowledgeCategories)
          .set(values)
          .where(eq(knowledgeCategories.id, input.id))
          .returning()
      : await db.insert(knowledgeCategories).values(values).returning();
    if (!category) throw new Error("分类不存在或保存失败");

    refreshKnowledgeCms();
    schedulePublicWebCache("knowledge.changed");
    return category;
  },
  successMessage: "知识分类已保存",
  errorTitle: "知识分类保存失败",
  errorSuggestion: "请检查分类名和 slug 是否重复。",
  entityId: (input, result) => result?.id ?? input.id,
});

export const deleteKnowledgeCategory = defineAdminAction({
  action: "knowledge.category.delete",
  entityType: "knowledge_category",
  parse: (input: z.input<typeof idSchema>) => idSchema.parse(input),
  execute: async ({ id }) => {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.categoryId, id));
    if ((countRow?.count ?? 0) > 0) {
      throw new Error("该分类仍有知识条目，请先移动或删除这些条目");
    }

    const [deleted] = await db
      .delete(knowledgeCategories)
      .where(eq(knowledgeCategories.id, id))
      .returning({ id: knowledgeCategories.id });
    if (!deleted) throw new Error("分类不存在");

    refreshKnowledgeCms();
    schedulePublicWebCache("knowledge.changed");
    return deleted;
  },
  successMessage: "知识分类已删除",
  errorTitle: "知识分类删除失败",
  entityId: (input) => input.id,
});

export const saveKnowledgeArticle = defineAdminAction({
  action: "knowledge.article.save",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof articleInputSchema>) =>
    articleInputSchema.parse(input),
  execute: async (input, session) => {
    const slug = normalizedSlug(input.slug, input.title);
    await ensureArticleSlugAvailable(slug, input.id);

    const [category] = await db
      .select({ id: knowledgeCategories.id })
      .from(knowledgeCategories)
      .where(eq(knowledgeCategories.id, input.categoryId))
      .limit(1);
    if (!category) throw new Error("所选知识分类不存在");

    const [current] = input.id
      ? await db
          .select({
            slug: knowledgeArticles.slug,
            published: knowledgeArticles.published,
            publishedAt: knowledgeArticles.publishedAt,
          })
          .from(knowledgeArticles)
          .where(eq(knowledgeArticles.id, input.id))
          .limit(1)
      : [];
    if (input.id && !current) throw new Error("知识条目不存在");

    const now = new Date();
    const values = {
      categoryId: input.categoryId,
      title: input.title,
      slug,
      summary: textOrNull(input.summary),
      content: input.content,
      keywords: textOrNull(input.keywords),
      aliases: textOrNull(input.aliases),
      retrievalTerms: textOrNull(input.retrievalTerms),
      sourceNotes: textOrNull(input.sourceNotes),
      published: input.published,
      allowAiReference: input.allowAiReference,
      publishedAt: input.published ? (current?.publishedAt ?? now) : null,
      updatedAt: now,
    };
    const [article] = input.id
      ? await db
          .update(knowledgeArticles)
          .set(values)
          .where(eq(knowledgeArticles.id, input.id))
          .returning()
      : await db
          .insert(knowledgeArticles)
          .values({ ...values, createdBy: session.userId })
          .returning();
    if (!article) throw new Error("知识条目保存失败");

    refreshKnowledgeCms();
    schedulePublicWebCache("knowledge.changed", {
      knowledgeArticleIds: [article.id],
      knowledgeSlugs: [article.slug, current?.slug].filter(
        (value): value is string => Boolean(value),
      ),
    });
    return article;
  },
  successMessage: (result) =>
    result.published ? "知识条目已保存并发布" : "知识条目草稿已保存",
  errorTitle: "知识条目保存失败",
  errorSuggestion: "请检查必填项、slug 和正文长度。",
  entityId: (input, result) => result?.id ?? input.id,
});

export const deleteKnowledgeArticle = defineAdminAction({
  action: "knowledge.article.delete",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof idSchema>) => idSchema.parse(input),
  execute: async ({ id }) => {
    const [deleted] = await db
      .delete(knowledgeArticles)
      .where(eq(knowledgeArticles.id, id))
      .returning({ id: knowledgeArticles.id, slug: knowledgeArticles.slug });
    if (!deleted) throw new Error("知识条目不存在");

    refreshKnowledgeCms();
    schedulePublicWebCache("knowledge.changed", {
      knowledgeArticleIds: [deleted.id],
      knowledgeSlugs: [deleted.slug],
    });
    return deleted;
  },
  successMessage: "知识条目已删除",
  errorTitle: "知识条目删除失败",
  entityId: (input) => input.id,
});

export async function getKnowledgeAdminOverview(query = "") {
  await requireAdminSession();
  const normalizedQuery = query.trim().slice(0, 120);
  const articleCondition = normalizedQuery
    ? or(
        ilikeContains(knowledgeArticles.title, normalizedQuery),
        ilikeContains(knowledgeArticles.summary, normalizedQuery),
        ilikeContains(knowledgeArticles.keywords, normalizedQuery),
        ilikeContains(knowledgeArticles.aliases, normalizedQuery),
      )
    : undefined;

  const [categories, articles] = await Promise.all([
    db
      .select({
        id: knowledgeCategories.id,
        name: knowledgeCategories.name,
        slug: knowledgeCategories.slug,
        description: knowledgeCategories.description,
        sortOrder: knowledgeCategories.sortOrder,
        articleCount: sql<number>`count(${knowledgeArticles.id})::int`,
      })
      .from(knowledgeCategories)
      .leftJoin(
        knowledgeArticles,
        eq(knowledgeArticles.categoryId, knowledgeCategories.id),
      )
      .groupBy(knowledgeCategories.id)
      .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.id)),
    db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        slug: knowledgeArticles.slug,
        summary: knowledgeArticles.summary,
        categoryName: knowledgeCategories.name,
        published: knowledgeArticles.published,
        allowAiReference: knowledgeArticles.allowAiReference,
        updatedAt: knowledgeArticles.updatedAt,
        createdAt: knowledgeArticles.createdAt,
      })
      .from(knowledgeArticles)
      .innerJoin(
        knowledgeCategories,
        eq(knowledgeArticles.categoryId, knowledgeCategories.id),
      )
      .where(articleCondition)
      .orderBy(desc(knowledgeArticles.updatedAt), desc(knowledgeArticles.id))
      .limit(300),
  ]);

  return { categories, articles };
}

export async function getKnowledgeAdminArticle(id: number) {
  await requireAdminSession();
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [article] = await db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);
  return article ?? null;
}
