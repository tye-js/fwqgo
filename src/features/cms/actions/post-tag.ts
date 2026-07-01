"use server";

import { db } from "@fwqgo/db";
import { postTags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";

interface CreatePostTagsInput {
  postId: number;
  tags: { id: number }[];
}

export async function createPostTags({ postId, tags }: CreatePostTagsInput) {
  try {
    await requireAdminSession();

    // 向数据库中插入文章标签关联
    const result = await db
      .insert(postTags)
      .values(tags.map((tag) => ({ postId, tagId: tag.id })));

    revalidateSiteContent([cacheTags.post(postId), cacheTags.tags]);

    return { data: result };
  } catch (error) {
    return { error: "创建文章标签关联失败", message: error };
  }
}
