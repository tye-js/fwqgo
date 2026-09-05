import { and, asc, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";
import {
  KNOWLEDGE_PAGE_SIZE,
  normalizeKnowledgeQuery,
  resolveKnowledgeBrowsePage,
  type KnowledgeIndexLanguage,
} from "@fwqgo/core/knowledge-index";
import { publicKnowledgeCondition } from "@/server/knowledge/public-knowledge-policy";
import { ilikeContains } from "@/server/db/search";
import { listPublishedKnowledgeSources } from "@/server/knowledge/source-service";

export type PublicKnowledgeLanguage = KnowledgeIndexLanguage;

const knowledgeCacheLife = { stale: 60, revalidate: 300, expire: 3_600 };

async function withKnowledgeQueryTiming<T>(
  operation: "categories" | "browse" | "search-count" | "search-items",
  context: {
    language?: PublicKnowledgeLanguage;
    categoryId?: number | null;
    page?: number;
  },
  read: () => PromiseLike<T>,
): Promise<T> {
  const startedAt = performance.now();
  let failed = false;
  try {
    return await read();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    const configured = Number(process.env.PUBLIC_KNOWLEDGE_SLOW_LOG_MS ?? 500);
    const threshold = Number.isFinite(configured)
      ? Math.min(60_000, Math.max(100, configured))
      : 500;
    if (failed || durationMs >= threshold) {
      // Includes pool and database round-trip time; never logs visitor data,
      // search text, SQL, or credentials.
      console.warn("Public knowledge query", {
        operation,
        ...context,
        durationMs,
        failed,
      });
    }
  }
}

export async function getPublicKnowledgeCategories() {
  "use cache";
  cacheLife(knowledgeCacheLife);
  tagCache(cacheTags.knowledge);

  return withKnowledgeQueryTiming("categories", {}, () =>
    readDb
      .select({
        id: knowledgeCategories.id,
        name: knowledgeCategories.name,
        slug: knowledgeCategories.slug,
        description: knowledgeCategories.description,
        enName: knowledgeCategories.enName,
        enSlug: knowledgeCategories.enSlug,
        enDescription: knowledgeCategories.enDescription,
        zhArticleCount: sql<number>`count(${knowledgeArticles.id}) filter (where ${knowledgeArticles.language} = 'zh')::int`,
        enArticleCount: sql<number>`count(${knowledgeArticles.id}) filter (where ${knowledgeArticles.language} = 'en')::int`,
      })
      .from(knowledgeCategories)
      .leftJoin(
        knowledgeArticles,
        and(
          eq(knowledgeArticles.categoryId, knowledgeCategories.id),
          publicKnowledgeCondition(),
        ),
      )
      .groupBy(knowledgeCategories.id)
      .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.id)),
  );
}

function readKnowledgeItems(where: SQL | undefined, page: number) {
  return readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      summary: knowledgeArticles.summary,
      definition: knowledgeArticles.definition,
      highlights: knowledgeArticles.highlights,
      quickTip: knowledgeArticles.quickTip,
      contentRole: knowledgeArticles.contentRole,
      keywords: knowledgeArticles.keywords,
      categoryName: knowledgeCategories.name,
      categorySlug: knowledgeCategories.slug,
      categoryEnName: knowledgeCategories.enName,
      categoryEnSlug: knowledgeCategories.enSlug,
      contentUpdatedAt: knowledgeArticles.contentUpdatedAt,
    })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeCategories,
      eq(knowledgeArticles.categoryId, knowledgeCategories.id),
    )
    .where(where)
    .orderBy(
      desc(knowledgeArticles.contentUpdatedAt),
      desc(knowledgeArticles.id),
    )
    .limit(KNOWLEDGE_PAGE_SIZE)
    .offset((page - 1) * KNOWLEDGE_PAGE_SIZE);
}

async function getCachedKnowledgeBrowseItems(
  language: PublicKnowledgeLanguage,
  categoryId: number | null,
  page: number,
) {
  "use cache";
  cacheLife(knowledgeCacheLife);
  tagCache(cacheTags.knowledge);

  return withKnowledgeQueryTiming(
    "browse",
    { language, categoryId, page },
    () =>
      readKnowledgeItems(
        and(
          publicKnowledgeCondition(language),
          categoryId === null
            ? undefined
            : eq(knowledgeArticles.categoryId, categoryId),
        ),
        page,
      ),
  );
}

