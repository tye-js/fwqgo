import { db } from "@fwqgo/db";
import { decodeSlug } from "@fwqgo/core/utils";
import { attachTagsToPosts } from "@fwqgo/db/post-tags";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import {
  posts,
  tags,
  postTags,
  homepagePromotedPosts,
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
} from "drizzle-orm";

export async function getPublishedPostCountByCategoryId(categoryId: number) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.category(categoryId));

  const [result] = await db
    .select({ count: count() })
    .from(posts)
    .where(and(eq(posts.categoryId, categoryId), eq(posts.published, true)));

  return { data: result?.count ?? 0 };
}

export async function getPostsWithTags(limit = 15) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.homepage);

  try {
    const postsData = await db.query.posts.findMany({
      where: eq(posts.published, true),
      orderBy: desc(posts.createdAt),
      limit,
      with: {
        tags: {
          with: {
            tag: true,
          },
        },
      },
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

export async function getHomepagePostsWithTags() {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.homepage);

  try {
    return await getPostsWithTags(40);
  } catch (error) {
    console.error("Failed to load homepage posts:", error);
    return { data: [] };
  }
}

export async function getHomepageSidebarData() {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.homepage, cacheTags.sidebar);

  const promotedPostsPromise = (async () => {
    try {
      return await db
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
        .where(eq(posts.published, true))
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
      return await db
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
        .where(eq(posts.published, true))
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

export async function getPostByCategoryId(id: number) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.category(id));

  try {
    const postsData = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        description: posts.description,
        imgUrl: posts.imgUrl,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(and(eq(posts.categoryId, id), eq(posts.published, true)))
      .orderBy(desc(posts.createdAt));

    // 获取每个文章的标签
    const postsWithTags = await Promise.all(
      postsData.map(async (post) => {
        const postTagsData = await db
          .select()
          .from(postTags)
          .where(eq(postTags.postId, post.id));

        return {
          ...post,
          tags: postTagsData,
        };
      }),
    );

    return { data: postsWithTags };
  } catch (error) {
    return { error: "通过分类id获取文章列表失败", message: error };
  }
}

export async function getPostBySlug(slug: string) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.postSlug(decodeSlug(slug)));

  try {
    const decodedSlug = decodeSlug(slug);
    const [post] = await db
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
      .where(and(eq(posts.slug, decodedSlug), eq(posts.published, true)))
      .limit(1);

    if (!post) {
      return { data: null };
    }

    // 获取文章的标签
    const postTagsData = await db
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

    return { data: { ...post, tags: postTagsData } };
  } catch (error) {
    return { error: "通过slug获取文章失败", message: error };
  }
}

export async function getRecommendedPosts(
  tagId: number | null,
  currentPostId: number,
) {
  "use cache";
  if (tagId) {
    tagCache(cacheTags.posts, cacheTags.tag(tagId));
  }

  try {
    if (!tagId) return { data: [] };

    const postsData = await db
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
          eq(posts.published, true),
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
  tagCache(cacheTags.posts, cacheTags.postSlug(decodeSlug(slug)));

  try {
    const decodedSlug = decodeSlug(slug);
    const [postRow] = await db
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
      .where(and(eq(posts.slug, decodedSlug), eq(posts.published, true)))
      .limit(1);

    if (!postRow) {
      return { data: { post: null, recommendedPosts: null } };
    }
    const { recommendedTagSlug, ...post } = postRow;

    // 获取文章的标签
    const postTagsData = await db
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

    // 如果文章存在且有推荐标签，获取推荐文章
    let recommendedPosts = null;
    if (post?.recommendedTagId) {
      const recommended = await getRecommendedPosts(
        post.recommendedTagId,
        post.id,
      );
      recommendedPosts = recommended.data;
    }

    return {
      data: {
        post: {
          ...post,
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
  tagCache(cacheTags.posts, cacheTags.postSlug(decodeSlug(slug)));

  try {
    const decodedSlug = decodeSlug(slug);
    const [postRow] = await db
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
      })
      .from(posts)
      .where(and(eq(posts.enSlug, decodedSlug), eq(posts.published, true)))
      .limit(1);

    if (!postRow?.title || !postRow.content || !postRow.enSlug) {
      return { data: { post: null } };
    }

    const postTagsData = await db
      .select({
        tag: {
          id: tags.id,
          name: tags.name,
          slug: tags.slug,
        },
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(eq(postTags.postId, postRow.id));

    return {
      data: {
        post: {
          ...postRow,
          imgUrl: postRow.imgUrl ?? postRow.fallbackImgUrl,
          tags: postTagsData,
        },
      },
    };
  } catch (error) {
    return { error: "通过英文 slug 获取文章失败", message: error };
  }
}

export async function getPostsWithTagsByCategoryId(id: number, pageNo: number) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.category(id));

  try {
    const postsData = await db
      .select({
        id: posts.id,
        title: posts.title,
        description: posts.description,
        imgUrl: posts.imgUrl,
        createdAt: posts.createdAt,
        slug: posts.slug,
      })
      .from(posts)
      .where(and(eq(posts.categoryId, id), eq(posts.published, true)))
      .orderBy(desc(posts.createdAt))
      .offset((pageNo - 1) * 10)
      .limit(10);

    const postsWithTags = await attachTagsToPosts(postsData);

    return { data: postsWithTags };
  } catch (error) {
    return { error: "通过分类id获取文章列表失败", message: error };
  }
}

export async function getPostsByPostId(id: number) {
  "use cache";
  tagCache(cacheTags.posts);

  try {
    const [prevPost] = await db
      .select()
      .from(posts)
      .where(and(lt(posts.id, id), eq(posts.published, true)))
      .orderBy(desc(posts.id))
      .limit(1);

    const [nextPost] = await db
      .select()
      .from(posts)
      .where(and(gt(posts.id, id), eq(posts.published, true)))
      .orderBy(asc(posts.id))
      .limit(1);

    return { data: [prevPost ?? null, nextPost ?? null] };
  } catch (error) {
    return { error: "获取上下篇文章失败", message: error };
  }
}

export async function getLatestPostsForSidebar() {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.sidebar);

  const postsData = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      imgUrl: posts.imgUrl,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt))
    .limit(5);

  return { data: postsData };
}
