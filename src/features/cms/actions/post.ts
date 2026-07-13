"use server";

import * as cheerio from "cheerio";
import { revalidatePath } from "next/cache";

import { db } from "@fwqgo/db";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { slugify } from "@fwqgo/core/utils";
import { type CreatePostParams } from "@/types/post.types";
import { type NewTag, type TagMain } from "@/types";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { rewriteAffiliateLinks } from "@fwqgo/scrape/affiliate-link-rewriter";
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
import { eq, and, inArray, ne, or } from "drizzle-orm";

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
}

function normalizePostIds(ids: number[], limit = 100) {
  return [
    ...new Set(
      ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, limit),
    ),
  ];
}

async function revalidateChangedPosts(
  changedPosts: Array<{
    id: number;
    slug: string;
    categoryId: number;
    translationSourcePostId?: number | null;
  }>,
) {
  if (changedPosts.length === 0) {
    revalidatePostWorkbenches();
    return;
  }

  const translationSourceIds = [
    ...new Set(
      changedPosts
        .map((post) => post.translationSourcePostId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  const translationSourcePosts =
    translationSourceIds.length > 0
      ? await db
          .select({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          })
          .from(posts)
          .where(inArray(posts.id, translationSourceIds))
      : [];

  revalidatePostWorkbenches();
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
  const manualLinks = [...report.unmatchedLinks, ...report.invalidLinks];
  const manualHosts = [
    ...new Set(
      manualLinks
        .map((item) => item.host)
        .filter((host): host is string => Boolean(host)),
    ),
  ];

  return {
    report,
    manualRequired: manualLinks.length > 0,
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

interface UpdatePostTagsParams {
  postId: number;
  oldTags: TagMain[];
  newTags: NewTag[];
}

export async function createPost(input: CreatePostInput | CreatePostParams) {
  try {
    await requireAdminSession();
    const postInput = "post" in input ? input.post : input;

    if (postInput.published) {
      const audit = await auditAffiliateLinksForPublish(postInput.content);
      if (audit.manualRequired) {
        return {
          error: "发布前返利链接检查未通过",
          message: `发现 ${audit.details.unmatchedCount} 条未命中外链、${audit.details.invalidCount} 条无效链接。请先补充返利规则或保存为草稿：${audit.details.manualHosts.slice(0, 6).join(", ") || "未知域名"}`,
        };
      }
    }

    const result = await createPostRecord(input);
    if (result.data) {
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
        content: posts.content,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(eq(posts.id, input.id))
      .limit(1);

    if (!currentPost) {
      return { error: "文章不存在" };
    }

    if (input.published && currentPost?.content) {
      const audit = await auditAffiliateLinksForPublish(currentPost.content);

      if (audit.manualRequired) {
        const [blockedPost] = await db
          .update(posts)
          .set({
            title: input.title,
            slug: input.slug,
            imgUrl: input.imgUrl,
            published: false,
            affiliateReviewStatus: "manual_required",
            affiliateReviewDetails: JSON.stringify(audit.details),
            affiliateReviewUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(posts.id, input.id))
          .returning({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          });

        if (blockedPost) {
          await syncImageReferencesForPost(blockedPost.id);
          revalidateImageAssetList();
          revalidatePostWorkbenches();
          revalidateSiteContent([
            cacheTags.post(blockedPost.id),
            cacheTags.postSlug(blockedPost.slug),
            cacheTags.category(blockedPost.categoryId),
            ...(currentPost.slug && currentPost.slug !== blockedPost.slug
              ? [cacheTags.postSlug(currentPost.slug)]
              : []),
          ]);
        }

        return {
          error: "发布前返利链接检查未通过",
          message: `发现 ${audit.details.unmatchedCount} 条未命中外链、${audit.details.invalidCount} 条无效链接。请先补充返利规则或人工确认：${audit.details.manualHosts.slice(0, 6).join(", ") || "未知域名"}`,
        };
      }
    }

    const [post] = await db
      .update(posts)
      .set({
        ...input,
        affiliateReviewStatus: input.published ? "passed" : "pending",
        affiliateReviewDetails: null,
        affiliateReviewUpdatedAt: input.published ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, input.id))
      .returning();

    if (!post) {
      return { error: "文章不存在或已被删除" };
    }

    if (post) {
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

      await syncImageReferencesForPost(post.id);
      revalidateImageAssetList();
      revalidatePostWorkbenches();
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        ...(currentPost?.slug && currentPost.slug !== post.slug
          ? [cacheTags.postSlug(currentPost.slug)]
          : []),
        ...(currentPost?.categoryId
          ? [cacheTags.category(currentPost.categoryId)]
          : []),
        ...(translationSourcePost
          ? [
              cacheTags.post(translationSourcePost.id),
              cacheTags.postSlug(translationSourcePost.slug),
              cacheTags.category(translationSourcePost.categoryId),
            ]
          : []),
      ]);
    }

    return { data: post };
  } catch (error) {
    return { error: "更新文章失败", message: error };
  }
}

export async function bulkUpdatePostsPublishedAction(input: {
  ids: number[];
  published: boolean;
}) {
  try {
    await requireAdminSession();

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
      if (post.published === input.published) {
        unchanged += 1;
        continue;
      }

      try {
        if (input.published && post.content) {
          const audit = await auditAffiliateLinksForPublish(post.content);

          if (audit.manualRequired) {
            const [blockedPost] = await db
              .update(posts)
              .set({
                published: false,
                affiliateReviewStatus: "manual_required",
                affiliateReviewDetails: JSON.stringify(audit.details),
                affiliateReviewUpdatedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(posts.id, post.id))
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
        }

        const [updatedPost] = await db
          .update(posts)
          .set({
            published: input.published,
            affiliateReviewStatus: input.published ? "passed" : "pending",
            affiliateReviewDetails: null,
            affiliateReviewUpdatedAt: input.published ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, post.id))
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
            reason: "文章不存在或已被删除",
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
    return { error: "批量更新文章发布状态失败", message: getErrorMessage(error) };
  }
}

export async function updatePostContent(input: {
  id: number;
  description: string;
  content: string;
  imgUrl?: string | null;
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

    if (!currentPost) {
      return { error: "文章不存在" };
    }

    const normalizedDescription = input.description.trim();
    const normalizedContent = input.content.trim();
    const normalizedRecommendTagName = input.recommendTagName.trim();

    if (!normalizedDescription || !normalizedContent) {
      return { error: "文章简述和正文不能为空" };
    }

    if (!Number.isInteger(input.categoryId) || input.categoryId <= 0) {
      return { error: "文章分类不正确" };
    }

    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);

    if (!category) {
      return { error: "文章分类不存在，请重新选择分类" };
    }

    let recommendedTag: { id: number; name: string } | null = null;
    if (normalizedRecommendTagName) {
      const [existingTag] = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.name, normalizedRecommendTagName))
        .limit(1);

      if (!existingTag) {
        return { error: "推荐标签不存在，请先创建该标签" };
      }

      recommendedTag = existingTag;
    }

    const normalizedImgUrl = input.imgUrl?.trim() ?? "";

    const [post] = await db
      .update(posts)
      .set({
        description: normalizedDescription,
        content: await prepareArticleContentForStorage(normalizedContent),
        imgUrl: normalizedImgUrl.length > 0 ? normalizedImgUrl : null,
        categoryId: input.categoryId,
        recommendedTagName: recommendedTag?.name ?? null,
        recommendedTagId: recommendedTag?.id ?? null,
        keywords: normalizeSeoKeywords(input.keywords),
        affiliateReviewStatus: "pending",
        affiliateReviewDetails: null,
        affiliateReviewUpdatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, input.id))
      .returning();

    if (!post) {
      return { error: "文章不存在或已被删除" };
    }

    if (post) {
      await syncImageReferencesForPost(post.id);
      revalidateImageAssetList();
      revalidatePostWorkbenches();
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        ...(currentPost?.categoryId &&
        currentPost.categoryId !== post.categoryId
          ? [cacheTags.category(currentPost.categoryId)]
          : []),
      ]);
    }

    return { success: true };
  } catch (error) {
    return { error: "更新文章失败", message: error };
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

    const [currentPost] = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        enSlug: posts.enSlug,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(eq(posts.id, input.id))
      .limit(1);

    if (!currentPost) {
      return { error: "文章不存在" };
    }

    const [duplicatedPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.enSlug, normalizedSlug), ne(posts.id, input.id)))
      .limit(1);

    if (duplicatedPost) {
      return { error: "英文 slug 已被其他文章使用" };
    }

    const [post] = await db
      .update(posts)
      .set({
        enTitle: normalizedTitle,
        enSlug: normalizedSlug,
        enDescription:
          normalizedDescription.length > 0 ? normalizedDescription : null,
        enContent: await prepareArticleContentForStorage(normalizedContent),
        enKeywords: normalizedKeywords.length > 0 ? normalizedKeywords : null,
        enImgUrl:
          input.enImgUrl && input.enImgUrl.trim().length > 0
            ? input.enImgUrl.trim()
            : null,
        enUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, input.id))
      .returning({
        id: posts.id,
        slug: posts.slug,
        enSlug: posts.enSlug,
        categoryId: posts.categoryId,
        translationSourcePostId: posts.translationSourcePostId,
      });

    if (!post) {
      return { error: "文章不存在或已被删除" };
    }

    if (post) {
      await syncImageReferencesForPost(post.id);
      revalidateImageAssetList();
      revalidatePostWorkbenches();
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        ...(post.enSlug ? [cacheTags.postSlug(post.enSlug)] : []),
        ...(currentPost.enSlug && currentPost.enSlug !== post.enSlug
          ? [cacheTags.postSlug(currentPost.enSlug)]
          : []),
        cacheTags.category(post.categoryId),
      ]);
    }

    return { data: post };
  } catch (error) {
    console.error("更新英文文章失败:", error);
    return { error: "更新英文文章失败", message: getErrorMessage(error) };
  }
}

