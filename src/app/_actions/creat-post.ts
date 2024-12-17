"use server";

import { slugify } from "@/lib/utils";
import { db } from "@/server/db";
import { type CreatePostParams } from "@/types/post.types";
import { revalidatePath } from "next/cache";
import { addIdsToHeadings } from "@/lib/toc";
// 创建新文章时添加的标签，如果标签已经存在，则返回已存在的标签，否则创建新标签
export async function createPost(input: CreatePostParams) {
  try {
    await db.$transaction(async (tx) => {
      const { post, tags } = input;
      const resultTagIdArray = await Promise.all(
        tags.map(async (tag) => {
          const slug = slugify(tag.name);
          const existingTag = await tx.tag.findUnique({
            select: { id: true },
            where: { slug },
          });
          if (existingTag) return { id: existingTag.id };

          const tagId = await tx.tag.create({
            data: { name: tag.name, slug },
            select: { id: true },
          });

          return { id: tagId.id };
        }),
      );
      // 先验证分类是否存在
      const category = await db.category.findUnique({
        select: { id: true, slug: true },
        where: { id: post.categoryId },
      });

      if (!category) {
        return { error: "分类不存在" };
      }
      // 生成 slug
      const slug = slugify(post.title);
      // 对content进行处理，给每个标题添加id

      const existingPost = await tx.post.findUnique({
        where: { slug },
        select: {
          id: true,
        },
      });
      if (existingPost) {
        return { error: "文章已存在" };
      }
      // 对content进行处理，给每个标题添加id
      post.content = addIdsToHeadings(post.content);

      const postResult = await tx.post.create({
        data: {
          ...post,
          slug,
        },
      });

      // 向数据库中插入文章标签关联
      await tx.postTag.createMany({
        data: resultTagIdArray.map((tag) => ({
          postId: postResult.id,
          tagId: tag.id,
        })),
      });
      revalidatePath(`/`);
      revalidatePath(`/fwq/${category.slug}/page/1`);

      return { success: true };
    });
  } catch (error) {
    return { error: "创建文章失败", message: error };
  }
}
