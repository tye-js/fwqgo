"use server";

import { slugify } from "@/lib/utils";
import { db } from "@/server/db";
import { z } from "zod";

// 定义输入验证 schema
const createTagSchema = z.object({
  name: z
    .string()
    .min(2, "标签名称至少需要2个字符")
    .max(40, "标签名称不能超过40个字符")
    .trim(),
});

// 创建新文章时添加的标签，如果标签已经存在，则返回已存在的标签，否则创建新标签
export async function createTag(input: z.infer<typeof createTagSchema>) {
  // 验证输入
  const result = createTagSchema.parse(input);

  const existingTag = await db.tag.findUnique({
    select: { id: true },
    where: { name: input.name },
  });
  if (existingTag) return { id: existingTag.id };

  // 生成 slug
  const slug = slugify(input.name);

  const tag = await db.tag.create({
    data: { name: result.name, slug },
    select: { id: true },
  });

  return { id: tag.id };
}

// 创建多个标签
export async function createTags(tags: z.infer<typeof createTagSchema>[]) {
  const resultTags = await Promise.all(
    tags.map(async (tag) => {
      const resultTag = await createTag(tag);
      return { id: resultTag.id };
    }),
  );
  return { data: resultTags };
}

// 查询标签信息
export async function getTagBySlug(tagSlug: string) {
  try {
    const tag = await db.tag.findUnique({
      where: { slug: tagSlug },
      select: { id: true, name: true, description: true, keywords: true },
    });
    return { data: tag };
  } catch (error) {
    return { error: error, message: "通过标签 slug 查询标签信息失败" };
  }
}

// 通过标签 slug 获取多个文章的信息，并且包括每个文章的标签信息
export async function getPostsWithTagsByTagSlug(tagSlug: string) {
  try {
    console.log(tagSlug);
    const postsWithTags = await db.tag.findUnique({
      where: { slug: tagSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        keywords: true,
        posts: {
          select: {
            post: {
              select: {
                id: true,
                title: true,
                description: true,
                slug: true,
                imgUrl: true,
                createdAt: true,
                tags: {
                  take: 5,
                  select: {
                    tag: {
                      select: {
                        id: true,
                        name: true,
                        slug: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    return { data: postsWithTags };
  } catch (error) {
    return { error: error, message: "通过标签获取文章信息失败" };
  }
}
