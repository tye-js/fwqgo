import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import { attachTagsToPosts } from "@fwqgo/db/post-tags";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { postTags, posts, tags } from "@fwqgo/db/schema";

export async function getTagBySlug(tagSlug: string) {
  "use cache";
  tagCache(cacheTags.tags, cacheTags.tagSlug(tagSlug));

  try {
    const [tag] = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        description: tags.description,
        keywords: tags.keywords,
        indexable: tags.indexable,
      })
      .from(tags)
      .where(eq(tags.slug, tagSlug))
      .limit(1);

    return { data: tag ?? null };
  } catch (error) {
    return { error: error, message: "通过标签 slug 查询标签信息失败" };
  }
}

export async function getPostsWithTagsByTagSlug(
  tagSlug: string,
  pageNo = 1,
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.tags, cacheTags.tagSlug(tagSlug));

  try {
    const currentPage = Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1;

    // 首先获取标签信息
    const [tag] = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        description: tags.description,
        keywords: tags.keywords,
        indexable: tags.indexable,
      })
      .from(tags)
      .where(eq(tags.slug, tagSlug))
      .limit(1);

    if (!tag) {
      return { data: null };
    }

    const [countResult] = await db
      .select({ count: count() })
      .from(postTags)
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .where(and(eq(postTags.tagId, tag.id), eq(posts.published, true)));

    // 获取该标签下的文章
    const tagPosts = await db
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        slug: posts.slug,
        imgUrl: posts.imgUrl,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .innerJoin(postTags, eq(posts.id, postTags.postId))
      .where(and(eq(postTags.tagId, tag.id), eq(posts.published, true)))
      .orderBy(desc(posts.createdAt))
      .offset((currentPage - 1) * 10)
      .limit(10);

    const postsWithTags = await attachTagsToPosts(tagPosts);

    const result = {
      ...tag,
      pageNo: currentPage,
      totalCount: countResult?.count ?? 0,
      posts: postsWithTags.map((post) => ({ post })),
    };

    return { data: result };
  } catch (error) {
    return { error: error, message: "通过标签获取文章信息失败" };
  }
}

export async function getTagList({
  page = 1,
  pageSize = 20,
}: {
  page?: number;
  pageSize?: number;
}) {
  "use cache";
  tagCache(cacheTags.tags);

  const result = await db
    .select()
    .from(tags)
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  return { data: result };
}

export async function getTagCount() {
  "use cache";
  tagCache(cacheTags.tags);

  const [result] = await db.select({ count: count() }).from(tags);
  return { data: result?.count ?? 0 };
}

export async function getTagSearchList() {
  "use cache";
  tagCache(cacheTags.tags);

  const result = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .orderBy(desc(tags.id));

  return { data: result };
}

export async function findBestTagMatch(keyword: string) {
  "use cache";
  tagCache(cacheTags.tags);

  const normalizedKeyword = keyword.trim();

  if (!normalizedKeyword) {
    return { data: null };
  }

  const normalizedSlug = slugify(normalizedKeyword);

  const [tag] = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .where(
      or(
        ilike(tags.name, `%${normalizedKeyword}%`),
        ilike(tags.slug, `%${normalizedSlug}%`),
      ),
    )
    .orderBy(
      sql`case
        when lower(${tags.name}) = lower(${normalizedKeyword}) then 0
        when lower(${tags.slug}) = lower(${normalizedSlug}) then 1
        when ${tags.name} ilike ${`${normalizedKeyword}%`} then 2
        when ${tags.slug} ilike ${`${normalizedSlug}%`} then 3
        else 4
      end`,
      asc(tags.name),
    )
    .limit(1);

  return { data: tag ?? null };
}