export async function deletePostById(id: number) {
  try {
    await requireAdminSession();

    const [deletedPost] = await db
      .delete(posts)
      .where(eq(posts.id, id))
      .returning({
        id: posts.id,
        slug: posts.slug,
        enSlug: posts.enSlug,
        categoryId: posts.categoryId,
        translationSourcePostId: posts.translationSourcePostId,
      });

    if (!deletedPost) {
      return { error: "文章不存在或已被删除" };
    }

    const [translationSourcePost] = deletedPost.translationSourcePostId
      ? await db
          .select({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          })
          .from(posts)
          .where(eq(posts.id, deletedPost.translationSourcePostId))
          .limit(1)
      : [];

    await syncImageReferencesForPost(deletedPost.id);
    revalidateImageAssetList();
    revalidatePostWorkbenches();
    revalidateSiteContent([
      cacheTags.post(deletedPost.id),
      cacheTags.postSlug(deletedPost.slug),
      ...(deletedPost.enSlug ? [cacheTags.postSlug(deletedPost.enSlug)] : []),
      cacheTags.category(deletedPost.categoryId),
      ...(translationSourcePost
        ? [
            cacheTags.post(translationSourcePost.id),
            cacheTags.postSlug(translationSourcePost.slug),
            cacheTags.category(translationSourcePost.categoryId),
          ]
        : []),
    ]);

    return { data: "删除文章成功" };
  } catch (error) {
    return { error: "删除文章失败", message: error };
  }
}

