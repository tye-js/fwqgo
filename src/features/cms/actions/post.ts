"use server";

import * as cheerio from "cheerio";
import { ZodError } from "zod";
import { revalidatePath } from "next/cache";

import { db } from "@fwqgo/db";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { slugify } from "@fwqgo/core/utils";
import { isPublicArticleSourceRenderable } from "@fwqgo/core/public-content-policy";
import { type CreatePostParams } from "@/types/post.types";
import { type NewTag } from "@/types";
import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";
import {
  postEditSchema,
  PostEditValidationError,
} from "@/features/cms/lib/post-edit";
import {
  cacheTags,
  revalidateSiteContent,
  revalidateSiteContentFromRouteHandler,
} from "@fwqgo/cache/tags";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { rewriteAffiliateLinks } from "@/server/links/affiliate-link-rewriter";
import {
  createPostRecord,
  getErrorMessage,
  prepareArticleContentForStorage,
  type CreatePostInput,
} from "@/server/posts/create-post-record";
import {
  deleteImageReferencesForPosts,
  syncImageReferencesForPost,
} from "@/server/images/assets";
import { posts, categories, tags, postTags } from "@fwqgo/db/schema";
import { desc, eq, and, inArray, ne, or, sql } from "drizzle-orm";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { markPostInternalLinksStale } from "@/server/posts/internal-links";

function normalizeTagName(name: string) {
  return name.trim();
}

function normalizeSeoKeywords(value: string) {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(",");
}

function revalidateImageAssetList() {
  revalidatePath("/images/list");
}

function revalidatePostWorkbenches() {
  revalidatePath("/posts/edit");
  revalidatePath("/posts/drafts");
  revalidatePath("/posts/quality");
}

type PostCacheIdentity = {
  id: number;
  slug: string;
  categoryId: number;
};

/**
 * 批量文章操作的单次上限。
 *
 * 后台列表页尺寸为 15 且翻页会重挂载列表组件（选中集合随之清空），
 * 所以当前 UI 不可能触达该上限。这里仍然显式拒绝超限请求，
 * 而不是让 normalizePostIds 静默 slice：一旦上限被触达，
 * 静默截断会产生「提示处理了 N 篇、实际只处理了前 100 篇」的部分成功，
 * 与 batchGenerateArticleCoverImagesAction 的显式拒绝保持一致。
 */
const MAX_BULK_POST_IDS = 100;

