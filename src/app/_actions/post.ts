"use server";

import { db } from "@/server/db";
import { decodeSlug, slugify } from "@/lib/utils";
import { type CreatePostParams } from "@/types/post.types";
import { type NewTag, type TagMain } from "@/types";
import { attachTagsToPosts } from "@/server/db/post-tags";
import { normalizeArticleHtml } from "@/lib/content";
import { requireAdminSession } from "@/server/auth/session";
import { cacheTags, revalidateSiteContent, tagCache } from "@/server/cache/tags";
import {
  posts,
  categories,
  tags,
  postTags,
  homepagePromotedPosts,
} from "@/server/db/schema";
import {
  eq,
  desc,
  asc,
  lt,
  gt,
  gte,
  and,
  not,
  count,
  inArray,
  sql,
} from "drizzle-orm";

interface CreatePostInput {
  title: string;
  description: string;
  content: string;
  imgUrl?: string;
  published: boolean;
  categoryId: number;
  recommendedTagName?: string | null;
  keywords?: string | null;
}

export async function createPost(input: CreatePostInput | CreatePostParams) {
  try {
    await requireAdminSession();
    const postInput = "post" in input ? input.post : input;
    const inputTags = "tags" in input ? input.tags : [];

    const [category] = await db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, postInput.categoryId))
      .limit(1);

    if (!category) {
      return { error: "分类不存在" };
    }

    const slug = slugify(postInput.title);

    const [existingPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.slug, slug))
      .limit(1);

    if (existingPost) {
      return { error: "文章已存在" };
    }

    const post = await db.transaction(async (tx) => {
      const tagRows = await Promise.all(
        inputTags.map(async (tag) => {
          const tagSlug = slugify(tag.name);
          const [existingTag] = await tx
            .select({ id: tags.id, name: tags.name })
            .from(tags)
            .where(eq(tags.slug, tagSlug))
            .limit(1);

          if (existingTag) {
            return existingTag;
          }

          const [newTag] = await tx
            .insert(tags)
            .values({ name: tag.name, slug: tagSlug })
            .returning({ id: tags.id, name: tags.name });

          return newTag!;
        }),
      );
      const recommendedTag =
        postInput.recommendedTagName
          ? (tagRows.find((tag) => tag.name === postInput.recommendedTagName) ??
            (
              await tx
                .select({ id: tags.id, name: tags.name })
                .from(tags)
                .where(eq(tags.name, postInput.recommendedTagName))
                .limit(1)
            )[0] ??
            null)
          : null;

      const [createdPost] = await tx
        .insert(posts)
        .values({
          ...postInput,
          slug,
          content: normalizeArticleHtml(postInput.content),
          recommendedTagName: recommendedTag?.name ?? null,
          recommendedTagId: recommendedTag?.id ?? null,
        })
        .returning();

      if (createdPost && tagRows.length > 0) {
        await tx.insert(postTags).values(
          tagRows.map((tag) => ({
            postId: createdPost.id,
            tagId: tag.id,
          })),
        );
      }

      return createdPost;
    });

    if (post) {
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        cacheTags.categorySlug(category.slug),
        ...(inputTags.length > 0 ? [cacheTags.tags] : []),
      ]);
    }

    return { data: post };
  } catch (error) {
    return { error: "创建文章失败", message: error };
  }
}

export async function updatePostByRecommendedTagName(
  postId: number,
  recommendedTagName: string,
) {
  try {
    await requireAdminSession();

    // 先验证标签是否存在
    const [tag] = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.name, recommendedTagName))
      .limit(1);

    if (!tag) {
      return { error: `标签 '${recommendedTagName}' 不存在` };
    }

    const [result] = await db
      .update(posts)
      .set({
        recommendedTagName: tag.name,
        recommendedTagId: tag.id,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    if (result) {
      revalidateSiteContent([
        cacheTags.post(result.id),
        cacheTags.postSlug(result.slug),
      ]);
    }

    return { data: result };
  } catch (error) {
    return { error: "更新文章推荐标签失败", message: error };
  }
}

// 获取所有文章列表
export async function getPosts({
  pageNo = 1,
  pageSize = 10,
}: {
  pageNo?: number;
  pageSize?: number;
}) {
  "use cache";
  tagCache(cacheTags.posts);

  try {
    const postsData = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        imgUrl: posts.imgUrl,
        published: posts.published,
      })
      .from(posts)
      .orderBy(desc(posts.createdAt))
      .offset((pageNo - 1) * pageSize)
      .limit(pageSize);

    return { data: postsData };
  } catch (error) {
    return { error: "获取文章列表失败", message: error };
  }
}

// 获取文章总数
export async function getPostCount() {
  "use cache";
  tagCache(cacheTags.posts);

  const [result] = await db.select({ count: count() }).from(posts);
  return { data: result?.count ?? 0 };
}

