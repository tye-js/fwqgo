import { and, count, eq, inArray } from "drizzle-orm";

import { readDb } from "@fwqgo/db";
import { postTags, posts } from "@fwqgo/db/schema";

import {
  publicPostCondition,
  type PublicPostLanguage,
} from "./public-post-policy";

export type PublicTaxonomyPostCounts = {
  categories: ReadonlyMap<number, number>;
  tags: ReadonlyMap<number, number>;
};

const EMPTY_COUNTS: PublicTaxonomyPostCounts = {
  categories: new Map(),
  tags: new Map(),
};

type CountRow = { id: number; total: unknown };

type RequestedIds = readonly (number | null | undefined)[];

function requestedIds(ids: RequestedIds | undefined) {
  if (!ids?.length) return [];
  const positive: number[] = [];
  for (const id of ids) {
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) {
      positive.push(id);
    }
  }
  return [...new Set(positive)];
}

async function readCategoryCounts(
  language: PublicPostLanguage,
  categoryIds: number[],
): Promise<CountRow[]> {
  if (categoryIds.length === 0) return [];
  return readDb
    .select({ id: posts.categoryId, total: count() })
    .from(posts)
    .where(
      and(
        inArray(posts.categoryId, categoryIds),
        publicPostCondition(language),
      ),
    )
    .groupBy(posts.categoryId);
}

async function readTagCounts(
  language: PublicPostLanguage,
  tagIds: number[],
): Promise<CountRow[]> {
  if (tagIds.length === 0) return [];
  return readDb
    .select({ id: postTags.tagId, total: count() })
    .from(postTags)
    .innerJoin(posts, eq(postTags.postId, posts.id))
    .where(and(inArray(postTags.tagId, tagIds), publicPostCondition(language)))
    .groupBy(postTags.tagId);
}

/**
 * Resolve the public post count for every requested category/tag in two grouped
 * statements, instead of one correlated subquery per result row.
 *
 * `publicCategoryPostCountSql`/`publicTagPostCountSql` evaluate the public post
 * condition once per emitted row. That condition reads `posts.content`, which
 * Postgres stores out of line once an article grows past the TOAST threshold, so
 * a list or article page that emitted dozens of rows paid for dozens of full
 * detoast passes. The taxonomy decision is unchanged; it is now computed a fixed
 * number of times per request.
 */
export async function readPublicTaxonomyPostCounts(input: {
  language: PublicPostLanguage;
  categoryIds?: RequestedIds;
  tagIds?: RequestedIds;
}): Promise<PublicTaxonomyPostCounts> {
  const categoryIds = requestedIds(input.categoryIds);
  const tagIds = requestedIds(input.tagIds);
  if (categoryIds.length === 0 && tagIds.length === 0) return EMPTY_COUNTS;

  const [categoryRows, tagRows] = await Promise.all([
    readCategoryCounts(input.language, categoryIds),
    readTagCounts(input.language, tagIds),
  ]);

  return {
    categories: new Map(
      categoryRows.map((row) => [row.id, Number(row.total)]),
    ),
    tags: new Map(tagRows.map((row) => [row.id, Number(row.total)])),
  };
}

export function publicCategoryPostCount(
  counts: PublicTaxonomyPostCounts,
  categoryId: number | null | undefined,
) {
  if (typeof categoryId !== "number") return 0;
  return counts.categories.get(categoryId) ?? 0;
}

export function publicTagPostCount(
  counts: PublicTaxonomyPostCounts,
  tagId: number | null | undefined,
) {
  if (typeof tagId !== "number") return 0;
  return counts.tags.get(tagId) ?? 0;
}
