import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";

import { slugify } from "@fwqgo/core/utils";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { attachTagsToPosts } from "@/features/public/data/post-tags";
import { postTags, posts, tags } from "@fwqgo/db/schema";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { ilikeContains } from "@/server/db/search";
import {
  publicPostCondition,
  publicTagPostCountSql,
} from "@/server/posts/public-post-policy";
import { MIN_INDEXABLE_TAXONOMY_POSTS } from "@fwqgo/core/public-content-policy";

type PublicLanguage = "zh" | "en";

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function localizeTag<
  T extends {
    name: string;
    slug: string;
    description: string | null;
    keywords: string | null;
    enName?: string | null;
    enSlug?: string | null;
    enDescription?: string | null;
    enKeywords?: string | null;
  },
>(tag: T, language: PublicLanguage) {
  if (language === "en") {
    const identity = resolveEnglishTagIdentity(tag);
    if (!identity) return null;

    return {
      ...tag,
      zhSlug: tag.slug,
      name: identity.name,
      slug: identity.slug,
      description: nonEmptyTrim(tag.enDescription) ?? tag.description,
      keywords: nonEmptyTrim(tag.enKeywords) ?? tag.keywords,
    };
  }

  return { ...tag, zhSlug: tag.slug };
}

export async function getTagBySlug(
  tagSlug: string,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.tags, cacheTags.tagSlug(tagSlug));

  try {
    const [tag] = await readDb
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        enName: tags.enName,
        enSlug: tags.enSlug,
        description: tags.description,
        keywords: tags.keywords,
        enDescription: tags.enDescription,
        enKeywords: tags.enKeywords,
        indexable: tags.indexable,
        zhPublishedPostCount: sql<number>`count(${posts.id}) filter (where ${publicPostCondition("zh")})::int`,
        enPublishedPostCount: sql<number>`count(${posts.id}) filter (where ${publicPostCondition("en")})::int`,
      })
      .from(tags)
      .leftJoin(postTags, eq(postTags.tagId, tags.id))
      .leftJoin(posts, eq(posts.id, postTags.postId))
      .where(
        language === "en"
          ? or(eq(tags.enSlug, tagSlug), eq(tags.slug, tagSlug))
          : eq(tags.slug, tagSlug),
      )
      .groupBy(tags.id)
      .limit(1);

    const localizedTag = tag ? localizeTag(tag, language) : null;
    return {
      error: undefined,
      data: localizedTag
        ? {
            ...localizedTag,
            publishedPostCount:
              language === "en"
                ? localizedTag.enPublishedPostCount
                : localizedTag.zhPublishedPostCount,
          }
        : null,
    };
  } catch (error) {
    throw new Error("通过标签 slug 查询标签信息失败", { cause: error });
  }
}

export async function getPostsWithTagsByTagSlug(
  tagSlug: string,
  pageNo = 1,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.tags, cacheTags.tagSlug(tagSlug));

  try {
    const currentPage = Number.isSafeInteger(pageNo) && pageNo > 0 ? pageNo : 1;

    // 首先获取标签信息
    const [tag] = await readDb
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        enName: tags.enName,
        enSlug: tags.enSlug,
        description: tags.description,
        keywords: tags.keywords,
        enDescription: tags.enDescription,
        enKeywords: tags.enKeywords,
        indexable: tags.indexable,
      })
      .from(tags)
      .where(
        language === "en"
          ? or(eq(tags.enSlug, tagSlug), eq(tags.slug, tagSlug))
          : eq(tags.slug, tagSlug),
      )
      .limit(1);

    if (!tag) {
      return { data: null, error: undefined };
    }
    const localizedTag = localizeTag(tag, language);
    if (!localizedTag) {
      return { data: null, error: undefined };
    }

    const [countResult] = await readDb
      .select({ count: count() })
      .from(postTags)
      .innerJoin(posts, eq(posts.id, postTags.postId))
      .where(and(eq(postTags.tagId, tag.id), publicPostCondition(language)));
    const totalCount = countResult?.count ?? 0;
    const totalPage = Math.ceil(totalCount / 10);
    const tagPosts =
      currentPage > Math.max(totalPage, 1)
        ? []
        : await readDb
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
            .where(
              and(eq(postTags.tagId, tag.id), publicPostCondition(language)),
            )
            .orderBy(desc(posts.createdAt), desc(posts.id))
            .offset((currentPage - 1) * 10)
            .limit(10);

    const postsWithTags = await attachTagsToPosts(tagPosts, language);

    const result = {
      ...localizedTag,
      pageNo: currentPage,
      totalCount,
      posts: postsWithTags.map((post) => ({ post })),
    };

    return { data: result, error: undefined };
  } catch (error) {
    throw new Error("通过标签获取文章信息失败", { cause: error });
  }
}

export async function findBestTagMatch(keyword: string) {
  const normalizedKeyword = keyword.trim();

  if (!normalizedKeyword) {
    return { data: null };
  }

  const normalizedSlug = slugify(normalizedKeyword);

  const [tag] = await readDb
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(tags)
    .where(
      and(
        eq(tags.indexable, true),
        sql`${publicTagPostCountSql("zh", tags.id)} >= ${MIN_INDEXABLE_TAXONOMY_POSTS}`,
        or(
          ilikeContains(tags.name, normalizedKeyword),
          ilikeContains(tags.slug, normalizedSlug),
        ),
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
