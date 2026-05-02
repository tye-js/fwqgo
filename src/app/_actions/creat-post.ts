"use server";

import { slugify } from "@/lib/utils";
import { db } from "@/server/db";
import { type CreatePostParams } from "@/types/post.types";
import { revalidatePath } from "next/cache";
import { addIdsToHeadings } from "@/lib/toc";
import { posts, categories, tags, postTags } from "@/server/db/schema";
import { eq } from "drizzle-orm";

// 创建新文章时添加的标签，如果标签已经存在，则返回已存在的标签，否则创建新标签
export async function createPost(input: CreatePostParams) {
  try {
    return await db.transaction(async (tx) => {
      const { post, tags: inputTags } = input;

      const resultTagIdArray = await Promise.all(
        inputTags.map(async (tag) => {
          const slug = slugify(tag.name);
          const [existingTag] = await tx
            .select({ id: tags.id })
            .from(tags)
            .where(eq(tags.slug, slug))
            .limit(1);

          if (existingTag) return { id: existingTag.id };

          const [newTag] = await tx
            .insert(tags)
            .values({ name: tag.name, slug })
            .returning({ id: tags.id });

          return { id: newTag!.id };
        }),
      );

      // 先验证分类是否存在
      const [category] = await tx
        .select({ id: categories.id, slug: categories.slug })
        .from(categories)
        .where(eq(categories.id, post.categoryId))
        .limit(1);

      if (!category) {
        return { error: "分类不存在" };
      }

      // 生成 slug
      const slug = slugify(post.title);

      const [existingPost] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.slug, slug))
        .limit(1);

      if (existingPost) {
        return { error: "文章已存在" };
      }

      // 对content进行处理，给每个标题添加id
      post.content = addIdsToHeadings(post.content);

      const [postResult] = await tx
        .insert(posts)
        .values({
          ...post,
          slug,
        })
        .returning();

      // 向数据库中插入文章标签关联
      if (resultTagIdArray.length > 0) {
        await tx.insert(postTags).values(
          resultTagIdArray.map((tag) => ({
            postId: postResult!.id,
            tagId: tag.id,
          })),
        );
      }

      revalidatePath(`/`);
      revalidatePath(`/fwq/${category.slug}/page/1`);
      revalidatePath("/sitemap.xml");

      return { success: true };
    });
  } catch (error) {
    return { error: "创建文章失败", message: error };
  }
}
