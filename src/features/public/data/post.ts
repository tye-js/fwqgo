import { readDb } from "@fwqgo/db";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { cacheLife } from "next/cache";
import { decodeSlug } from "@fwqgo/core/utils";
import { attachTagsToPosts } from "@fwqgo/db/post-tags";
import { posts, tags, postTags, homepagePromotedPosts } from "@fwqgo/db/schema";
import {
  eq,
  desc,
  asc,
  lt,
  gt,
  and,
  not,
  count,
  sql,
  isNotNull,
  or,
} from "drizzle-orm";
import { ilikeContains } from "@/server/db/search";

type PublicLanguage = "zh" | "en";

function publishedPostCondition(language: PublicLanguage = "zh") {
  return and(eq(posts.published, true), eq(posts.language, language));
}

function publishedChinesePostCondition() {
  return publishedPostCondition("zh");
}

function localizeEnglishTag(tag: {
  id: number;
  name: string;
  slug: string;
  enName: string | null;
  enSlug: string | null;
}) {
  const enName = tag.enName?.trim();
  const enSlug = tag.enSlug?.trim();

  if (enName && enSlug) {
    return { id: tag.id, name: enName, slug: enSlug };
  }

  if (!/\p{Script=Han}/u.test(tag.name) && /^[a-z0-9-]+$/i.test(tag.slug)) {
    return { id: tag.id, name: tag.name, slug: tag.slug };
  }

  return null;
}

async function getPublishedEnglishSlugForSourcePost(postId: number) {
  const [englishPost] = await readDb
    .select({ slug: posts.slug })
    .from(posts)
    .where(
      and(
        eq(posts.translationSourcePostId, postId),
        eq(posts.language, "en"),
        eq(posts.published, true),
      ),
    )
    .orderBy(desc(posts.updatedAt), desc(posts.createdAt))
    .limit(1);

  return englishPost?.slug ?? null;
}

function getLegacyPublishedEnglishSlug(post: {
  enSlug: string | null;
  enContent?: string | null;
}) {
  return post.enSlug && post.enContent ? post.enSlug : null;
}

export async function getPublishedPostCountByCategoryId(
  categoryId: number,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.category(categoryId));

  const [result] = await readDb
    .select({ count: count() })
    .from(posts)
    .where(
      and(eq(posts.categoryId, categoryId), publishedPostCondition(language)),
    );

  return { data: result?.count ?? 0 };
}

export async function getPostsWithTags(
  limit = 15,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.tags);

  try {
    const postsData = await readDb.query.posts.findMany({
      where: publishedPostCondition(language),
      orderBy: desc(posts.createdAt),
      limit,
      columns: {
        id: true,
        title: true,
        slug: true,
        description: true,
        imgUrl: true,
        createdAt: true,
      },
    });

    return { data: postsData };
  } catch (error) {
    return { error: "获取文章列表失败", message: error };
  }
}

export async function searchPublishedPosts(input: {
  query: string;
  language?: PublicLanguage;
  limit?: number;
}) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.tags);

  const query = input.query.trim();
  const language = input.language ?? "zh";
  if (!query) return { data: [] };

  try {
    const postsData = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        description: posts.description,
        imgUrl: posts.imgUrl,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(
        and(
          publishedPostCondition(language),
          or(
            ilikeContains(posts.title, query),
            ilikeContains(posts.description, query),
            ilikeContains(posts.keywords, query),
            ilikeContains(posts.content, query),
          ),
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(input.limit ?? 20);

    return { data: await attachTagsToPosts(postsData, language) };
  } catch (error) {
    console.error("Failed to search published posts:", error);
    return { data: [] };
  }
}

export async function getHomepagePostsWithTags(
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(cacheTags.homepage, cacheTags.posts, cacheTags.tags);

  try {
    const { data, error } = await getPostsWithTags(40, language);
    if (error || !data) return { data: [], error };
    return { data: await attachTagsToPosts(data, language) };
  } catch (error) {
    console.error("Failed to load homepage posts:", error);
    return { data: [] };
  }
}

export async function getHomepageSidebarData(language: PublicLanguage = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(cacheTags.homepage, cacheTags.sidebar, cacheTags.posts);

  const promotedPostsPromise = (async () => {
    try {
      return await readDb
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          description: posts.description,
          imgUrl: posts.imgUrl,
          views: posts.views,
          createdAt: posts.createdAt,
        })
        .from(homepagePromotedPosts)
        .innerJoin(posts, eq(homepagePromotedPosts.postId, posts.id))
        .where(
          and(
            eq(homepagePromotedPosts.language, language),
            publishedPostCondition(language),
          ),
        )
        .orderBy(
          asc(homepagePromotedPosts.sortOrder),
          desc(homepagePromotedPosts.createdAt),
        )
        .limit(6);
    } catch (error) {
      console.error("Failed to load homepage promoted posts:", error);
      return [];
    }
  })();

  const popularPostsPromise = (async () => {
    try {
      return await readDb
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          description: posts.description,
          imgUrl: posts.imgUrl,
          views: posts.views,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(publishedPostCondition(language))
        .orderBy(desc(posts.views), desc(posts.createdAt))
        .limit(6);
    } catch (error) {
      console.error("Failed to load homepage popular posts:", error);
      return [];
    }
  })();

  const [promotedPosts, popularPosts] = await Promise.all([
    promotedPostsPromise,
    popularPostsPromise,
  ]);

  const promotedIds = new Set(promotedPosts.map((post) => post.id));
  const dedupedPopularPosts = popularPosts.filter(
    (post) => !promotedIds.has(post.id),
  );

  return {
    data: {
      promotedPosts,
      popularPosts: dedupedPopularPosts,
    },
  };
}

