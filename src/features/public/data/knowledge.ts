import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";

import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";
import { ilikeContains } from "@/server/db/search";
import { listPublishedKnowledgeSources } from "@/server/knowledge/source-service";

export type PublicKnowledgeLanguage = "zh" | "en";

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
        eq(knowledgeArticles.published, true),
        ne(knowledgeArticles.contentRole, "post_purchase_guide"),
      ),
    )
    .groupBy(knowledgeCategories.id)
    .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.id));
}

export async function listPublishedKnowledgeArticles(input: {
  language: PublicKnowledgeLanguage;
  query?: string;
  categorySlug?: string;
  page?: number;
}) {
  const query = input.query?.trim().slice(0, 120) ?? "";
  const categorySlug = input.categorySlug?.trim().slice(0, 160) ?? "";
  const requestedPage =
    Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  const conditions = [
    eq(knowledgeArticles.language, input.language),
    eq(knowledgeArticles.published, true),
    ne(knowledgeArticles.contentRole, "post_purchase_guide"),
  ];

  if (categorySlug) {
    conditions.push(
      eq(
        input.language === "en"
          ? knowledgeCategories.enSlug
          : knowledgeCategories.slug,
        categorySlug,
      ),
    );
  }
  if (query) {
    conditions.push(
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
      and(
        eq(knowledgeArticles.slug, slug),
        eq(knowledgeArticles.language, language),
        eq(knowledgeArticles.published, true),
      ),
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
              eq(knowledgeArticles.language, "en"),
              eq(knowledgeArticles.published, true),
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
                eq(knowledgeArticles.language, "zh"),
                eq(knowledgeArticles.published, true),
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
        eq(knowledgeArticles.language, input.language),
        eq(knowledgeArticles.published, true),
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
