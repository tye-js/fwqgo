import { and, eq, ne, sql } from "drizzle-orm";

import { knowledgeArticles } from "@fwqgo/db/schema";

export function publicKnowledgeCondition(language?: "zh" | "en") {
  return and(
    eq(knowledgeArticles.published, true),
    ne(knowledgeArticles.contentRole, "post_purchase_guide"),
    language ? eq(knowledgeArticles.language, language) : undefined,
    sql`char_length(btrim(${knowledgeArticles.title})) > 0`,
    sql`char_length(btrim(${knowledgeArticles.slug})) > 0`,
    sql`char_length(btrim(${knowledgeArticles.content})) > 0`,
  );
}
