import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { readDb } from "@fwqgo/db";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { cacheLife } from "next/cache";
import {
  isPublicCategoryIndexable,
  isPublicTagIndexable,
} from "@fwqgo/core/public-content-policy";
import { decodeSlug } from "@fwqgo/core/utils";
import { attachTagsToPosts } from "@/features/public/data/post-tags";
import {
  categories,
  homepageSlots,
  posts,
  tags,
  postTags,
} from "@fwqgo/db/schema";
import {
  eq,
  desc,
  asc,
  lt,
  gt,
  and,
  not,
  count,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { ilikeContains } from "@/server/db/search";
import { publicPostCondition } from "@/server/posts/public-post-policy";
import {
  publicCategoryPostCount,
  publicTagPostCount,
  readPublicTaxonomyPostCounts,
} from "@/server/posts/public-taxonomy-post-counts";

type PublicLanguage = "zh" | "en";

function publishedChinesePostCondition() {
  return publicPostCondition("zh");
}

function localizeEnglishTag(tag: {
  id: number;
  name: string;
  slug: string;
  enName: string | null;
  enSlug: string | null;
  indexable: boolean;
  publishedPostCount: number;
}) {
  const identity = resolveEnglishTagIdentity(tag);
  return identity
    ? {
        id: tag.id,
        name: identity.name,
        slug: identity.slug,
        publiclyIndexable: isPublicTagIndexable({
          indexable: tag.indexable,
          publishedPostCount: tag.publishedPostCount,
        }),
      }
    : null;
}

async function getPublishedEnglishSlugForSourcePost(postId: number) {
  const [englishPost] = await readDb
    .select({ slug: posts.slug })
    .from(posts)
    .where(
      and(eq(posts.translationSourcePostId, postId), publicPostCondition("en")),
    )
    .orderBy(desc(posts.updatedAt), desc(posts.createdAt), desc(posts.id))
    .limit(1);

  return englishPost?.slug ?? null;
}

/**
 * Keep the metadata path smaller than the article render path. Metadata is
 * requested before the page body, so it should not load tags, recommendations,
 * or any other below-the-fold relation just to produce the document head.
 */
export async function getPublicPostSeoBySlug(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });

  try {
    const decodedSlug = decodeSlug(slug);
    tagCache(cacheTags.posts, cacheTags.postSlug(decodedSlug));
    const [post] = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        keywords: posts.keywords,
        imgUrl: posts.imgUrl,
      })
      .from(posts)
      .where(and(eq(posts.slug, decodedSlug), publishedChinesePostCondition()))
      .limit(1);

    if (!post) return { data: null };

    return {
      data: {
        ...post,
        enSlug: await getPublishedEnglishSlugForSourcePost(post.id),
      },
    };
  } catch (error) {
    throw new Error("获取文章 SEO 信息失败", { cause: error });
  }
}

export async function getEnglishPostSeoBySlug(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });

  try {
    const decodedSlug = decodeSlug(slug);
    tagCache(cacheTags.posts, cacheTags.postSlug(decodedSlug));
    const [post] = await readDb
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        keywords: posts.keywords,
        imgUrl: posts.imgUrl,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(and(eq(posts.slug, decodedSlug), publicPostCondition("en")))
      .limit(1);

    if (!post) return { data: null };

    const [sourcePost] = post.translationSourcePostId
      ? await readDb
          .select({ slug: posts.slug })
          .from(posts)
          .where(
            and(
              eq(posts.id, post.translationSourcePostId),
              publicPostCondition("zh"),
            ),
          )
          .limit(1)
      : [];

    return {
      data: {
        ...post,
        enSlug: decodedSlug,
        chineseSlug: sourcePost?.slug ?? null,
      },
    };
  } catch (error) {
    throw new Error("获取英文文章 SEO 信息失败", { cause: error });
  }
}

export async function getPublishedPostCountByCategoryId(
  categoryId: number,
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.posts, cacheTags.category(categoryId));

  const [result] = await readDb
    .select({ count: count() })
    .from(posts)
    .where(
      and(eq(posts.categoryId, categoryId), publicPostCondition(language)),
    );

  return { data: result?.count ?? 0 };
}

export async function getPostsWithTags(
  limit = 15,
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.posts, cacheTags.tags);

  try {
    const postsData = await readDb.query.posts.findMany({
      where: publicPostCondition(language),
      orderBy: (postTable, { desc: orderByDesc }) => [
        orderByDesc(postTable.createdAt),
        orderByDesc(postTable.id),
      ],
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
    throw new Error("获取文章列表失败", { cause: error });
  }
}

export async function searchPublishedPosts(input: {
  query: string;
  language?: PublicLanguage;
  limit?: number;
}) {
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
          publicPostCondition(language),
          or(
            ilikeContains(posts.title, query),
            ilikeContains(posts.description, query),
            ilikeContains(posts.keywords, query),
            ilikeContains(posts.content, query),
          ),
        ),
      )
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(input.limit ?? 20);

    return { data: await attachTagsToPosts(postsData, language) };
  } catch (error) {
    console.error("Failed to search published posts:", error);
    return { data: [] };
  }
}

