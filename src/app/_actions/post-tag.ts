"use server";

import { db } from "@/server/db";

interface CreatePostTagsInput {
  postId: number;
  tags: { id: number }[];
}

export async function createPostTags({ postId, tags }: CreatePostTagsInput) {
  try {
    // 向数据库中插入文章标签关联
    const result = await db.postTag.createMany({
      data: tags.map((tag) => ({ postId, tagId: tag.id })),
    });
    return { data: result };
  } catch (error) {
    return { error: "创建文章标签关联失败", message: error };
  }
}