export async function listPublishedKnowledgeArticles(input: {
  language: PublicKnowledgeLanguage;
  query?: string;
  categorySlug?: string;
  page?: number;
}) {
  const normalized = normalizeKnowledgeQuery(input);
  const { query, language } = normalized;
  const categories = await getPublicKnowledgeCategories();
  const browse = resolveKnowledgeBrowsePage(categories, normalized);
  if (!browse) {
    return {
      items: [] as Awaited<ReturnType<typeof readKnowledgeItems>>,
      total: 0,
      page: 1,
      pageSize: KNOWLEDGE_PAGE_SIZE,
      totalPages: 1,
    };
  }

  if (!query) {
    // Validate category IDs and page bounds before admitting cache keys.
    // Reuse the tagged category counts instead of issuing COUNT on each visit.
    const items =
      browse.total === 0
        ? []
        : await getCachedKnowledgeBrowseItems(
            language,
            browse.categoryId,
            browse.page,
          );
    return {
      items,
      total: browse.total,
      page: browse.page,
      pageSize: KNOWLEDGE_PAGE_SIZE,
      totalPages: browse.totalPages,
    };
  }

  const where = and(
    publicKnowledgeCondition(language),
    browse.categoryId === null
      ? undefined
      : eq(knowledgeArticles.categoryId, browse.categoryId),
    or(
      ilikeContains(knowledgeArticles.title, query),
      ilikeContains(knowledgeArticles.summary, query),
      ilikeContains(knowledgeArticles.definition, query),
      ilikeContains(sql`${knowledgeArticles.highlights}::text`, query),
      ilikeContains(knowledgeArticles.quickTip, query),
      ilikeContains(knowledgeArticles.keywords, query),
      ilikeContains(knowledgeArticles.aliases, query),
      ilikeContains(knowledgeArticles.retrievalTerms, query),
      ilikeContains(knowledgeArticles.content, query),
    ),
  );

  const context = { language, categoryId: browse.categoryId };
  const [countRow] = await withKnowledgeQueryTiming(
    "search-count",
    context,
    () =>
      readDb
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeArticles)
        .innerJoin(
          knowledgeCategories,
          eq(knowledgeArticles.categoryId, knowledgeCategories.id),
        )
        .where(where),
  );

  const total = countRow?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / KNOWLEDGE_PAGE_SIZE));
  const page = Math.min(normalized.page, totalPages);
  const items = await withKnowledgeQueryTiming(
    "search-items",
    { ...context, page },
    () => readKnowledgeItems(where, page),
  );

  return {
    items,
    total,
    page,
    pageSize: KNOWLEDGE_PAGE_SIZE,
    totalPages,
  };
}

export async function getPublishedKnowledgeArticleBySlug(
  slug: string,
  language: PublicKnowledgeLanguage,
) {
  const [article] = await readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      summary: knowledgeArticles.summary,
      definition: knowledgeArticles.definition,
      highlights: knowledgeArticles.highlights,
      quickTip: knowledgeArticles.quickTip,
      content: knowledgeArticles.content,
      contentRole: knowledgeArticles.contentRole,
      keywords: knowledgeArticles.keywords,
      language: knowledgeArticles.language,
      translationSourceArticleId: knowledgeArticles.translationSourceArticleId,
      contentRevision: knowledgeArticles.contentRevision,
      translatedFromRevision: knowledgeArticles.translatedFromRevision,
      categoryId: knowledgeArticles.categoryId,
      categoryName: knowledgeCategories.name,
      categorySlug: knowledgeCategories.slug,
      categoryEnName: knowledgeCategories.enName,
      categoryEnSlug: knowledgeCategories.enSlug,
      publishedAt: knowledgeArticles.publishedAt,
      contentUpdatedAt: knowledgeArticles.contentUpdatedAt,
      createdAt: knowledgeArticles.createdAt,
    })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeCategories,
      eq(knowledgeArticles.categoryId, knowledgeCategories.id),
    )
    .where(
      and(eq(knowledgeArticles.slug, slug), publicKnowledgeCondition(language)),
    )
    .limit(1);
  if (!article) return null;

  const [pairedArticle] =
    language === "zh"
      ? await readDb
          .select({
            id: knowledgeArticles.id,
            slug: knowledgeArticles.slug,
            language: knowledgeArticles.language,
          })
          .from(knowledgeArticles)
          .where(
            and(
              eq(knowledgeArticles.translationSourceArticleId, article.id),
              publicKnowledgeCondition("en"),
            ),
          )
          .limit(1)
      : article.translationSourceArticleId
        ? await readDb
            .select({
              id: knowledgeArticles.id,
              slug: knowledgeArticles.slug,
              language: knowledgeArticles.language,
            })
            .from(knowledgeArticles)
            .where(
              and(
                eq(knowledgeArticles.id, article.translationSourceArticleId),
                publicKnowledgeCondition("zh"),
              ),
            )
            .limit(1)
        : [];

  const sources = await listPublishedKnowledgeSources(article.id);
  return { ...article, pairedArticle: pairedArticle ?? null, sources };
}

export async function getRelatedKnowledgeArticles(input: {
  language: PublicKnowledgeLanguage;
  articleId: number;
  categoryId: number;
  limit?: number;
}) {
  return readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      summary: knowledgeArticles.summary,
      definition: knowledgeArticles.definition,
      contentRole: knowledgeArticles.contentRole,
    })
    .from(knowledgeArticles)
    .where(
      and(
        publicKnowledgeCondition(input.language),
        eq(knowledgeArticles.categoryId, input.categoryId),
        ne(knowledgeArticles.id, input.articleId),
        ne(knowledgeArticles.contentRole, "post_purchase_guide"),
      ),
    )
    .orderBy(
      desc(knowledgeArticles.contentUpdatedAt),
      desc(knowledgeArticles.id),
    )
    .limit(Math.min(Math.max(input.limit ?? 4, 1), 8));
}
