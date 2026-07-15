"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { homepagePromotedPosts, posts } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

type HomepageLanguage = "zh" | "en";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "未知错误";
}

function normalizeHomepageLanguage(language?: string): HomepageLanguage {
  return language === "en" ? "en" : "zh";
}

export async function getHomepagePromotedPostList(
  language: HomepageLanguage = "zh",
) {
  try {
    await requireAdminSession();
    const normalizedLanguage = normalizeHomepageLanguage(language);

    const result = await db.query.homepagePromotedPosts.findMany({
      where: eq(homepagePromotedPosts.language, normalizedLanguage),
      orderBy: [
        asc(homepagePromotedPosts.sortOrder),
        desc(homepagePromotedPosts.createdAt),
      ],
      with: {
        post: {
          columns: {
            id: true,
            title: true,
            slug: true,
            published: true,
            language: true,
          },
        },
      },
    });

    return { data: result };
  } catch (error) {
    return { error: "获取首页推荐文章失败", message: getErrorMessage(error) };
  }
}

export async function addHomepagePromotedPost(input: {
  postId: number;
  sortOrder: number;
  language?: HomepageLanguage;
}) {
  try {
    await requireAdminSession();
    const normalizedLanguage = normalizeHomepageLanguage(input.language);

    if (!Number.isInteger(input.postId) || input.postId <= 0) {
      return { error: "文章 ID 不正确" };
    }

    if (!Number.isInteger(input.sortOrder)) {
      return { error: "排序值不正确" };
    }

    const [post] = await db
      .select({
        id: posts.id,
        published: posts.published,
        language: posts.language,
      })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .limit(1);

    if (!post) {
      return { error: "文章不存在" };
    }

    if (!post.published) {
      return { error: "首页推荐只能添加已发布文章" };
    }

    if (post.language !== normalizedLanguage) {
      return { error: "文章语言和当前推荐位语言不一致" };
    }

    const [result] = await db
      .insert(homepagePromotedPosts)
      .values({
        postId: input.postId,
        language: normalizedLanguage,
        sortOrder: input.sortOrder,
      })
      .onConflictDoUpdate({
        target: homepagePromotedPosts.postId,
        set: {
          language: normalizedLanguage,
          sortOrder: input.sortOrder,
        },
      })
      .returning();

    revalidateSiteContent([cacheTags.homepage, cacheTags.post(input.postId)]);
    revalidatePath("/collect/homepage-promoted");
    await notifyPublicWebCache("homepage.changed");

    return { data: result };
  } catch (error) {
    return { error: "保存首页推荐文章失败", message: getErrorMessage(error) };
  }
}

export async function updateHomepagePromotedPost(input: {
  id: number;
  sortOrder: number;
  language?: HomepageLanguage;
}) {
  try {
    await requireAdminSession();
    const normalizedLanguage = normalizeHomepageLanguage(input.language);

    if (!Number.isInteger(input.id) || input.id <= 0) {
      return { error: "推荐位 ID 不正确" };
    }

    if (!Number.isInteger(input.sortOrder)) {
      return { error: "排序值不正确" };
    }

    const [result] = await db
      .update(homepagePromotedPosts)
      .set({
        sortOrder: input.sortOrder,
      })
      .where(
        and(
          eq(homepagePromotedPosts.id, input.id),
          eq(homepagePromotedPosts.language, normalizedLanguage),
        ),
      )
      .returning();

    if (!result) {
      return { error: "推荐位不存在或已被删除" };
    }

    revalidateSiteContent([cacheTags.homepage]);
    revalidatePath("/collect/homepage-promoted");
    await notifyPublicWebCache("homepage.changed");

    return { data: result };
  } catch (error) {
    return { error: "更新首页推荐文章失败", message: getErrorMessage(error) };
  }
}

export async function deleteHomepagePromotedPost(
  id: number,
  language: HomepageLanguage = "zh",
) {
  try {
    await requireAdminSession();
    const normalizedLanguage = normalizeHomepageLanguage(language);

    if (!Number.isInteger(id) || id <= 0) {
      return { error: "推荐位 ID 不正确" };
    }

    const [result] = await db
      .delete(homepagePromotedPosts)
      .where(
        and(
          eq(homepagePromotedPosts.id, id),
          eq(homepagePromotedPosts.language, normalizedLanguage),
        ),
      )
      .returning();

    if (!result) {
      return { error: "推荐位不存在或已被删除" };
    }

    revalidateSiteContent([cacheTags.homepage]);
    revalidatePath("/collect/homepage-promoted");
    await notifyPublicWebCache("homepage.changed");

    return { data: result };
  } catch (error) {
    return { error: "删除首页推荐文章失败", message: getErrorMessage(error) };
  }
}

export async function deleteHomepagePromotedPosts(
  ids: number[],
  language: HomepageLanguage = "zh",
) {
  try {
    await requireAdminSession();
    const normalizedLanguage = normalizeHomepageLanguage(language);

    const validIds = [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ];

    if (validIds.length === 0) {
      return { data: 0 };
    }

    const result = await db
      .delete(homepagePromotedPosts)
      .where(
        and(
          inArray(homepagePromotedPosts.id, validIds),
          eq(homepagePromotedPosts.language, normalizedLanguage),
        ),
      )
      .returning({ id: homepagePromotedPosts.id });

    revalidateSiteContent([cacheTags.homepage]);
    revalidatePath("/collect/homepage-promoted");
    await notifyPublicWebCache("homepage.changed");

    return { data: result.length };
  } catch (error) {
    return {
      error: "批量删除首页推荐文章失败",
      message: getErrorMessage(error),
    };
  }
}

export async function getPublishedPostOptions(
  language: HomepageLanguage = "zh",
) {
  try {
    await requireAdminSession();
    const normalizedLanguage = normalizeHomepageLanguage(language);

    const result = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        language: posts.language,
      })
      .from(posts)
      .where(
        and(eq(posts.published, true), eq(posts.language, normalizedLanguage)),
      )
      .orderBy(desc(posts.createdAt))
      .limit(100);

    return { data: result };
  } catch (error) {
    return { error: "获取文章选项失败", message: getErrorMessage(error) };
  }
}
