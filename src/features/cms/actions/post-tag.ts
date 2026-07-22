"use server";

import { db } from "@fwqgo/db";
import { postTags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { parsePostgresIntegerId } from "@fwqgo/core/utils";
import { getErrorMessage } from "@/lib/admin-action-result";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";

interface CreatePostTagsInput {
  postId: number;
  tags: { id: number }[];
}

export async function createPostTags({ postId, tags }: CreatePostTagsInput) {
  try {
    await requireAdminSession();
    const parsedPostId = parsePostgresIntegerId(postId);

    if (parsedPostId === null) {
      return { error: "创建文章标签关联失败", message: "文章 ID 不正确" };
    }

    const tagIds = [
      ...new Set(
        tags
          .map((tag) => tag.id)
          .map(parsePostgresIntegerId)
          .filter((id): id is number => id !== null),
      ),
    ];

    if (tagIds.length === 0) {
      return { data: [] };
    }

    const result = await db
      .insert(postTags)
      .values(tagIds.map((tagId) => ({ postId: parsedPostId, tagId })))
      .onConflictDoNothing()
      .returning({ postId: postTags.postId, tagId: postTags.tagId });

    revalidateSiteContent([cacheTags.post(parsedPostId), cacheTags.tags]);
    schedulePublicWebCache("taxonomy.changed", { tagIds });

    return { data: result };
  } catch (error) {
    return {
      error: "创建文章标签关联失败",
      message: getErrorMessage(error),
    };
  }
}