function parseIntegerId(value: number) {
  const parsed = postgresIntegerIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizePostIds(ids: number[], limit = MAX_BULK_POST_IDS) {
  return [
    ...new Set(
      ids.map(parseIntegerId).filter((id): id is number => id !== null),
    ),
  ].slice(0, limit);
}

function exceedsBulkPostIdLimit(ids: number[]) {
  return ids.length > MAX_BULK_POST_IDS;
}

function bulkPostIdLimitMessage(action: string) {
  return `单次最多${action} ${MAX_BULK_POST_IDS} 篇文章，请减少选择后重试`;
}

function getPostCacheTags(
  deletedPosts: PostCacheIdentity[],
  translationSourcePosts: PostCacheIdentity[],
) {
  return [...deletedPosts, ...translationSourcePosts].flatMap((post) => [
    cacheTags.post(post.id),
    cacheTags.postSlug(post.slug),
    cacheTags.category(post.categoryId),
  ]);
}

async function runPostDeletionMaintenance(input: {
  deletedPosts: PostCacheIdentity[];
  translationSourcePosts: PostCacheIdentity[];
  cleanup: () => Promise<unknown>;
}) {
  const warnings: string[] = [];

  try {
    await input.cleanup();
  } catch (error) {
    console.error("文章已删除，但图片引用清理失败:", error);
    warnings.push("文章已删除，但图片引用索引暂未清理");
  }

  try {
    revalidateImageAssetList();
    revalidatePostWorkbenches();
  } catch (error) {
    console.error("文章已删除，但后台列表刷新失败:", error);
    warnings.push("文章已删除，但后台列表刷新延迟");
  }

  const allPosts = [...input.deletedPosts, ...input.translationSourcePosts];
  const tags = getPostCacheTags(
    input.deletedPosts,
    input.translationSourcePosts,
  );
  try {
    revalidateSiteContent(tags);
  } catch (error) {
    console.error("文章已删除，但站内缓存刷新失败:", error);
    warnings.push("文章已删除，但页面缓存刷新延迟");
  }

  try {
    schedulePublicWebCache("post.changed", {
      postIds: allPosts.map((post) => post.id),
      postSlugs: allPosts.map((post) => post.slug),
      categoryIds: allPosts.map((post) => post.categoryId),
    });
  } catch (error) {
    console.error("文章已删除，但公网缓存刷新未排队:", error);
    warnings.push("文章已删除，但公网页面可能需要稍后刷新");
  }

  return warnings;
}

async function prepareEditedArticleContent(content: string) {
  try {
    return {
      content: await prepareArticleContentForStorage(content),
      warnings: [] as string[],
    };
  } catch (error) {
    console.error("文章正文自动链接处理失败，已保留原始正文:", error);
    return {
      content,
      warnings: ["自动短链处理失败，正文已按原始链接保存"],
    };
  }
}

async function runPostSaveMaintenance(input: {
  postId: number;
  revalidationTags: string[];
  routeHandler?: boolean;
}) {
  const warnings: string[] = [];

  try {
    await syncImageReferencesForPost(input.postId);
  } catch (error) {
    console.error("文章已保存，但图片引用同步失败:", error);
    warnings.push("图片引用索引暂未同步，可稍后在图片资产页重建引用");
  }

  try {
    revalidateImageAssetList();
    revalidatePostWorkbenches();
  } catch (error) {
    console.error("文章已保存，但后台列表刷新失败:", error);
    warnings.push("后台列表刷新延迟");
  }

  try {
    if (input.routeHandler) {
      revalidateSiteContentFromRouteHandler(input.revalidationTags);
    } else {
      revalidateSiteContent(input.revalidationTags);
    }
  } catch (error) {
    console.error("文章已保存，但站内缓存刷新失败:", error);
    warnings.push("页面缓存刷新延迟，稍后刷新页面即可");
  }

  try {
    schedulePublicWebCache("post.changed", {
      postIds: [input.postId],
      postSlugs: input.revalidationTags
        .filter((tag) => tag.startsWith("post-slug:"))
        .map((tag) => tag.slice("post-slug:".length)),
    });
  } catch (error) {
    console.error("文章已保存，但公网缓存刷新未排队:", error);
    warnings.push("公网页面可能需要稍后刷新");
  }

  return warnings;
}

async function revalidateChangedPosts(
  changedPosts: Array<{
    id: number;
    slug: string;
    categoryId: number;
    translationSourcePostId?: number | null;
  }>,
) {
  const warnings: string[] = [];

  if (changedPosts.length === 0) {
    try {
      revalidatePostWorkbenches();
    } catch (error) {
      console.error("批量操作后后台列表刷新失败:", error);
      warnings.push("后台列表刷新延迟");
    }
    return warnings;
  }

  const translationSourceIds = [
    ...new Set(
      changedPosts
        .map((post) => post.translationSourcePostId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  let translationSourcePosts: Array<{
    id: number;
    slug: string;
    categoryId: number;
  }> = [];
  if (translationSourceIds.length > 0) {
    try {
      translationSourcePosts = await db
        .select({
          id: posts.id,
          slug: posts.slug,
          categoryId: posts.categoryId,
        })
        .from(posts)
        .where(inArray(posts.id, translationSourceIds));
    } catch (error) {
      console.error("批量操作后读取翻译源文章失败:", error);
      warnings.push("翻译源文章页面缓存可能延迟刷新");
    }
  }

  try {
    revalidatePostWorkbenches();
  } catch (error) {
    console.error("批量操作后后台列表刷新失败:", error);
    warnings.push("后台列表刷新延迟");
  }

  try {
    revalidateSiteContent([
      ...changedPosts.flatMap((post) => [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
      ]),
      ...translationSourcePosts.flatMap((post) => [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
      ]),
    ]);
  } catch (error) {
    console.error("批量操作后站内缓存刷新失败:", error);
    warnings.push("页面缓存刷新延迟，稍后刷新页面即可");
  }

  try {
    schedulePublicWebCache("post.changed", {
      postIds: [
        ...changedPosts.map((post) => post.id),
        ...translationSourcePosts.map((post) => post.id),
      ],
      postSlugs: [
        ...changedPosts.map((post) => post.slug),
        ...translationSourcePosts.map((post) => post.slug),
      ],
      categoryIds: [
        ...changedPosts.map((post) => post.categoryId),
        ...translationSourcePosts.map((post) => post.categoryId),
      ],
    });
  } catch (error) {
    console.error("批量操作后公网缓存刷新未排队:", error);
    warnings.push("公网页面可能需要稍后刷新");
  }

  return warnings;
}

async function auditAffiliateLinksForPublish(content: string) {
  const siteBaseUrl = process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com";
  const $ = cheerio.load(renderArticleContentHtml(content), null, false);
  const report = await rewriteAffiliateLinks({
    $,
    baseUrl: siteBaseUrl,
    sourceHost: new URL(siteBaseUrl).hostname,
    removeInternal: false,
  });
  const manualLinks = report.invalidLinks;
  const manualHosts = [
    ...new Set(
      manualLinks
        .map((item) => item.host)
        .filter((host): host is string => Boolean(host)),
    ),
  ];

  return {
    report,
    manualRequired: report.invalidLinks.length > 0,
    details: {
      totalLinks: report.totalLinks,
      matchedCount: report.matchedLinks.length,
      unmatchedCount: report.unmatchedLinks.length,
      invalidCount: report.invalidLinks.length,
      internalLinksRemoved: report.internalLinksRemoved,
      matchedLinks: report.matchedLinks,
      unmatchedLinks: report.unmatchedLinks,
      invalidLinks: report.invalidLinks,
      manualHosts,
      checkedAt: new Date().toISOString(),
    },
  };
}

type ManualAffiliateApproval = {
  approvedAt: string;
  approvedBy: string;
  reason: "operator_confirmed";
};

function getManualAffiliateApproval(
  value: string | null | undefined,
): ManualAffiliateApproval | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const approval = (parsed as Record<string, unknown>).manualApproval;
    if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
      return null;
    }

    const record = approval as Record<string, unknown>;
    if (
      typeof record.approvedAt !== "string" ||
      typeof record.approvedBy !== "string" ||
      record.reason !== "operator_confirmed"
    ) {
      return null;
    }

    return {
      approvedAt: record.approvedAt,
      approvedBy: record.approvedBy,
      reason: "operator_confirmed",
    };
  } catch {
    return null;
  }
}

function serializeAffiliateReviewDetails(
  audit: Awaited<ReturnType<typeof auditAffiliateLinksForPublish>>,
  manualApproval?: ManualAffiliateApproval | null,
) {
  return JSON.stringify({
    ...audit.details,
    ...(manualApproval ? { manualApproval } : {}),
  });
}

function affiliateAuditMessage(
  audit: Awaited<ReturnType<typeof auditAffiliateLinksForPublish>>,
) {
  const unmatchedNote =
    audit.details.unmatchedCount > 0
      ? `另有 ${audit.details.unmatchedCount} 条未命中外链会保留原链接，不影响发布。`
      : "";

  return `发现 ${audit.details.invalidCount} 条无效链接。${unmatchedNote}请修复无效链接；也可以先保存为草稿，再到发布质检中人工确认。`;
}

export async function createPost(input: CreatePostInput | CreatePostParams) {
  try {
    await requireAdminSession();
    const postInput = "post" in input ? input.post : input;
    if (parseIntegerId(postInput.categoryId) === null) {
      return { error: "文章分类不正确" };
    }
    const publishAudit = postInput.published
      ? await auditAffiliateLinksForPublish(postInput.content)
      : null;

    if (publishAudit?.manualRequired) {
      return {
        error: "发布前返利链接检查未通过",
        message: affiliateAuditMessage(publishAudit),
      };
    }

    const result = await createPostRecord(input);
    if (result.data) {
      if (publishAudit) {
        try {
          await db
            .update(posts)
            .set({
              affiliateReviewDetails:
                serializeAffiliateReviewDetails(publishAudit),
              affiliateReviewUpdatedAt: new Date(),
            })
            .where(eq(posts.id, result.data.id));
        } catch (error) {
          console.error("文章已创建，但返利检查明细保存失败:", error);
        }
      }

      try {
        revalidateImageAssetList();
        revalidatePostWorkbenches();
      } catch (error) {
        console.error("文章已创建，但后台列表刷新失败:", error);
      }
    }
    return result;
  } catch (error) {
    console.error("创建文章失败:", error);
    return { error: "创建文章失败", message: getErrorMessage(error) };
  }
}

export async function updatePostByRecommendedTagName(
  postId: number,
  recommendedTagName: string,
) {
  try {
    await requireAdminSession();
    const parsedPostId = parseIntegerId(postId);
    if (parsedPostId === null) return { error: "文章 ID 不正确" };

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
      .where(eq(posts.id, parsedPostId))
      .returning();

    if (result) {
      await markPostInternalLinksStale(result.id);
      revalidateSiteContent([
        cacheTags.post(result.id),
        cacheTags.postSlug(result.slug),
      ]);
      schedulePublicWebCache("post.changed", {
        postIds: [result.id],
        postSlugs: [result.slug],
        categoryIds: [result.categoryId],
      });
    }

    return { data: result };
  } catch (error) {
    return {
      error: "更新文章推荐标签失败",
      message: getErrorMessage(error),
    };
  }
}

export async function updatePost(input: {
  id: number;
  title: string;
  slug: string;
  imgUrl: string | null;
  published: boolean;
  allowSlugChange?: boolean;
  routeHandler?: boolean;
}) {
  try {
    await requireAdminSession();

    const parsedPostId = parseIntegerId(input.id);
    if (parsedPostId === null) {
      return { error: "文章 ID 不正确" };
    }

    const normalizedTitle = input.title.trim();
    const normalizedSlug = input.slug.trim();
    let normalizedImgUrl = input.imgUrl?.trim() ?? null;
    if (normalizedImgUrl === "") normalizedImgUrl = null;

    if (!normalizedTitle) {
      return { error: "文章标题不能为空" };
    }

    if (normalizedTitle.length > 300) {
      return { error: "文章标题不能超过 300 个字符" };
    }

    if (!normalizedSlug) {
      return { error: "文章 slug 不能为空" };
    }

    if (normalizedSlug.length > 320) {
      return { error: "文章 slug 不能超过 320 个字符" };
    }

    if (/[\s/?#]/.test(normalizedSlug)) {
      return { error: "文章 slug 不能包含空格、斜杠、问号或井号" };
    }

    if (typeof input.published !== "boolean") {
      return { error: "文章发布状态不正确" };
    }

    const [currentPost] = await db
      .select({
        title: posts.title,
        slug: posts.slug,
        categoryId: posts.categoryId,
        content: posts.content,
        published: posts.published,
        slugLocked: posts.slugLocked,
        affiliateReviewStatus: posts.affiliateReviewStatus,
        affiliateReviewDetails: posts.affiliateReviewDetails,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(eq(posts.id, parsedPostId))
      .limit(1);

    if (!currentPost) {
      return { error: "文章不存在" };
    }

    if (
      (currentPost.published || currentPost.slugLocked) &&
      currentPost.slug !== normalizedSlug &&
      input.allowSlugChange !== true
    ) {
      return {
        error: "已发布文章的 slug 已锁定",
        message:
          "请在文章编辑页启用修改地址；保存时会自动保留历史地址的永久跳转。",
      };
    }
    if (
      input.published &&
      !isPublicArticleSourceRenderable({
        title: normalizedTitle,
        slug: normalizedSlug,
        content: currentPost.content,
      })
    ) {
      return {
        error: "正文不足，无法发布",
        message:
          "公开文章需要标题、slug 和至少 200 个字符的正文。请补充正文或保存为草稿。",
      };
    }

    const [duplicatedSlugPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.slug, normalizedSlug), ne(posts.id, parsedPostId)))
      .limit(1);

    if (duplicatedSlugPost) {
      return { error: "文章 slug 已被其他文章使用" };
    }

    let publishAudit: Awaited<
      ReturnType<typeof auditAffiliateLinksForPublish>
    > | null = null;
    let manualApproval: ManualAffiliateApproval | null = null;

    if (input.published && currentPost.content) {
      publishAudit = await auditAffiliateLinksForPublish(currentPost.content);
      manualApproval =
        currentPost.affiliateReviewStatus === "passed"
          ? getManualAffiliateApproval(currentPost.affiliateReviewDetails)
          : null;

      if (publishAudit.manualRequired && !manualApproval) {
        const [blockedPost] = await db
          .update(posts)
          .set({
            title: normalizedTitle,
            slug: currentPost.slug,
            imgUrl: normalizedImgUrl,
            published: false,
            affiliateReviewStatus: "manual_required",
            affiliateReviewDetails:
              serializeAffiliateReviewDetails(publishAudit),
            affiliateReviewUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(posts.id, parsedPostId),
              eq(posts.content, currentPost.content),
              eq(posts.slug, currentPost.slug),
              eq(posts.published, currentPost.published),
            ),
          )
          .returning({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          });

        if (blockedPost) {
          await runPostSaveMaintenance({
            postId: blockedPost.id,
            routeHandler: input.routeHandler,
            revalidationTags: [
              cacheTags.post(blockedPost.id),
              cacheTags.postSlug(blockedPost.slug),
              cacheTags.category(blockedPost.categoryId),
              ...(currentPost.slug && currentPost.slug !== blockedPost.slug
                ? [cacheTags.postSlug(currentPost.slug)]
                : []),
            ],
          });
        }

        return {
          error: "发布前返利链接检查未通过",
          message: affiliateAuditMessage(publishAudit),
        };
      }
    }

    const [post] = await db.transaction(async (tx) => {
      if (input.allowSlugChange === true) {
        await tx.execute(
          sql`select set_config('fwqgo.allow_slug_change', 'on', true)`,
        );
      }
      return tx
        .update(posts)
        .set({
          title: normalizedTitle,
          slug: normalizedSlug,
          imgUrl: normalizedImgUrl,
          published: input.published,
          affiliateReviewStatus: input.published ? "passed" : "pending",
          affiliateReviewDetails:
            input.published && publishAudit
              ? serializeAffiliateReviewDetails(
                  publishAudit,
                  publishAudit.manualRequired ? manualApproval : null,
                )
              : null,
          affiliateReviewUpdatedAt: input.published ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(posts.id, parsedPostId),
            eq(posts.content, currentPost.content),
            eq(posts.slug, currentPost.slug),
            eq(posts.published, currentPost.published),
          ),
        )
        .returning();
    });

    if (!post) {
      return { error: "文章已被其他操作更新，请刷新后重试" };
    }

    if (currentPost.title !== post.title) {
      await markPostInternalLinksStale(post.id);
    }

    const [translationSourcePost] = post.translationSourcePostId
      ? await db
          .select({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          })
          .from(posts)
          .where(eq(posts.id, post.translationSourcePostId))
          .limit(1)
      : [];
    const warnings = await runPostSaveMaintenance({
      postId: post.id,
      routeHandler: input.routeHandler,
      revalidationTags: [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        ...(currentPost.slug && currentPost.slug !== post.slug
          ? [cacheTags.postSlug(currentPost.slug)]
          : []),
        cacheTags.category(currentPost.categoryId),
        ...(translationSourcePost
          ? [
              cacheTags.post(translationSourcePost.id),
              cacheTags.postSlug(translationSourcePost.slug),
              cacheTags.category(translationSourcePost.categoryId),
            ]
          : []),
      ],
    });

    return { data: post, warnings };
  } catch (error) {
    console.error("更新文章失败:", error);
    return { error: "更新文章失败", message: getErrorMessage(error) };
  }
}

async function getAffiliateReviewTarget(postId: number) {
  const parsedPostId = parseIntegerId(postId);
  if (parsedPostId === null) {
    return null;
  }

  const [post] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      content: posts.content,
      categoryId: posts.categoryId,
      translationSourcePostId: posts.translationSourcePostId,
    })
    .from(posts)
    .where(eq(posts.id, parsedPostId))
    .limit(1);

  return post ?? null;
}

