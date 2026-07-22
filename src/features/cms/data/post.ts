import { db } from "@fwqgo/db";
import { requireAdminSession } from "@fwqgo/auth/session";
import {
  adminBackgroundJobs,
  aiRewriteConfigs,
  aiRewriteTasks,
  imageAssetReferences,
  imageAssets,
  imageCoverGenerationTasks,
  posts,
  categories,
  postTags,
  providerMonitorRuns,
  serverOffers,
  tags,
} from "@fwqgo/db/schema";
import {
  eq,
  desc,
  asc,
  gte,
  and,
  count,
  sql,
  inArray,
  or,
  type SQL,
} from "drizzle-orm";
import { decodeSlug } from "@fwqgo/core/utils";
import { normalizeOffsetPagination } from "@fwqgo/core/pagination";
import { ilikeContains } from "@/server/db/search";

export type PostLanguageFilter = "all" | "zh" | "en";
export type PostStatusFilter = "all" | "published" | "draft";
export type PostSort =
  | "id-desc"
  | "id-asc"
  | "title-asc"
  | "slug-asc"
  | "published-desc";

function getDataErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "未知错误";
}

export function normalizePostLanguageFilter(
  value: string | undefined,
): PostLanguageFilter {
  return value === "zh" || value === "en" ? value : "all";
}

export function normalizePostStatusFilter(
  value: string | undefined,
): PostStatusFilter {
  return value === "published" || value === "draft" ? value : "all";
}

export function normalizePostSort(value: string | undefined): PostSort {
  return value === "id-asc" ||
    value === "title-asc" ||
    value === "slug-asc" ||
    value === "published-desc"
    ? value
    : "id-desc";
}

function postLanguageCondition(language: PostLanguageFilter) {
  return language === "all" ? sql`true` : eq(posts.language, language);
}

function postSearchCondition(query: string) {
  const normalizedQuery = query.trim().slice(0, 160);
  if (!normalizedQuery) return undefined;

  return or(
    ilikeContains(posts.title, normalizedQuery),
    ilikeContains(posts.slug, normalizedQuery),
  );
}

function postStatusCondition(status: PostStatusFilter) {
  if (status === "published") return eq(posts.published, true);
  if (status === "draft") return eq(posts.published, false);
  return undefined;
}

function postListCondition(input: {
  language: PostLanguageFilter;
  status: PostStatusFilter;
  query: string;
}) {
  return and(
    postLanguageCondition(input.language),
    postStatusCondition(input.status),
    postSearchCondition(input.query),
  );
}

function postListOrderBy(sort: PostSort): SQL[] {
  if (sort === "id-asc") return [asc(posts.id)];
  if (sort === "title-asc") return [asc(posts.title), desc(posts.id)];
  if (sort === "slug-asc") return [asc(posts.slug), desc(posts.id)];
  if (sort === "published-desc") {
    return [desc(posts.published), desc(posts.id)];
  }

  return [desc(posts.id)];
}

function serializeDate(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localizeCmsTag(
  tag: {
    id: number;
    name: string;
    slug: string;
    enName: string | null;
    enSlug: string | null;
  },
  language: string,
) {
  if (language !== "en") {
    return { id: tag.id, name: tag.name, slug: tag.slug };
  }

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

function englishTaskSourceUrl(postId: number) {
  return `post://${postId}/english`;
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
        recommendedTagId: posts.recommendedTagId,
        keywords: posts.keywords,
        categoryId: posts.categoryId,
        language: posts.language,
        translationSourcePostId: posts.translationSourcePostId,
        title: posts.title,
        slug: posts.slug,
        published: posts.published,
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
          enName: tags.enName,
          enSlug: tags.enSlug,
        },
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(eq(postTags.postId, post.id));

    const localizedTags = postTagsData
      .map(({ tag }) => localizeCmsTag(tag, post.language))
      .filter((tag): tag is NonNullable<typeof tag> => tag !== null);
    const localizedRecommendedTag = post.recommendedTagId
      ? localizedTags.find((tag) => tag.id === post.recommendedTagId)
      : null;

    return {
      data: {
        ...post,
        recommendedTagName:
          post.language === "en"
            ? (localizedRecommendedTag?.name ?? null)
            : post.recommendedTagName,
        tags: localizedTags.map((tag) => ({ tag })),
      },
    };
  } catch (error) {
    return {
      error: "通过slug获取文章失败",
      message: getDataErrorMessage(error),
    };
  }
}