/**
 * 首页文章区一次取多少条。
 *
 * 首页最多渲染 9 张卡片（`home-page.tsx` 的 1 篇头条 + 2 篇次条 + 6 篇列表），
 * 这里留 3 条余量，卡片数量微调时不必同时动数据层；若要再往上加，注意两边一起改。
 */
export const HOMEPAGE_POST_QUERY_LIMIT = 12;

export async function getHomepagePostsWithTags(
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(cacheTags.homepage, cacheTags.posts, cacheTags.tags);

  try {
    const { data } = await getPostsWithTags(HOMEPAGE_POST_QUERY_LIMIT, language);
    return { data: await attachTagsToPosts(data, language) };
  } catch (error) {
    throw new Error("获取首页文章失败", { cause: error });
  }
}

export async function getHomepageSidebarData(language: PublicLanguage = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(
    cacheTags.homepage,
    cacheTags.sidebar,
    cacheTags.posts,
    cacheTags.categories,
  );

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
        .from(homepageSlots)
        .innerJoin(posts, eq(homepageSlots.postId, posts.id))
        .where(
          and(
            eq(homepageSlots.language, language),
            eq(homepageSlots.placement, "sidebar"),
            eq(homepageSlots.contentType, "post"),
            eq(homepageSlots.enabled, true),
            or(
              isNull(homepageSlots.startsAt),
              lte(homepageSlots.startsAt, new Date()),
            ),
            or(
              isNull(homepageSlots.endsAt),
              gt(homepageSlots.endsAt, new Date()),
            ),
            publicPostCondition(language),
          ),
        )
        .orderBy(
          asc(homepageSlots.sortOrder),
          desc(homepageSlots.createdAt),
          desc(homepageSlots.id),
        )
        .limit(6);
    } catch (error) {
      throw new Error("获取首页推广文章失败", { cause: error });
    }
  })();

  const editorPicksPromise = (async () => {
    try {
      return await readDb
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          description: posts.description,
          imgUrl: posts.imgUrl,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .innerJoin(categories, eq(posts.categoryId, categories.id))
        .where(
          and(
            eq(categories.name, "站长推荐"),
            publicPostCondition(language),
          ),
        )
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(5);
    } catch (error) {
      throw new Error("获取首页站长推荐文章失败", { cause: error });
    }
  })();

  const [promotedPosts, editorPicks] = await Promise.all([
    promotedPostsPromise,
    editorPicksPromise,
  ]);

  return {
    data: {
      promotedPosts,
      editorPicks,
    },
  };
}

export async function getRecommendedPosts(
  tagId: number | null,
  currentPostId: number,
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
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
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(5);

    return { data: postsData };
  } catch (error) {
    throw new Error("获取推荐文章失败", { cause: error });
  }
}

export async function getPostWithTagsBySlug(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });

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
        content: posts.content,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        views: posts.views,
        recommendedTagId: posts.recommendedTagId,
        recommendedTagName: posts.recommendedTagName,
        recommendedTagSlug: tags.slug,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(posts)
      .leftJoin(tags, eq(posts.recommendedTagId, tags.id))
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .where(and(eq(posts.slug, decodedSlug), publishedChinesePostCondition()))
      .limit(1);

    if (!postRow) {
      return { data: { post: null } };
    }
    const { recommendedTagSlug, ...post } = postRow;

    const postTagsPromise = readDb
      .select({
        tag: {
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          indexable: tags.indexable,
        },
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(eq(postTags.postId, post.id));

    const publishedEnglishSlugPromise = getPublishedEnglishSlugForSourcePost(
      post.id,
    );

    const [postTagsData, publishedEnglishSlug] = await Promise.all([
      postTagsPromise,
      publishedEnglishSlugPromise,
    ]);
    // One grouped count query for the whole page instead of a correlated
    // subquery per category and per tag row.
    const taxonomyPostCounts = await readPublicTaxonomyPostCounts({
      language: "zh",
      categoryIds: [post.categoryId],
      tagIds: postTagsData.map((row) => row.tag.id),
    });

    return {
      data: {
        post: {
          ...post,
          enSlug: publishedEnglishSlug,
          recommendedTagSlug,
          categoryPubliclyIndexable: isPublicCategoryIndexable(
            publicCategoryPostCount(taxonomyPostCounts, post.categoryId),
          ),
          tags: postTagsData.map(({ tag }) => ({
            tag: {
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              publiclyIndexable: isPublicTagIndexable({
                indexable: tag.indexable,
                publishedPostCount: publicTagPostCount(
                  taxonomyPostCounts,
                  tag.id,
                ),
              }),
            },
          })),
        },
      },
    };
  } catch (error) {
    throw new Error("通过slug获取文章失败", { cause: error });
  }
}