async function revalidateAffiliateReviewTarget(
  post: NonNullable<Awaited<ReturnType<typeof getAffiliateReviewTarget>>>,
) {
  await revalidateChangedPosts([
    {
      id: post.id,
      slug: post.slug,
      categoryId: post.categoryId,
      translationSourcePostId: post.translationSourcePostId,
    },
  ]);
}

export async function reviewPostAffiliateLinksAction(postId: number) {
  try {
    await requireAdminSession();
    const post = await getAffiliateReviewTarget(postId);

    if (!post) {
      return { error: "文章不存在或已被删除" };
    }

    const audit = await auditAffiliateLinksForPublish(post.content);
    const status = audit.manualRequired ? "manual_required" : "passed";
    const [updatedPost] = await db
      .update(posts)
      .set({
        affiliateReviewStatus: status,
        affiliateReviewDetails: serializeAffiliateReviewDetails(audit),
        affiliateReviewUpdatedAt: new Date(),
      })
      .where(eq(posts.id, post.id))
      .returning({ id: posts.id });

    if (!updatedPost) {
      return { error: "返利检查结果保存失败" };
    }

    await revalidateAffiliateReviewTarget(post);
    return {
      data: {
        status,
        matchedCount: audit.details.matchedCount,
        unmatchedCount: audit.details.unmatchedCount,
        invalidCount: audit.details.invalidCount,
      },
    };
  } catch (error) {
    console.error("重新检查文章返利链接失败:", error);
    return {
      error: "返利链接检查失败",
      message: getErrorMessage(error),
    };
  }
}