export async function getPostProductionContext(postId: number) {
  await requireAdminSession();

  const [currentPost] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      language: posts.language,
      translationSourcePostId: posts.translationSourcePostId,
      imgUrl: posts.imgUrl,
      description: posts.description,
      keywords: posts.keywords,
      published: posts.published,
      affiliateReviewStatus: posts.affiliateReviewStatus,
      affiliateReviewDetails: posts.affiliateReviewDetails,
      affiliateReviewUpdatedAt: posts.affiliateReviewUpdatedAt,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  if (!currentPost) {
    return null;
  }

  const [sourcePost] = currentPost.translationSourcePostId
    ? await db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          language: posts.language,
          imgUrl: posts.imgUrl,
          published: posts.published,
          updatedAt: posts.updatedAt,
        })
        .from(posts)
        .where(eq(posts.id, currentPost.translationSourcePostId))
        .limit(1)
    : [];

  const translations = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      language: posts.language,
      imgUrl: posts.imgUrl,
      published: posts.published,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(eq(posts.translationSourcePostId, currentPost.id))
    .orderBy(desc(posts.updatedAt), desc(posts.createdAt));

  const parentPostId = sourcePost?.id ?? currentPost.id;
  const relatedPostIds = [
    ...new Set([
      currentPost.id,
      parentPostId,
      ...translations.map((post) => post.id),
    ]),
  ];

  const recentTasks = await db
    .select({
      id: aiRewriteTasks.id,
      sourceType: aiRewriteTasks.sourceType,
      sourceUrl: aiRewriteTasks.sourceUrl,
      status: aiRewriteTasks.status,
      progress: aiRewriteTasks.progress,
      currentStep: aiRewriteTasks.currentStep,
      error: aiRewriteTasks.error,
      resultTitle: aiRewriteTasks.resultTitle,
      postId: aiRewriteTasks.postId,
      postSlug: posts.slug,
      postTitle: posts.title,
      model: aiRewriteConfigs.model,
      maxTokens: aiRewriteConfigs.maxTokens,
      aiInputLength: aiRewriteTasks.aiInputLength,
      rewriteOutputLength: aiRewriteTasks.rewriteOutputLength,
      createdAt: aiRewriteTasks.createdAt,
      updatedAt: aiRewriteTasks.updatedAt,
      finishedAt: aiRewriteTasks.finishedAt,
    })
    .from(aiRewriteTasks)
    .leftJoin(posts, eq(aiRewriteTasks.postId, posts.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiRewriteTasks.rewriteStyleId, aiRewriteConfigs.id),
    )
    .where(
      or(
        inArray(aiRewriteTasks.postId, relatedPostIds),
        eq(aiRewriteTasks.sourceUrl, englishTaskSourceUrl(parentPostId)),
      ),
    )
    .orderBy(desc(aiRewriteTasks.createdAt))
    .limit(8);

  const coverTasks =
    relatedPostIds.length > 0
      ? await db
          .select({
            id: imageCoverGenerationTasks.id,
            postId: imageCoverGenerationTasks.postId,
            title: imageCoverGenerationTasks.title,
            status: imageCoverGenerationTasks.status,
            outputUrl: imageCoverGenerationTasks.outputUrl,
            errorTitle: imageCoverGenerationTasks.errorTitle,
            errorDetail: imageCoverGenerationTasks.errorDetail,
            createdAt: imageCoverGenerationTasks.createdAt,
            updatedAt: imageCoverGenerationTasks.updatedAt,
            finishedAt: imageCoverGenerationTasks.finishedAt,
          })
          .from(imageCoverGenerationTasks)
          .where(inArray(imageCoverGenerationTasks.postId, relatedPostIds))
          .orderBy(desc(imageCoverGenerationTasks.createdAt))
          .limit(6)
      : [];

  return {
    currentPost: {
      ...currentPost,
      affiliateReviewUpdatedAt: serializeDate(
        currentPost.affiliateReviewUpdatedAt,
      ),
      createdAt: serializeDate(currentPost.createdAt),
      updatedAt: serializeDate(currentPost.updatedAt),
    },
    sourcePost: sourcePost
      ? {
          ...sourcePost,
          updatedAt: serializeDate(sourcePost.updatedAt),
        }
      : null,
    translations: translations.map((post) => ({
      ...post,
      updatedAt: serializeDate(post.updatedAt),
    })),
    recentTasks: recentTasks.map((task) => ({
      ...task,
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
      finishedAt: serializeDate(task.finishedAt),
    })),
    coverTasks: coverTasks.map((task) => ({
      ...task,
      createdAt: serializeDate(task.createdAt),
      updatedAt: serializeDate(task.updatedAt),
      finishedAt: serializeDate(task.finishedAt),
    })),
  };
}

