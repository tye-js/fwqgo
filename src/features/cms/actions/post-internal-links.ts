"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import { posts } from "@fwqgo/db/schema";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  regeneratePostInternalLinks,
  updatePostInternalLink,
} from "@/server/posts/internal-links";

function parseId(value: number) {
  const parsed = postgresIntegerIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function revalidateInternalLinkSource(postId: number) {
  const [post] = await db
    .select({ slug: posts.slug, categoryId: posts.categoryId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) return;

  schedulePublicWebCache("post.changed", {
    postIds: [postId],
    postSlugs: [post.slug],
    categoryIds: [post.categoryId],
  });
  revalidatePath(`/posts/edit/post/${encodeURIComponent(post.slug)}`);
}

export async function regeneratePostInternalLinksAction(postId: number) {
  try {
    await requireAdminSession();
    const parsedPostId = parseId(postId);
    if (parsedPostId === null) return { error: "文章 ID 不正确" };

    const result = await regeneratePostInternalLinks({
      postId: parsedPostId,
      mode: "activate-high-confidence",
      generatedBy: "rule",
    });
    await revalidateInternalLinkSource(parsedPostId);
    return { data: result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "重新生成内链失败",
    };
  }
}

export async function updatePostInternalLinkAction(input: {
  id: number;
  status: "suggested" | "active" | "rejected" | "stale";
  anchorText?: string | null;
}) {
  try {
    await requireAdminSession();
    const id = parseId(input.id);
    if (id === null) return { error: "内链 ID 不正确" };

    const result = await updatePostInternalLink({
      id,
      status: input.status,
      anchorText: input.anchorText,
    });
    await revalidateInternalLinkSource(result.sourcePostId);
    return { data: result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "更新内链失败",
    };
  }
}
