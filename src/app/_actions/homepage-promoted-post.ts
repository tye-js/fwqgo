"use server";

import { revalidatePath } from "next/cache";
import { asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { homepagePromotedPosts, posts } from "@/server/db/schema";

export async function getHomepagePromotedPostList() {
  try {
    const result = await db.query.homepagePromotedPosts.findMany({
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
          },
        },
      },
    });

    return { data: result };
  } catch (error) {
    return { error: "获取首页推荐文章失败", message: error };
  }
}

export async function addHomepagePromotedPost(input: {
  postId: number;
  sortOrder: number;
}) {
  try {
    const [post] = await db
      .select({
        id: posts.id,
      })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .limit(1);

    if (!post) {
      return { error: "文章不存在" };
    }

    const [result] = await db
      .insert(homepagePromotedPosts)
      .values({
        postId: input.postId,
        sortOrder: input.sortOrder,
      })
      .onConflictDoUpdate({
        target: homepagePromotedPosts.postId,
        set: {
          sortOrder: input.sortOrder,
        },
      })
      .returning();

    revalidatePath("/");
    revalidatePath("/end/collect/homepage-promoted");

    return { data: result };
  } catch (error) {
    return { error: "保存首页推荐文章失败", message: error };
  }
}

export async function updateHomepagePromotedPost(input: {
  id: number;
  sortOrder: number;
}) {
  try {
    const [result] = await db
      .update(homepagePromotedPosts)
      .set({
        sortOrder: input.sortOrder,
      })
      .where(eq(homepagePromotedPosts.id, input.id))
      .returning();

    revalidatePath("/");
    revalidatePath("/end/collect/homepage-promoted");

    return { data: result };
  } catch (error) {
    return { error: "更新首页推荐文章失败", message: error };
  }
}

export async function deleteHomepagePromotedPost(id: number) {
  try {
    const [result] = await db
      .delete(homepagePromotedPosts)
      .where(eq(homepagePromotedPosts.id, id))
      .returning();

    revalidatePath("/");
    revalidatePath("/end/collect/homepage-promoted");

    return { data: result };
  } catch (error) {
    return { error: "删除首页推荐文章失败", message: error };
  }
}

export async function deleteHomepagePromotedPosts(ids: number[]) {
  try {
    if (ids.length === 0) {
      return { data: 0 };
    }

    const result = await db
      .delete(homepagePromotedPosts)
      .where(inArray(homepagePromotedPosts.id, ids))
      .returning({ id: homepagePromotedPosts.id });

    revalidatePath("/");
    revalidatePath("/end/collect/homepage-promoted");

    return { data: result.length };
  } catch (error) {
    return { error: "批量删除首页推荐文章失败", message: error };
  }
}

export async function getPublishedPostOptions() {
  try {
    const result = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
      })
      .from(posts)
      .where(eq(posts.published, true))
      .orderBy(desc(posts.createdAt))
      .limit(100);

    return { data: result };
  } catch (error) {
    return { error: "获取文章选项失败", message: error };
  }
}