export async function getPostByCategoryId(
  id: number,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.tags, cacheTags.category(id));

  try {
    const postsData = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        description: posts.description,
        imgUrl: posts.imgUrl,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(and(eq(posts.categoryId, id), publishedPostCondition(language)))
      .orderBy(desc(posts.createdAt));

    const postsWithTags = await attachTagsToPosts(postsData, language);

    return { data: postsWithTags };
  } catch (error) {
    console.error("Failed to load public category posts:", error);
    return { error: "通过分类id获取文章列表失败" };
  }
}

export async function getPostBySlug(slug: string) {
  "use cache";

  try {
    const decodedSlug = decodeSlug(slug);
    tagCache(cacheTags.posts, cacheTags.postSlug(decodedSlug), cacheTags.tags);
    const [post] = await readDb
      .select({
        title: posts.title,
        content: posts.content,
        id: posts.id,
        enSlug: posts.enSlug,
        enTitle: posts.enTitle,
        enContent: posts.enContent,
        enKeywords: posts.enKeywords,
        enDescription: posts.enDescription,
        enImgUrl: posts.enImgUrl,
        enUpdatedAt: posts.enUpdatedAt,
        description: posts.description,
        imgUrl: posts.imgUrl,
        recommendedTagName: posts.recommendedTagName,
        recommendedTagId: posts.recommendedTagId,
        keywords: posts.keywords,
        categoryId: posts.categoryId,
        views: posts.views,
      })
      .from(posts)
      .where(and(eq(posts.slug, decodedSlug), publishedChinesePostCondition()))
      .limit(1);

    if (!post) {
      return { data: null };
    }

    const [postTagsData, publishedEnglishSlug] = await Promise.all([
      readDb
        .select({
          tag: {
            id: tags.id,
            name: tags.name,
            slug: tags.slug,
          },
        })
        .from(postTags)
        .innerJoin(tags, eq(postTags.tagId, tags.id))
        .where(eq(postTags.postId, post.id)),
      getPublishedEnglishSlugForSourcePost(post.id),
    ]);

    return {
      data: {
        ...post,
        enSlug: publishedEnglishSlug ?? getLegacyPublishedEnglishSlug(post),
        tags: postTagsData,
      },
    };
  } catch (error) {
    return { error: "通过slug获取文章失败", message: error };
  }
}

export async function getRecommendedPosts(
  tagId: number | null,
  currentPostId: number,
) {
  "use cache";
  tagCache(cacheTags.posts);

  try {
    if (!tagId) return { data: [] };

    const postsData = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        imgUrl: posts.imgUrl,
      })
      .from(posts)
      .where(
        and(
          eq(posts.recommendedTagId, tagId),
          not(eq(posts.id, currentPostId)),
          publishedChinesePostCondition(),
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(5);

    return { data: postsData };
  } catch (error) {
    return { error: "获取推荐文章失败", message: error };
  }
}

export async function getPostWithTagsBySlug(slug: string) {
  "use cache";

  try {
    const decodedSlug = decodeSlug(slug);
    tagCache(cacheTags.posts, cacheTags.postSlug(decodedSlug), cacheTags.tags);
    const [postRow] = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        keywords: posts.keywords,
        imgUrl: posts.imgUrl,
        enSlug: posts.enSlug,
        enTitle: posts.enTitle,
        enContent: posts.enContent,
        content: posts.content,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        views: posts.views,
        recommendedTagId: posts.recommendedTagId,
        recommendedTagName: posts.recommendedTagName,
        recommendedTagSlug: tags.slug,
      })
      .from(posts)
      .leftJoin(tags, eq(posts.recommendedTagId, tags.id))
      .where(and(eq(posts.slug, decodedSlug), publishedChinesePostCondition()))
      .limit(1);

    if (!postRow) {
      return { data: { post: null, recommendedPosts: null } };
    }
    const { recommendedTagSlug, ...post } = postRow;

    const postTagsPromise = readDb
      .select({
        tag: {
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
        },
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(eq(postTags.postId, post.id));

    const recommendedPostsPromise = post.recommendedTagId
      ? getRecommendedPosts(post.recommendedTagId, post.id).then(
          (recommended) => recommended.data,
        )
      : Promise.resolve(null);
    const publishedEnglishSlugPromise = getPublishedEnglishSlugForSourcePost(
      post.id,
    );

    const [postTagsData, recommendedPosts, publishedEnglishSlug] =
      await Promise.all([
        postTagsPromise,
        recommendedPostsPromise,
        publishedEnglishSlugPromise,
      ]);

    return {
      data: {
        post: {
          ...post,
          enSlug: publishedEnglishSlug ?? getLegacyPublishedEnglishSlug(post),
          recommendedTagSlug,
          tags: postTagsData,
        },
        recommendedPosts,
      },
    };
  } catch (error) {
    return { error: "通过slug获取文章失败", message: error };
  }
}