export async function approvePostAffiliateReviewAction(postId: number) {
  try {
    const session = await requireAdminSession();
    const post = await getAffiliateReviewTarget(postId);

    if (!post) {
      return { error: "文章不存在或已被删除" };
    }

    const audit = await auditAffiliateLinksForPublish(post.content);
    const manualApproval: ManualAffiliateApproval = {
      approvedAt: new Date().toISOString(),
      approvedBy: session.user.username,
      reason: "operator_confirmed",
    };
    const [updatedPost] = await db
      .update(posts)
      .set({
        affiliateReviewStatus: "passed",
        affiliateReviewDetails: serializeAffiliateReviewDetails(
          audit,
          manualApproval,
        ),
        affiliateReviewUpdatedAt: new Date(),
      })
      .where(eq(posts.id, post.id))
      .returning({ id: posts.id });

    if (!updatedPost) {
      return { error: "人工确认结果保存失败" };
    }

    await revalidateAffiliateReviewTarget(post);
    return {
      data: {
        status: "passed" as const,
        matchedCount: audit.details.matchedCount,
        unmatchedCount: audit.details.unmatchedCount,
        invalidCount: audit.details.invalidCount,
        approvedBy: session.user.username,
      },
    };
  } catch (error) {
    console.error("人工确认文章返利链接失败:", error);
    return {
      error: "返利链接人工确认失败",
      message: getErrorMessage(error),
    };
  }
}