export async function getDashboardStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const publishedCountExpr = sql<number>`count(${posts.id})`;
  const totalViewsExpr = sql<number>`coalesce(sum(${posts.views}), 0)`;

  const [
    [publishedPostCountResult],
    [draftPostCountResult],
    [monthlyNewPostCountResult],
    [monthlyPublishedPostCountResult],
    [totalViewsResult],
    [monthlyReferenceViewsResult],
    topViewedPosts,
    recentPosts,
    topCategories,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.published, true)),
    db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.published, false)),
    db
      .select({ count: count() })
      .from(posts)
      .where(gte(posts.createdAt, monthStart)),
    db
      .select({ count: count() })
      .from(posts)
      .where(and(eq(posts.published, true), gte(posts.createdAt, monthStart))),
    db
      .select({ totalViews: totalViewsExpr })
      .from(posts)
      .where(eq(posts.published, true)),
    db
      .select({ totalViews: totalViewsExpr })
      .from(posts)
      .where(and(eq(posts.published, true), gte(posts.createdAt, monthStart))),
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        views: posts.views,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(eq(posts.published, true))
      .orderBy(desc(posts.views), desc(posts.createdAt))
      .limit(5),
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        views: posts.views,
        createdAt: posts.createdAt,
        published: posts.published,
      })
      .from(posts)
      .orderBy(desc(posts.createdAt))
      .limit(5),
    db
      .select({
        id: categories.id,
        name: categories.name,
        publishedCount: publishedCountExpr,
        totalViews: totalViewsExpr,
      })
      .from(categories)
      .leftJoin(
        posts,
        and(eq(posts.categoryId, categories.id), eq(posts.published, true)),
      )
      .groupBy(categories.id, categories.name)
      .orderBy(desc(publishedCountExpr), desc(totalViewsExpr), asc(categories.id))
      .limit(5),
  ]);

  const publishedPostCount = publishedPostCountResult?.count ?? 0;
  const totalViews = totalViewsResult?.totalViews ?? 0;

  return {
    data: {
      overview: {
        publishedPostCount,
        draftPostCount: draftPostCountResult?.count ?? 0,
        monthlyNewPostCount: monthlyNewPostCountResult?.count ?? 0,
        monthlyPublishedPostCount: monthlyPublishedPostCountResult?.count ?? 0,
        totalViews,
        monthlyReferenceViews: monthlyReferenceViewsResult?.totalViews ?? 0,
        averageViewsPerPublishedPost:
          publishedPostCount > 0
            ? Math.round(totalViews / publishedPostCount)
            : 0,
        monthStart,
      },
      topViewedPosts,
      recentPosts,
      topCategories: topCategories.map((category) => ({
        ...category,
        publishedCount: category.publishedCount ?? 0,
        totalViews: category.totalViews ?? 0,
      })),
    },
  };
}

export async function getPublishedPostCountByCategoryId(categoryId: number) {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.category(categoryId));

  const [result] = await db
    .select({ count: count() })
    .from(posts)
    .where(and(eq(posts.categoryId, categoryId), eq(posts.published, true)));

  return { data: result?.count ?? 0 };
}

// 更新文章标题/slug/图片链接/发布状态
export async function updatePost(input: {
  id: number;
  title: string;
  slug: string;
  imgUrl: string | null;
  published: boolean;
}) {
  try {
    await requireAdminSession();

    const [currentPost] = await db
      .select({
        slug: posts.slug,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(eq(posts.id, input.id))
      .limit(1);

    const [post] = await db
      .update(posts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(posts.id, input.id))
      .returning();

    if (post) {
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        ...(currentPost?.slug && currentPost.slug !== post.slug
          ? [cacheTags.postSlug(currentPost.slug)]
          : []),
        ...(currentPost?.categoryId ? [cacheTags.category(currentPost.categoryId)] : []),
      ]);
    }

    return { data: post };
  } catch (error) {
    return { error: "更新文章失败", message: error };
  }
}

// 更新文章简述/内容/分类
export async function updatePostContent(input: {
  id: number;
  description: string;
  content: string;
  categoryId: number;
  recommendTagName: string;
  keywords: string;
}) {
  try {
    await requireAdminSession();

    const [currentPost] = await db
      .select({
        slug: posts.slug,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(eq(posts.id, input.id))
      .limit(1);

    let recommendedTag: { id: number; name: string } | null = null;
    if (input.recommendTagName) {
      const [existingTag] = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.name, input.recommendTagName))
        .limit(1);

      if (!existingTag) {
        return { error: "推荐标签不存在，请先创建该标签" };
      }

      recommendedTag = existingTag;
    }

    const [post] = await db
      .update(posts)
      .set({
        description: input.description,
        content: normalizeArticleHtml(input.content),
        categoryId: input.categoryId,
        recommendedTagName: recommendedTag?.name ?? null,
        recommendedTagId: recommendedTag?.id ?? null,
        keywords: input.keywords,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, input.id))
      .returning();

    if (post) {
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        ...(currentPost?.categoryId && currentPost.categoryId !== post.categoryId
          ? [cacheTags.category(currentPost.categoryId)]
          : []),
      ]);
    }

    return { success: true };
  } catch (error) {
    return { error: "更新文章失败", message: error };
  }
}