export async function getEnglishPostWithTagsBySlug(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });

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
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
        categoryEnName: categories.enName,
        categoryEnSlug: categories.enSlug,
      })
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .where(and(eq(posts.slug, decodedSlug), publicPostCondition("en")))
      .limit(1);

    const postRow = englishPostRow;

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
              publicPostCondition("zh"),
            ),
          )
          .limit(1)
      : [];
    const chineseSlug = sourcePostRow?.slug ?? null;

    const postTagsData = await readDb
      .select({
        tag: {
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
          enName: tags.enName,
          enSlug: tags.enSlug,
          indexable: tags.indexable,
        },
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(eq(postTags.postId, postRow.id));
    // One grouped count query for the whole page instead of a correlated
    // subquery per category and per tag row.
    const taxonomyPostCounts = await readPublicTaxonomyPostCounts({
      language: "en",
      categoryIds: [postRow.categoryId],
      tagIds: postTagsData.map(({ tag }) => tag.id),
    });
    const localizedPostTags = postTagsData
      .map(({ tag }) =>
        localizeEnglishTag({
          ...tag,
          publishedPostCount: publicTagPostCount(taxonomyPostCounts, tag.id),
        }),
      )
      .filter((tag): tag is NonNullable<typeof tag> => tag !== null)
      .map((tag) => ({ tag }));

    return {
      data: {
        post: {
          ...postRow,
          imgUrl: postRow.imgUrl ?? postRow.fallbackImgUrl,
          chineseSlug,
          categoryPubliclyIndexable: isPublicCategoryIndexable(
            publicCategoryPostCount(taxonomyPostCounts, postRow.categoryId),
          ),
          tags: localizedPostTags,
        },
      },
    };
  } catch (error) {
    throw new Error("通过英文 slug 获取文章失败", { cause: error });
  }
}

export async function getPostsWithTagsByCategoryId(
  id: number,
  pageNo: number,
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
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
      .where(and(eq(posts.categoryId, id), publicPostCondition(language)))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .offset((pageNo - 1) * 10)
      .limit(10);

    const postsWithTags = await attachTagsToPosts(postsData, language);

    return { data: postsWithTags, error: undefined };
  } catch (error) {
    throw new Error("通过分类id获取文章列表失败", { cause: error });
  }
}

export async function getPublishedPostCount(language: PublicLanguage = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.posts);

  try {
    const [result] = await readDb
      .select({ count: count() })
      .from(posts)
      .where(publicPostCondition(language));

    return { data: result?.count ?? 0 };
  } catch (error) {
    throw error;
  }
}

export async function getPublishedPostsPage(
  pageNo: number,
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.posts, cacheTags.tags);

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
      .where(publicPostCondition(language))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .offset((pageNo - 1) * 10)
      .limit(10);

    return {
      data: await attachTagsToPosts(postsData, language),
      error: undefined,
    };
  } catch (error) {
    throw new Error("获取全部文章列表失败", { cause: error });
  }
}

/**
 * 同一语言下按 id 相邻的两篇已发布文章，用于详情页的「上一篇/下一篇」。
 *
 * 按 `id` 而不是 `createdAt` 排序：发布时间可以被补录或改写，只有 id 是稳定的
 * 阅读顺序。返回 `[上一篇, 下一篇]`，任一侧不存在时为 `null`。
 */
export async function getAdjacentPublishedPosts(
  postId: number,
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.posts);

  try {
    const navigationFields = {
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
    };
    const [prevRows, nextRows] = await Promise.all([
      readDb
        .select(navigationFields)
        .from(posts)
        .where(and(lt(posts.id, postId), publicPostCondition(language)))
        .orderBy(desc(posts.id))
        .limit(1),
      readDb
        .select(navigationFields)
        .from(posts)
        .where(and(gt(posts.id, postId), publicPostCondition(language)))
        .orderBy(asc(posts.id))
        .limit(1),
    ]);

    // `as const` 保住元组形状：数组字面量默认推断成可变数组，配合
    // `noUncheckedIndexedAccess` 解构出来会是 `T | undefined`，调用方就得多写一层判空。
    return { data: [prevRows[0] ?? null, nextRows[0] ?? null] as const };
  } catch (error) {
    throw new Error("获取上下篇文章失败", { cause: error });
  }
}

export async function getLatestPostsForSidebar(
  language: PublicLanguage = "zh",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
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
    .where(publicPostCondition(language))
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(5);

  return { data: postsData };
}
