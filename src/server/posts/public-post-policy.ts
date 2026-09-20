import { and, eq, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";

import { MIN_PUBLIC_ARTICLE_CONTENT_LENGTH } from "@fwqgo/core/public-content-policy";
import { postTags, posts } from "@fwqgo/db/schema";

export type PublicPostLanguage = "zh" | "en";

type PublicPostColumns = Record<
  "published" | "language" | "title" | "slug" | "content",
  AnyPgColumn
>;

export function publicPostCondition(
  language: PublicPostLanguage,
  columns: PublicPostColumns = posts,
) {
  return and(
    // `published` and the content threshold are inlined rather than bound as
    // parameters on purpose.
    //
    // `posts_public_language_created_idx` / `posts_public_category_idx` are
    // partial indexes whose predicate encodes `published = true` plus the
    // length checks. The planner can only use such an index when it can prove
    // the query's conditions imply the predicate, and it cannot prove that for
    // a bound parameter: under a generic plan `published = $n` is not known to
    // be `true`. Postgres keeps a generic plan once the plan cache settles, and
    // postgres.js (`prepare` defaults to true) reuses named prepared statements,
    // so this is reachable in production.
    //
    // Measured on the production primary: generic plan with parameters costs
    // 3.4-4.0ms on the taxonomy counts and 1.3ms on the article list; with the
    // literals the partial index stays selectable and those drop to 0.4-1.4ms.
    // Do not turn these back into parameters.
    sql`${columns.published} = true`,
    eq(columns.language, language),
    sql`char_length(btrim(${columns.title})) > 0`,
    sql`char_length(btrim(${columns.slug})) > 0`,
    sql`char_length(btrim(${columns.content})) >= ${sql.raw(String(MIN_PUBLIC_ARTICLE_CONTENT_LENGTH))}`,
  );
}

/**
 * Threshold-only variant of the public tag post count, for statements that must
 * filter on the count itself (existence checks, taxonomy lookups).
 *
 * Public render paths must not use this per result row: the public post
 * condition reads `posts.content`, which Postgres keeps out of line once an
 * article is TOASTed, so a per-row subquery costs a full detoast pass. Use
 * `readPublicTaxonomyPostCounts` to resolve counts for a whole page once.
 */
export function publicTagPostCountSql(
  language: PublicPostLanguage,
  tagId: AnyPgColumn | number,
) {
  const candidate = alias(posts, "public_tag_posts");
  return sql<number>`(
    select count(*)::int from ${postTags} public_tag_links
    inner join ${posts} public_tag_posts on public_tag_posts."id" = public_tag_links."postId"
    where public_tag_links."tagId" = ${tagId} and ${publicPostCondition(language, candidate)}
  )`;
}