export async function bulkUpdatePostsPublishedAction(input: {
  ids: number[];
  published: boolean;
}) {
  try {
    await requireAdminSession();

    if (!Array.isArray(input.ids) || typeof input.published !== "boolean") {
      return { error: "批量发布参数无效" };
    }

    if (exceedsBulkPostIdLimit(input.ids)) {
      return {
        error: "批量发布参数无效",
        message: bulkPostIdLimitMessage("发布"),
      };
    }

    const validIds = normalizePostIds(input.ids);
    if (validIds.length === 0) {
      return { error: "请先选择要操作的文章" };
    }

    const postRows = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        categoryId: posts.categoryId,
        content: posts.content,
        published: posts.published,
        affiliateReviewStatus: posts.affiliateReviewStatus,
        affiliateReviewDetails: posts.affiliateReviewDetails,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(inArray(posts.id, validIds));
    const foundIds = new Set(postRows.map((post) => post.id));
    const changedPosts: Array<{
      id: number;
      slug: string;
      categoryId: number;
      translationSourcePostId: number | null;
    }> = [];
    const blockedHosts = new Set<string>();
    const blockedPosts: Array<{
      id: number;
      title: string;
      hosts: string[];
    }> = [];
    const errors: Array<{ id: number; title?: string; reason: string }> =
      validIds
        .filter((id) => !foundIds.has(id))
        .map((id) => ({ id, reason: "文章不存在或已被删除" }));
    let updated = 0;
    let unchanged = 0;
    let blocked = 0;

    for (const post of postRows) {
      if (input.published && !isPublicArticleSourceRenderable(post)) {
        errors.push({
          id: post.id,
          title: post.title,
          reason: "正文不足，发布需要至少 200 个字符的正文",
        });
        continue;
      }
      if (post.published === input.published) {
        unchanged += 1;
        continue;
      }

      try {
        let affiliateReviewDetails: string | null = null;

        if (input.published && post.content) {
          const audit = await auditAffiliateLinksForPublish(post.content);
          const manualApproval =
            post.affiliateReviewStatus === "passed"
              ? getManualAffiliateApproval(post.affiliateReviewDetails)
              : null;

          if (audit.manualRequired && !manualApproval) {
            const [blockedPost] = await db
              .update(posts)
              .set({
                published: false,
                affiliateReviewStatus: "manual_required",
                affiliateReviewDetails: serializeAffiliateReviewDetails(audit),
                affiliateReviewUpdatedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(posts.id, post.id),
                  eq(posts.content, post.content),
                  eq(posts.slug, post.slug),
                  eq(posts.published, post.published),
                ),
              )
              .returning({
                id: posts.id,
                slug: posts.slug,
                categoryId: posts.categoryId,
                translationSourcePostId: posts.translationSourcePostId,
              });

            if (blockedPost) {
              changedPosts.push(blockedPost);
            }

            blocked += 1;
            for (const host of audit.details.manualHosts) {
              blockedHosts.add(host);
            }
            blockedPosts.push({
              id: post.id,
              title: post.title,
              hosts: audit.details.manualHosts,
            });
            continue;
          }

          affiliateReviewDetails = serializeAffiliateReviewDetails(
            audit,
            audit.manualRequired ? manualApproval : null,
          );
        }

        const [updatedPost] = await db
          .update(posts)
          .set({
            published: input.published,
            affiliateReviewStatus: input.published ? "passed" : "pending",
            affiliateReviewDetails: input.published
              ? affiliateReviewDetails
              : null,
            affiliateReviewUpdatedAt: input.published ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(posts.id, post.id),
              eq(posts.content, post.content),
              eq(posts.slug, post.slug),
              eq(posts.published, post.published),
            ),
          )
          .returning({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
            translationSourcePostId: posts.translationSourcePostId,
          });

        if (!updatedPost) {
          errors.push({
            id: post.id,
            title: post.title,
            reason: "文章不存在或已被其他操作更新，请刷新后重试",
          });
          continue;
        }

        changedPosts.push(updatedPost);
        updated += 1;
      } catch (error) {
        errors.push({
          id: post.id,
          title: post.title,
          reason: getErrorMessage(error),
        });
      }
    }

    await revalidateChangedPosts(changedPosts);

    return {
      data: {
        requested: validIds.length,
        updated,
        unchanged,
        blocked,
        failed: errors.length,
        blockedHosts: [...blockedHosts],
        blockedPosts,
        errors,
      },
    };
  } catch (error) {
    console.error("批量更新文章发布状态失败:", error);
    return {
      error: "批量更新文章发布状态失败",
      message: getErrorMessage(error),
    };
  }
}

