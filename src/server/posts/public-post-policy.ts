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
    eq(columns.published, true),
    eq(columns.language, language),
    sql`char_length(btrim(${columns.title})) > 0`,
    sql`char_length(btrim(${columns.slug})) > 0`,
    sql`char_length(btrim(${columns.content})) >= ${MIN_PUBLIC_ARTICLE_CONTENT_LENGTH}`,
  );
}

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

export function publicCategoryPostCountSql(
  language: PublicPostLanguage,
  categoryId: AnyPgColumn | number,
) {
  const candidate = alias(posts, "public_category_posts");
  return sql<number>`(
    select count(*)::int from ${posts} public_category_posts
    where public_category_posts."categoryId" = ${categoryId} and ${publicPostCondition(language, candidate)}
  )`;
}