export async function getPosts({
  pageNo = 1,
  pageSize = 10,
  language = "all",
  query = "",
  status = "all",
  sort = "id-desc",
}: {
  pageNo?: number;
  pageSize?: number;
  language?: PostLanguageFilter;
  query?: string;
  status?: PostStatusFilter;
  sort?: PostSort;
}) {
  try {
    await requireAdminSession();

    const pagination = normalizeOffsetPagination({
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
      .where(postListCondition({ language, status, query }))
      .orderBy(...postListOrderBy(sort))
      .offset(pagination.offset)
      .limit(pagination.pageSize);

    return { data: postsData };
  } catch (error) {
    return {
      error: "获取文章列表失败",
      message: getDataErrorMessage(error),
    };
  }
}

export async function getDraftPosts({
  pageNo = 1,
  pageSize = 15,
  language = "all",
  query = "",
  sort = "id-desc",
}: {
  pageNo?: number;
  pageSize?: number;
  language?: PostLanguageFilter;
  query?: string;
  sort?: PostSort;
}) {
  try {
    await requireAdminSession();

    const pagination = normalizeOffsetPagination({
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
      .where(postListCondition({ language, status: "draft", query }))
      .orderBy(...postListOrderBy(sort))
      .offset(pagination.offset)
      .limit(pagination.pageSize);

    return { data: postsData };
  } catch (error) {
    return {
      error: "获取草稿列表失败",
      message: getDataErrorMessage(error),
    };
  }
}

export async function getDraftPostCount({
  language = "all",
  query = "",
}: {
  language?: PostLanguageFilter;
  query?: string;
} = {}) {
  await requireAdminSession();

  const [result] = await db
    .select({ count: count() })
    .from(posts)
    .where(postListCondition({ language, status: "draft", query }));
  return { data: result?.count ?? 0 };
}

export async function getPostCount({
  language = "all",
  query = "",
  status = "all",
}: {
  language?: PostLanguageFilter;
  query?: string;
  status?: PostStatusFilter;
} = {}) {
  await requireAdminSession();

  const [result] = await db
    .select({ count: count() })
    .from(posts)
    .where(postListCondition({ language, status, query }));
  return { data: result?.count ?? 0 };
}

export async function getDashboardStats() {
  await requireAdminSession();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trendStart = new Date(now);
  trendStart.setHours(0, 0, 0, 0);
  trendStart.setDate(trendStart.getDate() - 6);
  const categoryPublishedCountExpr = sql<number>`count(${posts.id})::int`;
  const categoryTotalViewsExpr = sql<number>`coalesce(sum(${posts.views}), 0)`;
  const trendDayExpr = sql<string>`to_char(date_trunc('day', ${posts.createdAt}), 'YYYY-MM-DD')`;

  const [
    [postSummary],
    aiStatusRows,
    coverStatusRows,
    offerTaskStatusRows,
    backgroundJobStatusRows,
    [offerSummary],
    [imageSummary],
    trendRows,
    topViewedPosts,
    recentPosts,
    topCategories,
  ] = await Promise.all([
    db
      .select({
        totalCount: sql<number>`count(*)::int`,
        publishedCount: sql<number>`(count(*) filter (where ${posts.published} = true))::int`,
        draftCount: sql<number>`(count(*) filter (where ${posts.published} = false))::int`,
        zhPublishedCount: sql<number>`(count(*) filter (where ${posts.published} = true and ${posts.language} = 'zh'))::int`,
        enPublishedCount: sql<number>`(count(*) filter (where ${posts.published} = true and ${posts.language} = 'en'))::int`,
        zhDraftCount: sql<number>`(count(*) filter (where ${posts.published} = false and ${posts.language} = 'zh'))::int`,
        enDraftCount: sql<number>`(count(*) filter (where ${posts.published} = false and ${posts.language} = 'en'))::int`,
        monthlyNewCount: sql<number>`(count(*) filter (where ${posts.createdAt} >= ${sql.param(monthStart, posts.createdAt)}))::int`,
        monthlyPublishedCount: sql<number>`(count(*) filter (where ${posts.published} = true and ${posts.createdAt} >= ${sql.param(monthStart, posts.createdAt)}))::int`,
        totalViews: sql<number>`coalesce(sum(${posts.views}) filter (where ${posts.published} = true), 0)`,
        monthlyReferenceViews: sql<number>`coalesce(sum(${posts.views}) filter (where ${posts.published} = true and ${posts.createdAt} >= ${sql.param(monthStart, posts.createdAt)}), 0)`,
        missingCoverCount: sql<number>`(count(*) filter (where coalesce(btrim(${posts.imgUrl}), '') = ''))::int`,
        affiliateAttentionCount: sql<number>`(count(*) filter (where ${posts.published} = true and ${posts.affiliateReviewStatus} in ('pending', 'manual_required')))::int`,
        contentAttentionCount: sql<number>`(count(*) filter (where coalesce(btrim(${posts.imgUrl}), '') = '' or (${posts.published} = true and ${posts.affiliateReviewStatus} in ('pending', 'manual_required'))))::int`,
      })
      .from(posts),
    db
      .select({ status: aiRewriteTasks.status, count: count() })
      .from(aiRewriteTasks)
      .groupBy(aiRewriteTasks.status),
    db
      .select({ status: imageCoverGenerationTasks.status, count: count() })
      .from(imageCoverGenerationTasks)
      .groupBy(imageCoverGenerationTasks.status),
    db
      .select({ status: providerMonitorRuns.status, count: count() })
      .from(providerMonitorRuns)
      .groupBy(providerMonitorRuns.status),
    db
      .select({ status: adminBackgroundJobs.status, count: count() })
      .from(adminBackgroundJobs)
      .groupBy(adminBackgroundJobs.status),
    db
      .select({
        totalCount: sql<number>`count(*)::int`,
        visibleCount: sql<number>`(count(*) filter (where ${serverOffers.visible} = true))::int`,
        inStockCount: sql<number>`(count(*) filter (where ${serverOffers.status} = 'in_stock'))::int`,
        pendingReviewCount: sql<number>`(count(*) filter (where ${serverOffers.reviewStatus} = 'pending'))::int`,
        needsFixCount: sql<number>`(count(*) filter (where ${serverOffers.reviewStatus} = 'needs_fix'))::int`,
      })
      .from(serverOffers),
    db
      .select({
        totalCount: sql<number>`count(*)::int`,
        unusedCount: sql<number>`(count(*) filter (where not exists (
          select 1 from ${imageAssetReferences}
          where ${imageAssetReferences.imageId} = ${imageAssets.id}
        )))::int`,
        missingAltCount: sql<number>`(count(*) filter (where coalesce(btrim(${imageAssets.altZh}), '') = '' and coalesce(btrim(${imageAssets.altEn}), '') = ''))::int`,
      })
      .from(imageAssets)
      .where(eq(imageAssets.status, "active")),
    db
      .select({
        day: trendDayExpr,
        createdCount: sql<number>`count(*)::int`,
        publishedCount: sql<number>`(count(*) filter (where ${posts.published} = true))::int`,
      })
      .from(posts)
      .where(gte(posts.createdAt, trendStart))
      .groupBy(trendDayExpr)
      .orderBy(trendDayExpr),
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        language: posts.language,
        categoryName: categories.name,
        views: posts.views,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .where(eq(posts.published, true))
      .orderBy(desc(posts.views), desc(posts.createdAt))
      .limit(5),
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        language: posts.language,
        categoryName: categories.name,
        views: posts.views,
        createdAt: posts.createdAt,
        published: posts.published,
      })
      .from(posts)
      .innerJoin(categories, eq(posts.categoryId, categories.id))
      .orderBy(desc(posts.createdAt))
      .limit(6),
    db
      .select({
        id: categories.id,
        name: categories.name,
        publishedCount: categoryPublishedCountExpr,
        totalViews: categoryTotalViewsExpr,
      })
      .from(categories)
      .leftJoin(
        posts,
        and(eq(posts.categoryId, categories.id), eq(posts.published, true)),
      )
      .groupBy(categories.id, categories.name)
      .orderBy(
        desc(categoryPublishedCountExpr),
        desc(categoryTotalViewsExpr),
        asc(categories.id),
      )
      .limit(5),
  ]);

  const asNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const summarizeStatuses = (
    rows: Array<{ status: string; count: number }>,
  ) => {
    const counts = new Map(
      rows.map((row) => [row.status, asNumber(row.count)] as const),
    );
    const value = (...statuses: string[]) =>
      statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);

    return {
      total: Array.from(counts.values()).reduce((sum, count) => sum + count, 0),
      active: value("queued", "pending", "running"),
      succeeded: value("succeeded", "success"),
      failed: value("failed"),
      manualRequired: value("manual_required"),
      cancelled: value("cancelled"),
      attention: value("failed", "manual_required"),
    };
  };
  const formatDayKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const trendByDay = new Map(trendRows.map((row) => [row.day, row]));
  const contentTrend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);
    const row = trendByDay.get(formatDayKey(date));

    return {
      date,
      createdCount: asNumber(row?.createdCount),
      publishedCount: asNumber(row?.publishedCount),
    };
  });
  const publishedPostCount = asNumber(postSummary?.publishedCount);
  const totalViews = asNumber(postSummary?.totalViews);

  return {
    data: {
      overview: {
        publishedPostCount,
        totalPostCount: asNumber(postSummary?.totalCount),
        draftPostCount: asNumber(postSummary?.draftCount),
        zhPublishedPostCount: asNumber(postSummary?.zhPublishedCount),
        enPublishedPostCount: asNumber(postSummary?.enPublishedCount),
        zhDraftPostCount: asNumber(postSummary?.zhDraftCount),
        enDraftPostCount: asNumber(postSummary?.enDraftCount),
        monthlyNewPostCount: asNumber(postSummary?.monthlyNewCount),
        monthlyPublishedPostCount: asNumber(postSummary?.monthlyPublishedCount),
        totalViews,
        monthlyReferenceViews: asNumber(postSummary?.monthlyReferenceViews),
        missingCoverCount: asNumber(postSummary?.missingCoverCount),
        affiliateAttentionCount: asNumber(postSummary?.affiliateAttentionCount),
        contentAttentionCount: asNumber(postSummary?.contentAttentionCount),
        averageViewsPerPublishedPost:
          publishedPostCount > 0
            ? Math.round(totalViews / publishedPostCount)
            : 0,
        monthStart,
        generatedAt: now,
      },
      taskOverview: {
        ai: summarizeStatuses(aiStatusRows),
        cover: summarizeStatuses(coverStatusRows),
        offer: summarizeStatuses(offerTaskStatusRows),
        background: summarizeStatuses(backgroundJobStatusRows),
      },
      operations: {
        offers: {
          totalCount: asNumber(offerSummary?.totalCount),
          visibleCount: asNumber(offerSummary?.visibleCount),
          inStockCount: asNumber(offerSummary?.inStockCount),
          pendingReviewCount: asNumber(offerSummary?.pendingReviewCount),
          needsFixCount: asNumber(offerSummary?.needsFixCount),
        },
        images: {
          totalCount: asNumber(imageSummary?.totalCount),
          unusedCount: asNumber(imageSummary?.unusedCount),
          missingAltCount: asNumber(imageSummary?.missingAltCount),
        },
      },
      contentTrend,
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