export async function savePostEdits(input: unknown) {
  try {
    await requireAdminSession();
    const payload = postEditSchema.parse(input);
    const preparedContent = await prepareEditedArticleContent(payload.content);
    if (
      payload.published &&
      !isPublicArticleSourceRenderable({
        title: payload.title,
        slug: payload.slug,
        content: preparedContent.content,
      })
    ) {
      throw new PostEditValidationError(
        "正文不足，发布需要至少 200 个字符的正文",
      );
    }
    const publishAudit = payload.published
      ? await auditAffiliateLinksForPublish(preparedContent.content)
      : null;

    const { post, previous } = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(posts)
        .where(eq(posts.id, payload.id))
        .limit(1)
        .for("update");
      if (!current) throw new PostEditValidationError("文章不存在或已被删除");
      if (
        payload.expectedUpdatedAt !== undefined &&
        payload.expectedUpdatedAt !== (current.updatedAt?.toISOString() ?? null)
      ) {
        throw new PostEditValidationError(
          "文章已被其他操作更新，请刷新页面并确认最新内容后再保存",
          409,
        );
      }
      if (
        (current.published || current.slugLocked) &&
        current.slug !== payload.slug &&
        !payload.allowSlugChange
      ) {
        throw new PostEditValidationError(
          "已发布文章的 slug 已锁定，请先启用修改地址",
        );
      }
      const [duplicate] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.slug, payload.slug), ne(posts.id, payload.id)))
        .limit(1);
      if (duplicate)
        throw new PostEditValidationError("文章 slug 已被其他文章使用");
      const [category] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, payload.categoryId))
        .limit(1);
      if (!category)
        throw new PostEditValidationError("文章分类不存在，请重新选择分类");

      // A previous manual approval applies only to exactly the approved body.
      const manualApproval =
        current.content === preparedContent.content &&
        current.affiliateReviewStatus === "passed"
          ? getManualAffiliateApproval(current.affiliateReviewDetails)
          : null;
      if (publishAudit?.manualRequired && !manualApproval) {
        throw new PostEditValidationError(affiliateAuditMessage(publishAudit));
      }

      await replacePostTagsInTransaction(tx, payload.id, payload.newTags);
      let recommendedTag: { id: number; name: string } | null = null;
      if (payload.recommendTagName) {
        const [tag] = await tx
          .select({ id: tags.id, name: tags.name, enName: tags.enName })
          .from(tags)
          .where(
            current.language === "en"
              ? or(
                  eq(tags.enName, payload.recommendTagName),
                  eq(tags.name, payload.recommendTagName),
                )
              : eq(tags.name, payload.recommendTagName),
          )
          .limit(1);
        if (!tag)
          throw new PostEditValidationError("推荐标签不存在，请先创建该标签");
        const englishName = tag.enName?.trim();
        const name =
          current.language === "en" && englishName ? englishName : tag.name;
        if (current.language === "en" && /\p{Script=Han}/u.test(name)) {
          throw new PostEditValidationError(
            "推荐标签缺少英文名称，请先配置英文标签",
          );
        }
        recommendedTag = { id: tag.id, name };
      }
      if (payload.allowSlugChange) {
        await tx.execute(
          sql`select set_config('fwqgo.allow_slug_change', 'on', true)`,
        );
      }
      const [updated] = await tx
        .update(posts)
        .set({
          title: payload.title,
          slug: payload.slug,
          description: payload.description,
          content: preparedContent.content,
          published: payload.published,
          imgUrl: payload.imgUrl?.length ? payload.imgUrl : null,
          categoryId: payload.categoryId,
          recommendedTagName: recommendedTag?.name ?? null,
          recommendedTagId: recommendedTag?.id ?? null,
          keywords: normalizeSeoKeywords(payload.keywords),
          affiliateReviewStatus: payload.published ? "passed" : "pending",
          affiliateReviewDetails: publishAudit
            ? serializeAffiliateReviewDetails(publishAudit, manualApproval)
            : null,
          affiliateReviewUpdatedAt: payload.published ? new Date() : null,
          updatedAt: new Date(
            Math.max(Date.now(), (current.updatedAt?.getTime() ?? 0) + 1),
          ),
        })
        .where(eq(posts.id, payload.id))
        .returning();
      if (!updated) throw new PostEditValidationError("文章不存在或已被删除");
      return { post: updated, previous: current };
    });

    // No published content or cache changes until the complete edit commits.
    const warnings = [...preparedContent.warnings];
    try {
      await markPostInternalLinksStale(post.id);
    } catch (error) {
      console.error("文章已保存，但内链索引更新失败:", error);
      warnings.push("文章内链索引更新延迟");
    }
    warnings.push(
      ...(await runPostSaveMaintenance({
        postId: post.id,
        routeHandler: true,
        revalidationTags: [
          cacheTags.post(post.id),
          cacheTags.postSlug(post.slug),
          cacheTags.postSlug(previous.slug),
          cacheTags.category(post.categoryId),
          cacheTags.category(previous.categoryId),
          cacheTags.tags,
          ...(post.translationSourcePostId
            ? [cacheTags.post(post.translationSourcePostId)]
            : []),
        ],
      })),
    );
    return {
      success: true as const,
      data: {
        saved: true,
        slug: post.slug,
        published: post.published,
        updatedAt: post.updatedAt?.toISOString() ?? null,
        warnings,
      },
    };
  } catch (error) {
    if (isUnauthorizedError(error))
      return {
        error: "文章保存失败",
        message: "未登录或登录已过期",
        status: 401,
      };
    if (error instanceof ZodError)
      return {
        error: "文章信息校验失败",
        message: error.issues[0]?.message ?? "文章信息不正确",
        status: 400,
      };
    if (error instanceof PostEditValidationError)
      return {
        error: "文章保存失败",
        message: error.message,
        status: error.status,
      };
    console.error("文章原子保存失败:", error);
    return {
      error: "文章保存失败",
      message: "文章未保存，请稍后重试；如果持续失败，请查看服务器日志",
      status: 500,
    };
  }
}

