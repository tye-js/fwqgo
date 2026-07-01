import { db } from "@fwqgo/db";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import {
  posts,
  categories,
} from "@fwqgo/db/schema";
import {
  eq,
  desc,
  asc,
  gte,
  and,
  count,
  sql,
} from "drizzle-orm";

export { getPostBySlug } from "@/features/public/data/post";

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

export async function getDraftPosts({
  pageNo = 1,
  pageSize = 15,
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
      .where(eq(posts.published, false))
      .orderBy(desc(posts.createdAt))
      .offset((pageNo - 1) * pageSize)
      .limit(pageSize);

    return { data: postsData };
  } catch (error) {
    return { error: "获取草稿列表失败", message: error };
  }
}

export async function getDraftPostCount() {
  "use cache";
  tagCache(cacheTags.posts);

  const [result] = await db
    .select({ count: count() })
    .from(posts)
    .where(eq(posts.published, false));
  return { data: result?.count ?? 0 };
}

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