export async function getEnglishPostWithTagsBySlug(slug: string) {
  "use cache";

  try {
    const decodedSlug = decodeSlug(slug);
    tagCache(cacheTags.posts, cacheTags.postSlug(decodedSlug), cacheTags.tags);
    const [englishPostRow] = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        enSlug: posts.slug,
        description: posts.description,
        keywords: posts.keywords,
        imgUrl: posts.imgUrl,
        fallbackImgUrl: posts.imgUrl,
        content: posts.content,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        views: posts.views,
        recommendedTagId: posts.recommendedTagId,
        recommendedTagName: posts.recommendedTagName,
        language: posts.language,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(
        and(
          eq(posts.slug, decodedSlug),
          eq(posts.language, "en"),
          eq(posts.published, true),
        ),
      )
      .limit(1);

    const [legacyPostRow] = englishPostRow
      ? []
      : await readDb
          .select({
            id: posts.id,
            title: posts.enTitle,
            slug: posts.slug,
            enSlug: posts.enSlug,
            description: posts.enDescription,
            keywords: posts.enKeywords,
            imgUrl: posts.enImgUrl,
            fallbackImgUrl: posts.imgUrl,
            content: posts.enContent,
            createdAt: posts.createdAt,
            updatedAt: posts.enUpdatedAt,
            views: posts.views,
            recommendedTagId: posts.recommendedTagId,
            recommendedTagName: posts.recommendedTagName,
            language: posts.language,
            translationSourcePostId: sql<number | null>`null`,
          })
          .from(posts)
          .where(
            and(
              eq(posts.enSlug, decodedSlug),
              eq(posts.language, "zh"),
              eq(posts.published, true),
              isNotNull(posts.enContent),
            ),
          )
          .limit(1);
    const postRow = englishPostRow ?? legacyPostRow;

    if (!postRow?.title || !postRow.content || !postRow.enSlug) {
      return { data: { post: null } };
    }

    const [sourcePostRow] = englishPostRow?.translationSourcePostId
      ? await readDb
          .select({ slug: posts.slug })
          .from(posts)
          .where(
            and(
              eq(posts.id, englishPostRow.translationSourcePostId),
              eq(posts.language, "zh"),
              eq(posts.published, true),
            ),
          )
          .limit(1)
      : [];
    const chineseSlug = englishPostRow
      ? (sourcePostRow?.slug ?? null)
      : postRow.slug;

    const postTagsData = await readDb
      .select({
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
      .where(eq(postTags.postId, postRow.id));
    const localizedPostTags = postTagsData
      .map(({ tag }) => localizeEnglishTag(tag))
      .filter((tag): tag is NonNullable<typeof tag> => tag !== null)
      .map((tag) => ({ tag }));

    return {
      data: {
        post: {
          ...postRow,
          imgUrl: postRow.imgUrl ?? postRow.fallbackImgUrl,
          chineseSlug,
          tags: localizedPostTags,
        },
      },
    };
  } catch (error) {
    return { error: "通过英文 slug 获取文章失败", message: error };
  }
}

export async function getPostsWithTagsByCategoryId(
  id: number,
  pageNo: number,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.tags, cacheTags.category(id));

  try {
    const postsData = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        imgUrl: posts.imgUrl,
        createdAt: posts.createdAt,
        slug: posts.slug,
      })
      .from(posts)
      .where(and(eq(posts.categoryId, id), publishedPostCondition(language)))
      .orderBy(desc(posts.createdAt))
      .offset((pageNo - 1) * 10)
      .limit(10);

    const postsWithTags = await attachTagsToPosts(postsData, language);

    return { data: postsWithTags };
  } catch (error) {
    return { error: "通过分类id获取文章列表失败", message: error };
  }
}

export async function getPostsByPostId(id: number) {
  "use cache";
  tagCache(cacheTags.posts);

  try {
    const [prevRows, nextRows] = await Promise.all([
      readDb
        .select()
        .from(posts)
        .where(and(lt(posts.id, id), publishedChinesePostCondition()))
        .orderBy(desc(posts.id))
        .limit(1),
      readDb
        .select()
        .from(posts)
        .where(and(gt(posts.id, id), publishedChinesePostCondition()))
        .orderBy(asc(posts.id))
        .limit(1),
    ]);

    return { data: [prevRows[0] ?? null, nextRows[0] ?? null] };
  } catch (error) {
    return { error: "获取上下篇文章失败", message: error };
  }
}

export async function getLatestPostsForSidebar(
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.sidebar);

  const postsData = await readDb
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      imgUrl: posts.imgUrl,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(publishedPostCondition(language))
    .orderBy(desc(posts.createdAt))
    .limit(5);

  return { data: postsData };
}