export async function updatePostEnglishContent(input: {
  id: number;
  enTitle: string;
  enSlug: string;
  enDescription: string;
  enContent: string;
  enKeywords: string;
  enImgUrl?: string | null;
}) {
  try {
    await requireAdminSession();

    const parsedSourcePostId = parseIntegerId(input.id);
    if (parsedSourcePostId === null) return { error: "文章 ID 不正确" };

    const normalizedTitle = input.enTitle.trim();
    const normalizedContent = input.enContent.trim();
    const normalizedSlug = slugify(input.enSlug.trim() || normalizedTitle);
    const normalizedDescription = input.enDescription.trim();
    const normalizedKeywords = normalizeSeoKeywords(input.enKeywords);

    if (!normalizedTitle || !normalizedSlug || !normalizedContent) {
      return { error: "英文标题、slug 和正文不能为空" };
    }

    if (normalizedDescription.length > 800) {
      return { error: "英文摘要不能超过 800 个字符" };
    }

    const [sourcePost] = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        categoryId: posts.categoryId,
        language: posts.language,
        authorId: posts.authorId,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(eq(posts.id, parsedSourcePostId))
      .limit(1);

    if (!sourcePost) {
      return { error: "文章不存在" };
    }

    const [existingEnglishPost] = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        categoryId: posts.categoryId,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(
        sourcePost.language === "en"
          ? eq(posts.id, sourcePost.id)
          : and(
              eq(posts.translationSourcePostId, sourcePost.id),
              eq(posts.language, "en"),
            ),
      )
      .orderBy(desc(posts.updatedAt), desc(posts.createdAt))
      .limit(1);

    const targetSourcePostId =
      sourcePost.language === "en"
        ? sourcePost.translationSourcePostId
        : sourcePost.id;
    const [duplicatedPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.slug, normalizedSlug),
          ne(posts.id, existingEnglishPost?.id ?? -1),
        ),
      )
      .limit(1);

    if (duplicatedPost) {
      return { error: "英文 slug 已被其他文章使用" };
    }

    const preparedContent =
      await prepareEditedArticleContent(normalizedContent);

    const now = new Date();
    const values = {
      title: normalizedTitle,
      slug: normalizedSlug,
      description:
        normalizedDescription.length > 0 ? normalizedDescription : null,
      content: preparedContent.content,
      keywords: normalizedKeywords.length > 0 ? normalizedKeywords : null,
      imgUrl:
        input.enImgUrl && input.enImgUrl.trim().length > 0
          ? input.enImgUrl.trim()
          : null,
      language: "en" as const,
      translationSourcePostId: targetSourcePostId,
      categoryId: sourcePost.categoryId,
      authorId: sourcePost.authorId,
      updatedAt: now,
    };
    const [post] = existingEnglishPost
      ? await db
          .update(posts)
          .set(values)
          .where(eq(posts.id, existingEnglishPost.id))
          .returning({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
            translationSourcePostId: posts.translationSourcePostId,
          })
      : await db
          .insert(posts)
          .values({
            ...values,
            published: false,
            affiliateReviewStatus: "pending",
          })
          .returning({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
            translationSourcePostId: posts.translationSourcePostId,
          });

    if (!post) {
      return { error: "文章不存在或已被删除" };
    }

    await markPostInternalLinksStale(post.id);

    const maintenanceWarnings = await runPostSaveMaintenance({
      postId: post.id,
      revalidationTags: [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
      ],
    });

    return {
      data: post,
      warnings: [...preparedContent.warnings, ...maintenanceWarnings],
    };
  } catch (error) {
    console.error("更新英文文章失败:", error);
    return { error: "更新英文文章失败", message: getErrorMessage(error) };
  }
}

export async function deletePostById(id: number) {
  try {
    await requireAdminSession();
    const postId = parseIntegerId(id);
    if (postId === null) return { error: "文章 ID 不正确" };

    const [deletedPost] = await db
      .delete(posts)
      .where(eq(posts.id, postId))
      .returning({
        id: posts.id,
        slug: posts.slug,
        categoryId: posts.categoryId,
        translationSourcePostId: posts.translationSourcePostId,
      });

    if (!deletedPost) {
      return { error: "文章不存在或已被删除" };
    }

    const metadataWarnings: string[] = [];
    let translationSourcePost: PostCacheIdentity | undefined;
    if (deletedPost.translationSourcePostId) {
      try {
        [translationSourcePost] = await db
          .select({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          })
          .from(posts)
          .where(eq(posts.id, deletedPost.translationSourcePostId))
          .limit(1);
      } catch (error) {
        console.error("文章已删除，但关联原文信息读取失败:", error);
        metadataWarnings.push("文章已删除，但关联原文缓存可能延迟刷新");
      }
    }

    const maintenanceWarnings = await runPostDeletionMaintenance({
      deletedPosts: [deletedPost],
      translationSourcePosts: translationSourcePost
        ? [translationSourcePost]
        : [],
      cleanup: () => syncImageReferencesForPost(deletedPost.id),
    });

    return {
      data: "删除文章成功",
      warnings: [...metadataWarnings, ...maintenanceWarnings],
    };
  } catch (error) {
    return { error: "删除文章失败", message: getErrorMessage(error) };
  }
}

