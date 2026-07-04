import { db } from "@fwqgo/db";
import { requireAdminSession } from "@fwqgo/auth/session";
import { posts, categories, postTags, tags } from "@fwqgo/db/schema";
import { eq, desc, asc, gte, and, count, sql } from "drizzle-orm";
import { decodeSlug } from "@fwqgo/core/utils";

export type PostLanguageFilter = "all" | "zh" | "en";

export function normalizePostLanguageFilter(
  value: string | undefined,
): PostLanguageFilter {
  return value === "zh" || value === "en" ? value : "all";
}

function postLanguageCondition(language: PostLanguageFilter) {
  return language === "all" ? sql`true` : eq(posts.language, language);
}

function normalizePagination({
  pageNo,
  pageSize,
  defaultPageSize,
}: {
  pageNo: number;
  pageSize: number;
  defaultPageSize: number;
}) {
  const normalizedPageNo = Number.isInteger(pageNo) && pageNo > 0 ? pageNo : 1;
  const normalizedPageSize =
    Number.isInteger(pageSize) && pageSize > 0
      ? Math.min(pageSize, 100)
      : defaultPageSize;

  return {
    pageNo: normalizedPageNo,
    pageSize: normalizedPageSize,
    offset: (normalizedPageNo - 1) * normalizedPageSize,
  };
}

export async function getPostBySlug(slug: string) {
  try {
    await requireAdminSession();

    const decodedSlug = decodeSlug(slug);
    const [post] = await db
      .select({
        id: posts.id,
        content: posts.content,
        views: posts.views,
        description: posts.description,
        imgUrl: posts.imgUrl,
        recommendedTagName: posts.recommendedTagName,
        keywords: posts.keywords,
        categoryId: posts.categoryId,
        enTitle: posts.enTitle,
        enSlug: posts.enSlug,
        enContent: posts.enContent,
        enKeywords: posts.enKeywords,
        enDescription: posts.enDescription,
        enImgUrl: posts.enImgUrl,
        enUpdatedAt: posts.enUpdatedAt,
        language: posts.language,
        translationSourcePostId: posts.translationSourcePostId,
        title: posts.title,
        slug: posts.slug,
      })
      .from(posts)
      .where(eq(posts.slug, decodedSlug))
      .limit(1);

    if (!post) {
      return { data: null };
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
      .where(eq(postTags.postId, post.id));

    return { data: { ...post, tags: postTagsData } };
  } catch (error) {
    return { error: "通过slug获取文章失败", message: error };
  }
}

export async function getPosts({
  pageNo = 1,
  pageSize = 10,
  language = "all",
}: {
  pageNo?: number;
  pageSize?: number;
  language?: PostLanguageFilter;
}) {
  try {
    await requireAdminSession();

    const pagination = normalizePagination({
      pageNo,
      pageSize,
      defaultPageSize: 10,
    });

    const postsData = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        imgUrl: posts.imgUrl,
        published: posts.published,
        language: posts.language,
      })
      .from(posts)
      .where(postLanguageCondition(language))
      .orderBy(desc(posts.createdAt))
      .offset(pagination.offset)
      .limit(pagination.pageSize);

    return { data: postsData };
  } catch (error) {
    return { error: "获取文章列表失败", message: error };
  }
}

export async function getDraftPosts({
  pageNo = 1,
  pageSize = 15,
  language = "all",
}: {
  pageNo?: number;
  pageSize?: number;
  language?: PostLanguageFilter;
}) {
  try {
    await requireAdminSession();

    const pagination = normalizePagination({
      pageNo,
      pageSize,
      defaultPageSize: 15,
    });

    const postsData = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        imgUrl: posts.imgUrl,
        published: posts.published,
        language: posts.language,
      })
      .from(posts)
      .where(and(eq(posts.published, false), postLanguageCondition(language)))
      .orderBy(desc(posts.createdAt))
      .offset(pagination.offset)
      .limit(pagination.pageSize);

    return { data: postsData };
  } catch (error) {
    return { error: "获取草稿列表失败", message: error };
  }
}

export async function getDraftPostCount(language: PostLanguageFilter = "all") {
  await requireAdminSession();

  const [result] = await db
    .select({ count: count() })
    .from(posts)
    .where(and(eq(posts.published, false), postLanguageCondition(language)));
  return { data: result?.count ?? 0 };
}

export async function getPostCount(language: PostLanguageFilter = "all") {
  await requireAdminSession();

  const [result] = await db
    .select({ count: count() })
    .from(posts)
    .where(postLanguageCondition(language));
  return { data: result?.count ?? 0 };
}

export async function getDashboardStats() {
  await requireAdminSession();

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
    db.select({ count: count() }).from(posts).where(eq(posts.published, true)),
    db.select({ count: count() }).from(posts).where(eq(posts.published, false)),
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
      .orderBy(
        desc(publishedCountExpr),
        desc(totalViewsExpr),
        asc(categories.id),
      )
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
