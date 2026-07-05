import { count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import { categories, posts, serverOffers } from "@fwqgo/db/schema";
import {
  normalizePostLanguageFilter,
  type PostLanguageFilter,
} from "@/features/cms/data/post";

export type PostQualityIssueCode =
  | "seo"
  | "cover"
  | "cover_language"
  | "relation"
  | "affiliate"
  | "offers";

export type PostQualityIssueFilter = "all" | PostQualityIssueCode;

type PostQualityIssue = {
  code: PostQualityIssueCode;
  label: string;
  severity: "blocker" | "warning";
  detail: string;
};

export type PostQualityRow = {
  id: number;
  title: string;
  slug: string;
  language: "zh" | "en";
  published: boolean;
  imgUrl: string | null;
  categoryName: string | null;
  affiliateReviewStatus: string;
  offerCount: number;
  relatedPost: {
    id: number;
    title: string;
    slug: string;
    language: "zh" | "en";
    published: boolean;
  } | null;
  issues: PostQualityIssue[];
  createdAt: string | null;
  updatedAt: string | null;
};

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeLanguage(value: string | null | undefined): "zh" | "en" {
  return value === "en" ? "en" : "zh";
}

function normalizeIssueFilter(
  value: string | undefined,
): PostQualityIssueFilter {
  const allowed = new Set<PostQualityIssueFilter>([
    "all",
    "seo",
    "cover",
    "cover_language",
    "relation",
    "affiliate",
    "offers",
  ]);

  return allowed.has(value as PostQualityIssueFilter)
    ? (value as PostQualityIssueFilter)
    : "all";
}

function coverLanguageIssue(language: "zh" | "en", imgUrl: string | null) {
  const value = imgUrl?.trim().toLowerCase() ?? "";
  if (!value) return null;

  const expected = `-${language}-cover.`;
  const opposite = language === "en" ? "-zh-cover." : "-en-cover.";
  const isGeneratedCover =
    value.includes("/images/covers/") ||
    /-cover\.(webp|png|jpe?g)(\?|#|$)/.test(value);

  if (value.includes(opposite)) {
    return language === "en"
      ? "英文文章封面疑似使用中文命名。"
      : "中文文章封面疑似使用英文命名。";
  }

  if (isGeneratedCover && !value.includes(expected)) {
    return language === "en"
      ? "英文文章生成封面应使用 -en-cover 命名。"
      : "中文文章生成封面应使用 -zh-cover 命名。";
  }

  return null;
}

function buildIssues(input: {
  language: "zh" | "en";
  description: string | null;
  keywords: string | null;
  imgUrl: string | null;
  affiliateReviewStatus: string;
  relatedPost: PostQualityRow["relatedPost"];
  offerCount: number;
}) {
  const issues: PostQualityIssue[] = [];
  const hasDescription = Boolean(input.description?.trim());
  const hasKeywords = Boolean(input.keywords?.trim());

  if (!hasDescription || !hasKeywords) {
    issues.push({
      code: "seo",
      label: "SEO缺失",
      severity: "blocker",
      detail: "摘要或关键词为空，发布前应补齐。",
    });
  }

  if (!input.imgUrl?.trim()) {
    issues.push({
      code: "cover",
      label: "无封面",
      severity: "blocker",
      detail: "文章封面为空，前台列表和详情页会缺图。",
    });
  }

  const coverIssue = coverLanguageIssue(input.language, input.imgUrl);
  if (coverIssue) {
    issues.push({
      code: "cover_language",
      label: "封面语言",
      severity: "blocker",
      detail: coverIssue,
    });
  }

  if (!input.relatedPost) {
    issues.push({
      code: "relation",
      label: input.language === "en" ? "缺中文源" : "缺英文稿",
      severity: input.language === "en" ? "blocker" : "warning",
      detail:
        input.language === "en"
          ? "英文文章没有绑定中文来源文章，后续难以追踪翻译链路。"
          : "中文文章暂未生成对应英文稿，英文前台可能缺内容。",
    });
  }

  if (input.affiliateReviewStatus !== "passed") {
    issues.push({
      code: "affiliate",
      label: "返利未通过",
      severity: "blocker",
      detail: `返利审核状态为 ${input.affiliateReviewStatus}，发布前需要确认链接替换。`,
    });
  }

  if (input.offerCount === 0) {
    issues.push({
      code: "offers",
      label: "无套餐",
      severity: "warning",
      detail: "还没有从文章中提取服务器套餐，可按文章类型决定是否处理。",
    });
  }

  return issues;
}

function issueCondition(
  language: PostLanguageFilter,
): SQL<unknown> | undefined {
  return language === "all" ? undefined : eq(posts.language, language);
}

export async function getPostQualityReport(input: {
  language?: string;
  issue?: string;
  limit?: number;
}) {
  await requireAdminSession();

  const language = normalizePostLanguageFilter(input.language);
  const issue = normalizeIssueFilter(input.issue);
  const limit =
    Number.isInteger(input.limit) && (input.limit ?? 0) > 0
      ? Math.min(input.limit!, 300)
      : 160;

  const postRows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      language: posts.language,
      published: posts.published,
      imgUrl: posts.imgUrl,
      description: posts.description,
      keywords: posts.keywords,
      affiliateReviewStatus: posts.affiliateReviewStatus,
      translationSourcePostId: posts.translationSourcePostId,
      categoryName: categories.name,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(issueCondition(language) ?? sql`true`)
    .orderBy(desc(posts.updatedAt), desc(posts.createdAt))
    .limit(limit);

  const postIds = postRows.map((post) => post.id);
  const sourceIds = postRows
    .map((post) => post.translationSourcePostId)
    .filter((id): id is number => typeof id === "number" && id > 0);
  const relationConditions: SQL<unknown>[] = [];

  if (postIds.length > 0) {
    relationConditions.push(inArray(posts.translationSourcePostId, postIds));
  }

  if (sourceIds.length > 0) {
    relationConditions.push(inArray(posts.id, sourceIds));
  }

  const relatedPosts =
    relationConditions.length > 0
      ? await db
          .select({
            id: posts.id,
            title: posts.title,
            slug: posts.slug,
            language: posts.language,
            published: posts.published,
            translationSourcePostId: posts.translationSourcePostId,
          })
          .from(posts)
          .where(or(...relationConditions))
      : [];

  const offerPostIds = [...new Set([...postIds, ...sourceIds])];
  const offerRows =
    offerPostIds.length > 0
      ? await db
          .select({
            sourcePostId: serverOffers.sourcePostId,
            count: count(),
          })
          .from(serverOffers)
          .where(inArray(serverOffers.sourcePostId, offerPostIds))
          .groupBy(serverOffers.sourcePostId)
      : [];

  const translationsBySourceId = new Map<number, typeof relatedPosts>();
  const sourceById = new Map<number, (typeof relatedPosts)[number]>();

  for (const post of relatedPosts) {
    if (post.translationSourcePostId) {
      const existing =
        translationsBySourceId.get(post.translationSourcePostId) ?? [];
      existing.push(post);
      translationsBySourceId.set(post.translationSourcePostId, existing);
    }
    sourceById.set(post.id, post);
  }

  const offerCountByPostId = new Map(
    offerRows
      .filter(
        (row) => typeof row.sourcePostId === "number" && row.sourcePostId > 0,
      )
      .map((row) => [row.sourcePostId!, Number(row.count) || 0]),
  );

  const allRows: PostQualityRow[] = postRows.map((post) => {
    const postLanguage = normalizeLanguage(post.language);
    const relatedPost =
      postLanguage === "en"
        ? post.translationSourcePostId
          ? (sourceById.get(post.translationSourcePostId) ?? null)
          : null
        : (translationsBySourceId
            .get(post.id)
            ?.find((item) => normalizeLanguage(item.language) === "en") ??
          null);
    const relatedOfferCount =
      post.translationSourcePostId && postLanguage === "en"
        ? (offerCountByPostId.get(post.translationSourcePostId) ?? 0)
        : 0;
    const offerCount = Math.max(
      offerCountByPostId.get(post.id) ?? 0,
      relatedOfferCount,
    );
    const normalizedRelatedPost = relatedPost
      ? {
          id: relatedPost.id,
          title: relatedPost.title,
          slug: relatedPost.slug,
          language: normalizeLanguage(relatedPost.language),
          published: relatedPost.published,
        }
      : null;

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      language: postLanguage,
      published: post.published,
      imgUrl: post.imgUrl,
      categoryName: post.categoryName,
      affiliateReviewStatus: post.affiliateReviewStatus,
      offerCount,
      relatedPost: normalizedRelatedPost,
      issues: buildIssues({
        language: postLanguage,
        description: post.description,
        keywords: post.keywords,
        imgUrl: post.imgUrl,
        affiliateReviewStatus: post.affiliateReviewStatus,
        relatedPost: normalizedRelatedPost,
        offerCount,
      }),
      createdAt: serializeDate(post.createdAt),
      updatedAt: serializeDate(post.updatedAt),
    };
  });

  const rows =
    issue === "all"
      ? allRows
      : allRows.filter((row) => row.issues.some((item) => item.code === issue));
  const blockerCount = allRows.reduce(
    (sum, row) =>
      sum + row.issues.filter((item) => item.severity === "blocker").length,
    0,
  );
  const warningCount = allRows.reduce(
    (sum, row) =>
      sum + row.issues.filter((item) => item.severity === "warning").length,
    0,
  );

  return {
    filters: {
      language,
      issue,
      limit,
    },
    summary: {
      sampledPosts: allRows.length,
      visiblePosts: rows.length,
      issuePosts: allRows.filter((row) => row.issues.length > 0).length,
      blockerCount,
      warningCount,
      publishedWithIssues: allRows.filter(
        (row) => row.published && row.issues.length > 0,
      ).length,
    },
    rows,
  };
}

export type PostQualityReport = Awaited<
  ReturnType<typeof getPostQualityReport>
>;
