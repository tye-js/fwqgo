import { and, desc, eq, ilike, or } from "drizzle-orm";

import {
  buildKnowledgeSearchTerms,
  rankKnowledgeCandidate,
} from "@fwqgo/core/knowledge-retrieval";
import { readDb } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";

export type RewriteKnowledgeReference = {
  id: number;
  title: string;
  slug: string;
  categoryName: string;
  summary: string | null;
  content: string;
  score: number;
};

export async function retrieveRewriteKnowledge(input: {
  values: Array<string | null | undefined>;
  limit?: number;
}) {
  const terms = buildKnowledgeSearchTerms(input.values);
  if (terms.length === 0) return [];

  const matches = terms.flatMap((term) => {
    const pattern = `%${term}%`;
    return [
      ilike(knowledgeArticles.title, pattern),
      ilike(knowledgeArticles.summary, pattern),
      ilike(knowledgeArticles.keywords, pattern),
      ilike(knowledgeArticles.aliases, pattern),
      ilike(knowledgeArticles.retrievalTerms, pattern),
      ilike(knowledgeCategories.name, pattern),
    ];
  });
  const rows = await readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      categoryName: knowledgeCategories.name,
      summary: knowledgeArticles.summary,
      content: knowledgeArticles.content,
      keywords: knowledgeArticles.keywords,
      aliases: knowledgeArticles.aliases,
      retrievalTerms: knowledgeArticles.retrievalTerms,
    })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeCategories,
      eq(knowledgeArticles.categoryId, knowledgeCategories.id),
    )
    .where(
      and(
        eq(knowledgeArticles.published, true),
        eq(knowledgeArticles.allowAiReference, true),
        or(...matches),
      ),
    )
    .orderBy(desc(knowledgeArticles.updatedAt), desc(knowledgeArticles.id))
    .limit(80);

  return rows
    .map((row) => ({
      ...row,
      score: rankKnowledgeCandidate(row, terms),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || right.id - left.id)
    .slice(
      0,
      Math.min(Math.max(input.limit ?? 5, 1), 8),
    ) satisfies RewriteKnowledgeReference[];
}

export function formatRewriteKnowledgeContext(
  references: RewriteKnowledgeReference[],
  maxLength = 8_000,
) {
  if (references.length === 0) {
    return "未检索到相关知识条目。不要因此补造通用知识或商家事实。";
  }

  let remaining = maxLength;
  const sections: string[] = [];
  for (const reference of references) {
    const heading = `[KB:${reference.id}] ${reference.title}（${reference.categoryName}）`;
    const body = [reference.summary, reference.content]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const section = `${heading}\n${body}`.slice(0, remaining);
    if (section.length < heading.length) break;
    sections.push(section);
    remaining -= section.length + 2;
    if (remaining <= 200) break;
  }

  return sections.join("\n\n");
}
