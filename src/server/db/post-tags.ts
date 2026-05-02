import { type TagMain } from "@/types";
import { db } from "@/server/db";
import { postTags, tags } from "@/server/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

const MAX_CARD_TAGS = 5;

export async function getTagsByPostIds(postIds: number[]) {
  if (postIds.length === 0) {
    return new Map<number, TagMain[]>();
  }

  const rows = await db
    .select({
      postId: postTags.postId,
      tag: {
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
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
      currentTags.push({ tag: row.tag });
      tagsByPostId.set(row.postId, currentTags);
    }
  }

  return tagsByPostId;
}

export async function attachTagsToPosts<T extends { id: number }>(
  postsData: T[],
) {
  const tagsByPostId = await getTagsByPostIds(
    postsData.map((post) => post.id),
  );

  return postsData.map((post) => ({
    ...post,
    tags: tagsByPostId.get(post.id) ?? [],
  }));
}
