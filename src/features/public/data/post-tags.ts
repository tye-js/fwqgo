import { publicTagPostCountSql } from "@/server/posts/public-post-policy";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { asc, eq, inArray } from "drizzle-orm";

import { isPublicTagIndexable } from "@fwqgo/core/public-content-policy";
import { readDb } from "@fwqgo/db";
import { postTags, tags } from "@fwqgo/db/schema";
import type { TagMain } from "@/types";

const MAX_CARD_TAGS = 5;
export type PublicLanguage = "zh" | "en";

function localizeTag(
  tag: {
    id: number;
    name: string;
    slug: string;
    enName: string | null;
    enSlug: string | null;
    indexable: boolean;
    publishedPostCount: number;
  },
  language: PublicLanguage,
) {
  const identity = language === "en" ? resolveEnglishTagIdentity(tag) : tag;
  if (!identity) return null;
  return {
    id: tag.id,
    name: identity.name,
    slug: identity.slug,
    publiclyIndexable: isPublicTagIndexable({
      indexable: tag.indexable,
      publishedPostCount: tag.publishedPostCount,
    }),
  };
}

export async function getTagsByPostIds(
  postIds: number[],
  language: PublicLanguage = "zh",
) {
  if (postIds.length === 0) return new Map<number, TagMain[]>();
  const rows = await readDb
    .select({
      postId: postTags.postId,
      tag: {
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        enName: tags.enName,
        enSlug: tags.enSlug,
        indexable: tags.indexable,
        publishedPostCount: publicTagPostCountSql(language, tags.id),
      },
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, postIds))
    .orderBy(asc(postTags.postId), asc(tags.name));
  const result = new Map<number, TagMain[]>();
  for (const row of rows) {
    const current = result.get(row.postId) ?? [];
    if (current.length >= MAX_CARD_TAGS) continue;
    const localized = localizeTag(row.tag, language);
    if (!localized) continue;
    current.push({ tag: localized });
    result.set(row.postId, current);
  }
  return result;
}

export async function attachTagsToPosts<T extends { id: number }>(
  postsData: T[],
  language: PublicLanguage = "zh",
) {
  const tagsByPostId = await getTagsByPostIds(
    postsData.map((post) => post.id),
    language,
  );
  return postsData.map((post) => ({
    ...post,
    tags: tagsByPostId.get(post.id) ?? [],
  }));
}
