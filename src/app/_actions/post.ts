"use server";

import { db } from "@/server/db";
import { decodeSlug, slugify } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { type NewTag, type TagMain } from "@/types";
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
    revalidatePath("/");
    return { data: post };
  } catch (error) {
    return { error: "创建文章失败", message: error };
  }
}

export async function updatePostByRecommendedTagName(
  postId: number,
  recommendedTagName: string,
) {
  try {
    const result = await db.post.update({
      where: { id: postId },
      data: { recommendedTagName },
    });
    return { data: result };
  } catch (error) {
    return { error: "更新文章推荐标签失败", message: error };
  }
}
// 获取所有文章列表
export async function getPosts({
  pageNo = 1,
  pageSize = 10,
}: {
  pageNo?: number;
  pageSize?: number;
}) {
  try {
    const posts = await db.post.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        imgUrl: true,
        published: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (pageNo - 1) * pageSize,
      take: pageSize,
    });
    return { data: posts };
  } catch (error) {
    return { error: "获取文章列表失败", message: error };
  }
}

// 更新文章标题/slug/图片链接/发布状态
export async function updatePost(input: {
  id: number;
  title: string;
  slug: string;
  imgUrl: string | null;
  published: boolean;
}) {
  try {
    const post = await db.post.update({ where: { id: input.id }, data: input });
    revalidatePath("/end/edit");
    return { data: post };
  } catch (error) {
    return { error: "更新文章失败", message: error };
  }
}

// 更新文章简述/内容/分类
export async function updatePostContent(input: {
  id: number;
  description: string;
  content: string;
  categoryId: number;
  recommendTagName: string;
}) {
  try {
    // 首先验证推荐标签是否存在
    await db.$transaction(async (tx) => {
      if (input.recommendTagName) {
        const existingTag = await tx.tag.findUnique({
          where: { name: input.recommendTagName },
        });

        if (!existingTag) {
          return { error: "推荐标签不存在，请先创建该标签" };
        }
      }
      await tx.post.update({
        where: { id: input.id },
        data: {
          description: input.description,
          content: input.content,
          categoryId: input.categoryId,
          recommendedTagName: input.recommendTagName,
        },
      });
    });
    return { success: true };
  } catch (error) {
    return { error: "更新文章失败", message: error };
  }
}

// 通过ID删除文章
export async function deletePostById(id: number) {
  try {
    await db.post.delete({ where: { id } });
    revalidatePath("/end/edit");
    return { data: "删除文章成功" };
  } catch (error) {
    return { error: "删除文章失败", message: error };
  }
}

export async function getPostsWithTags() {
  try {
    const posts = await db.post.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        imgUrl: true,
        createdAt: true,
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
    const decodedSlug = decodeSlug(slug);
    const post = await db.post.findUnique({
      where: { slug: decodedSlug },
      select: {
        content: true,
        id: true,
        description: true,
        recommendedTagName: true,
        keywords: true,
        categoryId: true,
        views: true,
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
    const decodedSlug = decodeSlug(slug);
    const post = await db.post.findUnique({
      where: { slug: decodedSlug },
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

interface UpdatePostTagsParams {
  postId: number;
  oldTags: TagMain[];
  newTags: NewTag[];
}
/**
 * 比较最新的tags与post.tags。
 * 最新的tags中有的，而post.tags中没有的，则插入数据库post-tag表。
 * 最新的tags中没有的，而post.tags中有的，则删除post-tag表中对应的数据。
 * 两边都有的，就不处理
 * @param postId 文章id
 * @param oldTags 旧标签
 * @param newTags 新标签
 * @returns
 */
export async function updatePostTags({
  postId,
  oldTags,
  newTags,
}: UpdatePostTagsParams) {
  try {
    // 找出需要添加的标签
    const tagsToAdd = newTags.filter(
      (newTag) =>
        !oldTags.some((oldTag) => oldTag.tag.name === newTag.tag.name),
    );

    // 找出需要删除的标签
    const tagsToRemove = oldTags.filter(
      (oldTag) =>
        !newTags.some((newTag) => newTag.tag.name === oldTag.tag.name),
    );

    await db.$transaction(async (tx) => {
      // 1. 删除需要移除的标签关联
      await tx.postTag.deleteMany({
        where: {
          postId,
          tagId: {
            in: tagsToRemove.map((tag) => tag.tag.id),
          },
        },
      });

      // 2. 创建新标签并获取它们的ID
      const createdTags = await Promise.all(
        tagsToAdd.map(async (tag) => {
          return await tx.tag.create({
            data: {
              name: tag.tag.name,
              slug: tag.tag.slug,
            },
          });
        }),
      );

      // 3. 创建新的标签关联
      await tx.postTag.createMany({
        data: createdTags.map((tag) => ({
          postId,
          tagId: tag.id,
        })),
      });
    });

    return { success: true };
  } catch (error) {
    console.error("更新文章标签失败:", error);
    return { error: "更新文章标签失败" };
  }
}