// 通过ID删除文章
export async function deletePostById(id: number) {
  try {
    await requireAdminSession();

    const [deletedPost] = await db.delete(posts).where(eq(posts.id, id)).returning({
      id: posts.id,
      slug: posts.slug,
      categoryId: posts.categoryId,
    });

    if (deletedPost) {
      revalidateSiteContent([
        cacheTags.post(deletedPost.id),
        cacheTags.postSlug(deletedPost.slug),
        cacheTags.category(deletedPost.categoryId),
      ]);
    }

    return { data: "删除文章成功" };
  } catch (error) {
    return { error: "删除文章失败", message: error };
  }
}

export async function deletePostsByIds(ids: number[]) {
  try {
    await requireAdminSession();

    if (ids.length === 0) {
      return { data: 0 };
    }

    const deletedPosts = await db.delete(posts).where(inArray(posts.id, ids)).returning({
      id: posts.id,
      slug: posts.slug,
      categoryId: posts.categoryId,
    });

    revalidateSiteContent(
      deletedPosts.flatMap((post) => [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
      ]),
    );

    return { data: deletedPosts.length };
  } catch (error) {
    return { error: "批量删除文章失败", message: error };
  }
}

// 获取带有标签的文章列表 (优化 N+1 问题)
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
      .where(eq(posts.categoryId, id))
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
        description: posts.description,
        imgUrl: posts.imgUrl,
        recommendedTagName: posts.recommendedTagName,
        recommendedTagId: posts.recommendedTagId,
        keywords: posts.keywords,
        categoryId: posts.categoryId,
        views: posts.views,
      })
      .from(posts)
      .where(eq(posts.slug, decodedSlug))
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

// 根据推荐标签获取相关文章
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
        content: posts.content,
        createdAt: posts.createdAt,
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

interface UpdatePostTagsParams {
  postId: number;
  oldTags: TagMain[];
  newTags: NewTag[];
}

/**
 * 比较最新的tags与post.tags。
 * 最新的tags中有的，而post.tags中没有的，则插入数据库post-tag表。
 * 最新的tags中没有的，而post.tags中有的，则删除post-tag表中对应的数据。
 * 两边都有的，就不处理
 */
export async function updatePostTags({
  postId,
  oldTags,
  newTags,
}: UpdatePostTagsParams) {
  try {
    await requireAdminSession();

    // 找出需要添加的标签
    const tagsToAdd = newTags.filter(
      (newTag) =>
        !oldTags.some((oldTag) => oldTag.tag.name === newTag.tag.name),
    );

    // 找出需要删除的标签
    const tagsToRemove = oldTags.filter(
      (oldTag) =>
        !newTags.some((newTag) => newTag.tag.name === oldTag.tag.name),
    );

    // 使用事务处理
    await db.transaction(async (tx) => {
      // 1. 删除需要移除的标签文章关联
      if (tagsToRemove.length > 0) {
        await tx.delete(postTags).where(
          and(
            eq(postTags.postId, postId),
            inArray(
              postTags.tagId,
              tagsToRemove.map((tag) => tag.tag.id),
            ),
          ),
        );
      }

      // 2. 创建新标签并获取它们的ID
      if (tagsToAdd.length > 0) {
        const createdTagsIdArray = await Promise.all(
          tagsToAdd.map(async (tag) => {
            const slug = slugify(tag.tag.name);
            const [existingTag] = await tx
              .select({ id: tags.id })
              .from(tags)
              .where(eq(tags.slug, slug))
              .limit(1);

            if (existingTag) {
              return existingTag.id;
            }

            const [newTagResult] = await tx
              .insert(tags)
              .values({
                name: tag.tag.name,
                slug,
              })
              .returning({ id: tags.id });

            return newTagResult!.id;
          }),
        );

        // 向数据库中插入文章标签关联
        await tx.insert(postTags).values(
          createdTagsIdArray.map((tagId) => ({
            postId: postId,
            tagId: tagId,
          })),
        );
      }
    });

    const [post] = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (post) {
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        cacheTags.tags,
      ]);
    }

    return { success: true };
  } catch (error) {
    console.error("更新文章标签失败:", error);
    return { error: "更新文章标签失败" };
  }
}

// 通过id获取当前文章的上下文章
// 通过id获取当前文章的上下文章 (优化 ID 逻辑)
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

/**
 * 侧边栏最新文章
 */
export async function getLatestPostsForSidebar() {
  "use cache";
  tagCache(cacheTags.posts, cacheTags.sidebar);

  const postsData = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      imgUrl: posts.imgUrl,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt))
    .limit(5);

  return { data: postsData };
}
