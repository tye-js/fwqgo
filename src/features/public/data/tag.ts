import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import { slugify } from "@fwqgo/core/utils";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { attachTagsToPosts } from "@fwqgo/db/post-tags";
import { postTags, posts, tags } from "@fwqgo/db/schema";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";

type PublicLanguage = "zh" | "en";

function publishedPostCondition(language: PublicLanguage = "zh") {
  return and(eq(posts.published, true), eq(posts.language, language));
}

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

  return tag;
}

export async function getTagBySlug(
  tagSlug: string,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.tags, cacheTags.tagSlug(tagSlug));

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
      })
      .from(tags)
      .where(
        language === "en"
          ? or(eq(tags.enSlug, tagSlug), eq(tags.slug, tagSlug))
          : eq(tags.slug, tagSlug),
      )
      .limit(1);

    return { data: tag ? localizeTag(tag, language) : null };
  } catch (error) {
    console.error("Failed to load public tag:", error);
    return { error: "通过标签 slug 查询标签信息失败" };
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
    const currentPage = Number.isFinite(pageNo) && pageNo > 0 ? pageNo : 1;

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
      return { data: null };
    }
    const localizedTag = localizeTag(tag, language);
    if (!localizedTag) {
      return { data: null };
    }

    const [[countResult], tagPosts] = await Promise.all([
      readDb
        .select({ count: count() })
        .from(postTags)
        .innerJoin(posts, eq(posts.id, postTags.postId))
        .where(
          and(eq(postTags.tagId, tag.id), publishedPostCondition(language)),
        ),
      readDb
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
          and(eq(postTags.tagId, tag.id), publishedPostCondition(language)),
        )
        .orderBy(desc(posts.createdAt))
        .offset((currentPage - 1) * 10)
        .limit(10),
    ]);

    const postsWithTags = await attachTagsToPosts(tagPosts, language);

    const result = {
      ...localizedTag,
      pageNo: currentPage,
      totalCount: countResult?.count ?? 0,
      posts: postsWithTags.map((post) => ({ post })),
    };

    return { data: result };
  } catch (error) {
    console.error("Failed to load public tag posts:", error);
    return { error: "通过标签获取文章信息失败" };
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
