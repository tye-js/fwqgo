import { type TagMain } from "@/types";
import { readDb } from "@fwqgo/db";
import { postTags, tags } from "@fwqgo/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

const MAX_CARD_TAGS = 5;
export type PublicLanguage = "zh" | "en";

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function localizeTag(
  tag: {
    id: number;
    name: string;
    slug: string;
    enName: string | null;
    enSlug: string | null;
  },
  language: PublicLanguage,
) {
  if (language === "en") {
    return {
      id: tag.id,
      name: nonEmptyTrim(tag.enName) ?? tag.name,
      slug: nonEmptyTrim(tag.enSlug) ?? tag.slug,
    };
  }

  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
  };
}

export async function getTagsByPostIds(
  postIds: number[],
  language: PublicLanguage = "zh",
) {
  if (postIds.length === 0) {
    return new Map<number, TagMain[]>();
  }

  const rows = await readDb
    .select({
      postId: postTags.postId,
      tag: {
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        enName: tags.enName,
        enSlug: tags.enSlug,
      },
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, postIds))
    .orderBy(asc(postTags.postId), asc(tags.name));

  const tagsByPostId = new Map<number, TagMain[]>();

  for (const row of rows) {
    const currentTags = tagsByPostId.get(row.postId) ?? [];

    if (currentTags.length < MAX_CARD_TAGS) {
      currentTags.push({ tag: localizeTag(row.tag, language) });
      tagsByPostId.set(row.postId, currentTags);
    }
  }

  return tagsByPostId;
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