export async function deletePostsByIds(ids: number[]) {
  try {
    await requireAdminSession();

    const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);

    if (validIds.length === 0) {
      return { data: 0 };
    }

    const deletedPosts = await db
      .delete(posts)
      .where(inArray(posts.id, validIds))
      .returning({
        id: posts.id,
        slug: posts.slug,
        enSlug: posts.enSlug,
        categoryId: posts.categoryId,
        translationSourcePostId: posts.translationSourcePostId,
      });

    if (deletedPosts.length > 0) {
      await deleteImageReferencesForPosts(deletedPosts.map((post) => post.id));
      revalidateImageAssetList();
      revalidatePostWorkbenches();
    }

    const translationSourceIds = [
      ...new Set(
        deletedPosts
          .map((post) => post.translationSourcePostId)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    const translationSourcePosts =
      translationSourceIds.length > 0
        ? await db
            .select({
              id: posts.id,
              slug: posts.slug,
              categoryId: posts.categoryId,
            })
            .from(posts)
            .where(inArray(posts.id, translationSourceIds))
        : [];

    revalidateSiteContent([
      ...deletedPosts.flatMap((post) => [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        ...(post.enSlug ? [cacheTags.postSlug(post.enSlug)] : []),
        cacheTags.category(post.categoryId),
      ]),
      ...translationSourcePosts.flatMap((post) => [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
      ]),
    ]);

    return { data: deletedPosts.length };
  } catch (error) {
    return { error: "批量删除文章失败", message: error };
  }
}

export async function updatePostTags({
  postId,
  newTags,
}: UpdatePostTagsParams) {
  try {
    await requireAdminSession();
    const uniqueNewTags = Array.from(
      new Map(
        newTags
          .map((tag) => {
            const name = normalizeTagName(tag.tag.name);
            const slug = tag.tag.slug || slugify(name);

            if (!name || !slug) {
              return null;
            }

            return [
              slug,
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
    await db.transaction(async (tx) => {
      const [targetPost] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, postId))
        .limit(1);

      if (!targetPost) {
        throw new Error("文章不存在或已被删除");
      }

      const tagIds = Array.from(
        new Set(
          await Promise.all(
            uniqueNewTags.map(async (tag) => {
              const slug = tag.tag.slug;
              const [existingTag] = await tx
                .select({ id: tags.id })
                .from(tags)
                .where(or(eq(tags.slug, slug), eq(tags.name, tag.tag.name)))
                .limit(1);

              if (existingTag) return existingTag.id;

              const [newTagResult] = await tx
                .insert(tags)
                .values({ name: tag.tag.name, slug })
                .onConflictDoNothing()
                .returning({ id: tags.id });

              if (newTagResult) return newTagResult.id;

              const [createdByConcurrentRequest] = await tx
                .select({ id: tags.id })
                .from(tags)
                .where(or(eq(tags.slug, slug), eq(tags.name, tag.tag.name)))
                .limit(1);

              if (!createdByConcurrentRequest) {
                throw new Error(`标签创建失败：${tag.tag.name}`);
              }

              return createdByConcurrentRequest.id;
            }),
          ),
        ),
      );

      await tx.delete(postTags).where(eq(postTags.postId, postId));

      if (tagIds.length > 0) {
        await tx
          .insert(postTags)
          .values(
            tagIds.map((tagId) => ({
              postId,
              tagId,
            })),
          )
          .onConflictDoNothing();
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
    return { error: "更新文章标签失败", message: getErrorMessage(error) };
  }
}
