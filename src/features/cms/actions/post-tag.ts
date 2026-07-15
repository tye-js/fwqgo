"use server";

import { db } from "@fwqgo/db";
import { postTags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { getErrorMessage } from "@/lib/admin-action-result";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

interface CreatePostTagsInput {
  postId: number;
  tags: { id: number }[];
}

export async function createPostTags({ postId, tags }: CreatePostTagsInput) {
  try {
    await requireAdminSession();

    if (!Number.isSafeInteger(postId) || postId <= 0) {
      return { error: "创建文章标签关联失败", message: "文章 ID 不正确" };
    }

    const tagIds = [
      ...new Set(
        tags
          .map((tag) => tag.id)
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ];

    if (tagIds.length === 0) {
      return { data: [] };
    }

    const result = await db
      .insert(postTags)
      .values(tagIds.map((tagId) => ({ postId, tagId })))
      .onConflictDoNothing()
      .returning({ postId: postTags.postId, tagId: postTags.tagId });

    revalidateSiteContent([cacheTags.post(postId), cacheTags.tags]);
    await notifyPublicWebCache("taxonomy.changed", { tagIds });

    return { data: result };
  } catch (error) {
    return {
      error: "创建文章标签关联失败",
      message: getErrorMessage(error),
    };
  }
}
