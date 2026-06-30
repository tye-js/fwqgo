"use server";

import { slugify } from "@/lib/utils";
import { db } from "@/server/db";
import { attachTagsToPosts } from "@/server/db/post-tags";
import { requireAdminSession } from "@/server/auth/session";
import { cacheTags, revalidateSiteContent, tagCache } from "@/server/cache/tags";
import { z } from "zod";
import { tags, posts, postTags } from "@/server/db/schema";
import { eq, desc, count, and, asc, ilike, or, sql } from "drizzle-orm";

// 定义输入验证 schema
const createTagSchema = z.object({
  name: z
    .string()
    .min(2, "标签名称至少需要2个字符")
    .max(40, "标签名称不能超过40个字符")
    .trim(),
});

const updateTagIndexableSchema = z.object({
  id: z.number().int().positive(),
  indexable: z.boolean(),
});

// 创建新文章时添加的标签，如果标签已经存在，则返回已存在的标签，否则创建新标签
export async function createTag(input: z.infer<typeof createTagSchema>) {
  await requireAdminSession();

  // 验证输入
  const result = createTagSchema.parse(input);
  // 生成 slug
  const slug = slugify(input.name);

  const [existingTag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);

  if (existingTag) return { id: existingTag.id };

  const [tag] = await db
    .insert(tags)
    .values({ name: result.name, slug })
    .returning({ id: tags.id });

  revalidateSiteContent([cacheTags.tags]);

  return { id: tag!.id };
}

// 创建多个标签
export async function createTags(tags: z.infer<typeof createTagSchema>[]) {
  const resultTags = await Promise.all(
    tags.map(async (tag) => {
      const resultTag = await createTag(tag);
      return { id: resultTag.id };
    }),
  );
  return { data: resultTags };
}

// 查询标签信息
export async function getTagBySlug(tagSlug: string) {
  "use cache";
  tagCache(cacheTags.tags, cacheTags.tagSlug(tagSlug));

  try {
    const [tag] = await db
      .select({
        id: tags.id,
        name: tags.name,
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

// 通过标签 slug 获取多个文章的信息，并且包括每个文章的标签信息
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

export async function getAdminTagList({
  page = 1,
  pageSize = 20,
}: {
  page?: number;
  pageSize?: number;
}) {
  await requireAdminSession();

  const result = await db
    .select()
    .from(tags)
    .orderBy(desc(tags.id))
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  return { data: result };
}

export async function updateTagIndexable(
  input: z.infer<typeof updateTagIndexableSchema>,
) {
  await requireAdminSession();

  const result = updateTagIndexableSchema.parse(input);

  const [tag] = await db
    .update(tags)
    .set({
      indexable: result.indexable,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, result.id))
    .returning({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      indexable: tags.indexable,
    });

  if (!tag) {
    return { error: "没有找到这个标签" };
  }

  revalidateSiteContent([cacheTags.tags, cacheTags.tagSlug(tag.slug)]);

  return { data: tag };
}

export async function getAdminTagCount() {
  await requireAdminSession();

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