export async function deletePostsByIds(ids: number[]) {
  try {
    await requireAdminSession();

    if (Array.isArray(ids) && exceedsBulkPostIdLimit(ids)) {
      return {
        error: "批量删除文章失败",
        message: bulkPostIdLimitMessage("删除"),
      };
    }

    const validIds = normalizePostIds(ids);

    if (validIds.length === 0) {
      return { data: 0 };
    }

    const deletedPosts = await db
      .delete(posts)
      .where(inArray(posts.id, validIds))
      .returning({
        id: posts.id,
        slug: posts.slug,
        categoryId: posts.categoryId,
        translationSourcePostId: posts.translationSourcePostId,
      });

    const translationSourceIds = [
      ...new Set(
        deletedPosts
          .map((post) => post.translationSourcePostId)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    const metadataWarnings: string[] = [];
    let translationSourcePosts: PostCacheIdentity[] = [];
    if (translationSourceIds.length > 0) {
      try {
        translationSourcePosts = await db
          .select({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          })
          .from(posts)
          .where(inArray(posts.id, translationSourceIds));
      } catch (error) {
        console.error("文章已批量删除，但关联原文信息读取失败:", error);
        metadataWarnings.push("部分关联原文缓存可能延迟刷新");
      }
    }

    const maintenanceWarnings =
      deletedPosts.length > 0
        ? await runPostDeletionMaintenance({
            deletedPosts,
            translationSourcePosts,
            cleanup: () =>
              deleteImageReferencesForPosts(
                deletedPosts.map((post) => post.id),
              ),
          })
        : [];

    return {
      data: deletedPosts.length,
      warnings: [...metadataWarnings, ...maintenanceWarnings],
    };
  } catch (error) {
    return {
      error: "批量删除文章失败",
      message: getErrorMessage(error),
    };
  }
}

async function replacePostTagsInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  parsedPostId: number,
  newTags: NewTag[],
) {
  const uniqueNewTags = Array.from(
    new Map(
      newTags
        .map((tag) => {
          const name = normalizeTagName(tag.tag.name);
          const slug = (tag.tag.slug || slugify(name)).trim().toLowerCase();

          if (!name || !slug) {
            return null;
          }

          return [
            slug.toLowerCase(),
            {
              tag: {
                ...tag.tag,
                name,
                slug,
              },
            },
          ] as const;
        })
        .filter((tag): tag is NonNullable<typeof tag> => tag !== null),
    ).values(),
  );
  if (uniqueNewTags.length === 0)
    throw new PostEditValidationError("请至少保留一个有效标签");
  const [targetPost] = await tx
    .select({ id: posts.id, language: posts.language })
    .from(posts)
    .where(eq(posts.id, parsedPostId))
    .limit(1);

  if (!targetPost) {
    throw new PostEditValidationError("文章不存在或已被删除");
  }

  const isEnglishPost = targetPost.language === "en";
  const tagIds: number[] = [];

  for (const tag of uniqueNewTags) {
    const { id, name, slug } = tag.tag;
    const parsedTagId = id === undefined ? null : parseIntegerId(id);
    if (id !== undefined && parsedTagId === null) {
      throw new PostEditValidationError(`标签 ID 无效：${name}`);
    }
    if (
      isEnglishPost &&
      (/\p{Script=Han}/u.test(name) || !/^[a-z0-9-]+$/.test(slug))
    ) {
      throw new PostEditValidationError(`英文文章不能使用中文标签：${name}`);
    }

    const [existingById] = parsedTagId
      ? await tx
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.id, parsedTagId))
          .limit(1)
      : [];
    if (existingById) {
      tagIds.push(existingById.id);
      continue;
    }

    const tagLookupCondition = isEnglishPost
      ? or(
          eq(tags.enSlug, slug),
          eq(tags.slug, slug),
          eq(tags.enName, name),
          eq(tags.name, name),
        )
      : or(eq(tags.slug, slug), eq(tags.name, name));
    const [existingTag] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(tagLookupCondition)
      .limit(1);

    if (existingTag) {
      tagIds.push(existingTag.id);
      continue;
    }

    const [newTagResult] = await tx
      .insert(tags)
      .values(
        isEnglishPost
          ? { name, slug, enName: name, enSlug: slug, indexable: false }
          : { name, slug, indexable: false },
      )
      .onConflictDoNothing()
      .returning({ id: tags.id });

    if (newTagResult) {
      tagIds.push(newTagResult.id);
      continue;
    }

    const [createdByConcurrentRequest] = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(tagLookupCondition)
      .limit(1);

    if (!createdByConcurrentRequest) {
      throw new PostEditValidationError(`标签创建失败：${name}`);
    }

    tagIds.push(createdByConcurrentRequest.id);
  }

  const uniqueTagIds = Array.from(new Set(tagIds));

  await tx.delete(postTags).where(eq(postTags.postId, parsedPostId));

  if (uniqueTagIds.length > 0) {
    await tx
      .insert(postTags)
      .values(
        uniqueTagIds.map((tagId) => ({
          postId: parsedPostId,
          tagId,
        })),
      )
      .onConflictDoNothing();
  }
}
