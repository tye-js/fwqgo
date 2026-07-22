import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";

import { ilikeContains } from "@/server/db/search";

const PUBLIC_PAGE_SIZE = 18;

export async function getPublicKnowledgeCategories() {
  "use cache";
  tagCache(cacheTags.knowledge);

  return readDb
    .select({
      id: knowledgeCategories.id,
      name: knowledgeCategories.name,
      slug: knowledgeCategories.slug,
      description: knowledgeCategories.description,
      articleCount: sql<number>`count(${knowledgeArticles.id})::int`,
    })
    .from(knowledgeCategories)
    .leftJoin(
      knowledgeArticles,
      and(
        eq(knowledgeArticles.categoryId, knowledgeCategories.id),
        eq(knowledgeArticles.published, true),
      ),
    )
    .groupBy(knowledgeCategories.id)
    .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.id));
}

export async function listPublishedKnowledgeArticles(input: {
  query?: string;
  categorySlug?: string;
  page?: number;
}) {
  const query = input.query?.trim().slice(0, 120) ?? "";
  const categorySlug = input.categorySlug?.trim().slice(0, 160) ?? "";
  const requestedPage =
    Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  const conditions = [eq(knowledgeArticles.published, true)];

  if (categorySlug) conditions.push(eq(knowledgeCategories.slug, categorySlug));
  if (query) {
    conditions.push(
      or(
        ilikeContains(knowledgeArticles.title, query),
        ilikeContains(knowledgeArticles.summary, query),
        ilikeContains(knowledgeArticles.keywords, query),
        ilikeContains(knowledgeArticles.aliases, query),
        ilikeContains(knowledgeArticles.retrievalTerms, query),
        ilikeContains(knowledgeArticles.content, query),
      )!,
    );
  }

  const where = and(...conditions);
  const [countRow] = await readDb
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeCategories,
      eq(knowledgeArticles.categoryId, knowledgeCategories.id),
    )
    .where(where);

  const total = countRow?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const items = await readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      summary: knowledgeArticles.summary,
      keywords: knowledgeArticles.keywords,
      categoryName: knowledgeCategories.name,
      categorySlug: knowledgeCategories.slug,
      updatedAt: knowledgeArticles.updatedAt,
      createdAt: knowledgeArticles.createdAt,
    })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeCategories,
      eq(knowledgeArticles.categoryId, knowledgeCategories.id),
    )
    .where(where)
    .orderBy(
      desc(
        sql`coalesce(${knowledgeArticles.updatedAt}, ${knowledgeArticles.createdAt})`,
      ),
      desc(knowledgeArticles.id),
    )
    .limit(PUBLIC_PAGE_SIZE)
    .offset((page - 1) * PUBLIC_PAGE_SIZE);

  return {
    items,
    total,
    page,
    pageSize: PUBLIC_PAGE_SIZE,
    totalPages,
  };
}

export async function getPublishedKnowledgeArticleBySlug(slug: string) {
  "use cache";
  tagCache(cacheTags.knowledge, cacheTags.knowledgeSlug(slug));

  const [article] = await readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      summary: knowledgeArticles.summary,
      content: knowledgeArticles.content,
      keywords: knowledgeArticles.keywords,
      categoryId: knowledgeArticles.categoryId,
      categoryName: knowledgeCategories.name,
      categorySlug: knowledgeCategories.slug,
      publishedAt: knowledgeArticles.publishedAt,
      updatedAt: knowledgeArticles.updatedAt,
      createdAt: knowledgeArticles.createdAt,
    })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeCategories,
      eq(knowledgeArticles.categoryId, knowledgeCategories.id),
    )
    .where(
      and(
        eq(knowledgeArticles.slug, slug),
        eq(knowledgeArticles.published, true),
      ),
    )
    .limit(1);

  return article ?? null;
}

export async function getRelatedKnowledgeArticles(input: {
  articleId: number;
  categoryId: number;
  limit?: number;
}) {
  "use cache";
  tagCache(cacheTags.knowledge, cacheTags.knowledgeArticle(input.articleId));

  return readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      summary: knowledgeArticles.summary,
    })
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.published, true),
        eq(knowledgeArticles.categoryId, input.categoryId),
        ne(knowledgeArticles.id, input.articleId),
      ),
    )
    .orderBy(desc(knowledgeArticles.updatedAt), desc(knowledgeArticles.id))
    .limit(Math.min(Math.max(input.limit ?? 4, 1), 8));
}
