"use server";

import { db } from "@/server/db";

interface CreatePostInput {
  title: string;
  description: string;
  content: string;
  img?: string;
  published: boolean;
  categoryId: number;
}

export async function createPost(input: CreatePostInput) {
  try {
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

    const result = await getPostBySlug(slug);
    if (result.data) {
      return { error: "文章已存在" };
    }

    const post = await db.post.create({
      data: {
        ...input,
        slug,
      },
    });

    return { data: post };
  } catch (error) {
    return { error: "创建文章失败", message: error };
  }
}

export async function getPosts() {
  try {
    const posts = await db.post.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { data: posts };
  } catch (error) {
    return { error: "获取文章列表失败", message: error };
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
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return { data: posts };
  } catch (error) {
    return { error: "通过分类id获取文章列表失败", message: error };
  }
}

export async function getPostBySlug(slug: string) {
  try {
    const post = await db.post.findUnique({ where: { slug } });
    return { data: post };
  } catch (error) {
    return { error: "通过slug获取文章失败", message: error };
  }
}

export async function getPostsWithTagsByCategoryId(id: number) {
  try {
    const posts = await db.post.findMany({
      where: { categoryId: id },
      select: {
        id: true,
        title: true,
        description: true,
        img: true,
        createdAt: true,
        slug: true,
        tags: {
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
      orderBy: {
        createdAt: "desc",
      },
    });
    return { data: posts };
  } catch (error) {
    return { error: "通过分类id获取文章列表失败", message: error };
  }
}
