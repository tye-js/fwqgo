"use server";

import { db } from "@/server/db";

interface CreatePostInput {
  title: string;
  content: string;
  img?: string;
  published: boolean;
  categoryId: number;
  tags: { name: string }[]; // 添加tags字段
}

export async function createPost(input: CreatePostInput) {
  try {
    console.log(input);
    // 先验证分类是否存在
    const category = await db.category.findUnique({
      where: { id: input.categoryId },
    });

    if (!category) {
      return { error: "分类不存在" };
    }

    // 生成 slug
    const slug = input.title
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, "") // 保留中文字符和英文字母数字
      .replace(/\s+/g, "-") // 空格替换为连字符
      .replace(/[\u4e00-\u9fff]/g, (char) => encodeURIComponent(char)); // 中文字符 URL 编码
    const post = await db.post.create({
      data: {
        ...input,
        slug,
        tags: {
          create: input.tags.map((tag) => ({
            name: tag.name,
            // 如果需要先检查标签是否存在
            // connectOrCreate: {
            //   where: { name: tag.name },
            //   create: { name: tag.name }
            // }
          })),
        },
      },
    });

    return { data: post };
  } catch (error) {
    console.error("创建文章失败:", error);
    return { error: "创建文章失败" };
  }
}

export async function getPosts() {
  try {
    const posts = await db.post.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { data: posts };
  } catch (error) {
    console.error("获取文章列表失败:", error);
    return { error: "获取文章列表失败" };
  }
}

export async function getPostByCategoryId(id: number) {
  try {
    const posts = await db.post.findMany({
      where: {
        categoryId: id,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        img: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return { data: posts };
  } catch (error) {
    console.error("获取文章列表失败:", error);
    return { error: "获取文章列表失败" };
  }
}

export async function getPostBySlug(slug: string) {
  try {
    const post = await db.post.findUnique({ where: { slug } });
    return { data: post };
  } catch (error) {
    console.error("获取文章失败:", error);
    return { error: "获取文章失败" };
  }
}
