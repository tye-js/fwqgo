"use server";

import { db } from "@/server/db";
import { slugify } from "@/lib/utils";
interface CreatePostInput {
  title: string;
  description: string;
  content: string;
  imgUrl?: string;
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
    const slug = slugify(input.title);

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
        imgUrl: true,
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

// 根据推荐标签名称获取相关文章
export async function getRecommendedPosts(
  tagName: string | null,
  currentPostId: number,
) {
  try {
    if (!tagName) return { data: [] };
    const posts = await db.post.findMany({
      where: {
        recommendedTagName: tagName,
        id: {
          not: currentPostId, // 排除当前文章
        },
        published: true, // 只获取已发布的文章
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        imgUrl: true,
        createdAt: true,
      },
      take: 5, // 限制返回5篇推荐文章
      orderBy: {
        createdAt: "desc",
      },
    });
    return { data: posts };
  } catch (error) {
    return { error: "获取推荐文章失败", message: error };
  }
}

export async function getPostWithTagsBySlug(slug: string) {
  try {
    const post = await db.post.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        description: true,
        keywords: true,
        imgUrl: true,
        content: true,
        createdAt: true,
        views: true,
        recommendedTagName: true,
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
    });
    // 如果文章存在且有推荐标签，获取推荐文章
    let recommendedPosts = null;
    if (post?.recommendedTagName) {
      const recommended = await getRecommendedPosts(
        post.recommendedTagName,
        post.id,
      );
      recommendedPosts = recommended.data;
    }
    return { data: { post, recommendedPosts } };
  } catch (error) {
    return { error: "通过slug获取文章失败", message: error };
  }
}

export async function getPostsWithTagsByCategoryId(id: number, pageNo: number) {
  try {
    const posts = await db.post.findMany({
      where: { categoryId: id },
      select: {
        id: true,
        title: true,
        description: true,
        imgUrl: true,
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
      skip: (pageNo - 1) * 10,
      take: 10,
      orderBy: {
        createdAt: "desc",
      },
    });
    return { data: posts };
  } catch (error) {
    return { error: "通过分类id获取文章列表失败", message: error };
  }
}
