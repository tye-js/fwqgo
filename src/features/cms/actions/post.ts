"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/server/db";
import { slugify } from "@/lib/utils";
import { type CreatePostParams } from "@/types/post.types";
import { type NewTag, type TagMain } from "@/types";
import { normalizeArticleHtml } from "@/lib/content";
import { requireAdminSession } from "@/server/auth/session";
import { cacheTags, revalidateSiteContent } from "@/server/cache/tags";
import { shortenArticleOutboundLinks } from "@/server/links/outbound-short-link";
import {
  createPostRecord,
  getErrorMessage,
  type CreatePostInput,
} from "@/server/posts/create-post-record";
import {
  deleteImageReferencesForPosts,
  syncImageReferencesForPost,
} from "@/server/images/assets";
import {
  posts,
  tags,
  postTags,
} from "@/server/db/schema";
import {
  eq,
  and,
  inArray,
} from "drizzle-orm";

function normalizeTagName(name: string) {
  return name.trim();
}

function revalidateImageAssetList() {
  revalidatePath("/end/images/list");
}

interface UpdatePostTagsParams {
  postId: number;
  oldTags: TagMain[];
  newTags: NewTag[];
}

export async function createPost(input: CreatePostInput | CreatePostParams) {
  try {
    await requireAdminSession();
    const result = await createPostRecord(input);
    if (result.data) {
      revalidateImageAssetList();
    }
    return result;
  } catch (error) {
    console.error("创建文章失败:", error);
    return { error: "创建文章失败", message: getErrorMessage(error) };
  }
}

export async function updatePostByRecommendedTagName(
  postId: number,
  recommendedTagName: string,
) {
  try {
    await requireAdminSession();

    // 先验证标签是否存在
    const [tag] = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.name, recommendedTagName))
      .limit(1);

    if (!tag) {
      return { error: `标签 '${recommendedTagName}' 不存在` };
    }

    const [result] = await db
      .update(posts)
      .set({
        recommendedTagName: tag.name,
        recommendedTagId: tag.id,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    if (result) {
      revalidateSiteContent([
        cacheTags.post(result.id),
        cacheTags.postSlug(result.slug),
      ]);
    }

    return { data: result };
  } catch (error) {
    return { error: "更新文章推荐标签失败", message: error };
  }
}

export async function updatePost(input: {
  id: number;
  title: string;
  slug: string;
  imgUrl: string | null;
  published: boolean;
}) {
  try {
    await requireAdminSession();

    const [currentPost] = await db
      .select({
        slug: posts.slug,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(eq(posts.id, input.id))
      .limit(1);

    const [post] = await db
      .update(posts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(posts.id, input.id))
      .returning();

    if (post) {
      await syncImageReferencesForPost(post.id);
      revalidateImageAssetList();
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        ...(currentPost?.slug && currentPost.slug !== post.slug
          ? [cacheTags.postSlug(currentPost.slug)]
          : []),
        ...(currentPost?.categoryId ? [cacheTags.category(currentPost.categoryId)] : []),
      ]);
    }

    return { data: post };
  } catch (error) {
    return { error: "更新文章失败", message: error };
  }
}

export async function updatePostContent(input: {
  id: number;
  description: string;
  content: string;
  imgUrl?: string | null;
  categoryId: number;
  recommendTagName: string;
  keywords: string;
}) {
  try {
    await requireAdminSession();

    const [currentPost] = await db
      .select({
        slug: posts.slug,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(eq(posts.id, input.id))
      .limit(1);

    let recommendedTag: { id: number; name: string } | null = null;
    if (input.recommendTagName) {
      const [existingTag] = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.name, input.recommendTagName))
        .limit(1);

      if (!existingTag) {
        return { error: "推荐标签不存在，请先创建该标签" };
      }

      recommendedTag = existingTag;
    }

    const [post] = await db
      .update(posts)
      .set({
        description: input.description,
        content: normalizeArticleHtml(
          await shortenArticleOutboundLinks(input.content),
        ),
        imgUrl: input.imgUrl ?? null,
        categoryId: input.categoryId,
        recommendedTagName: recommendedTag?.name ?? null,
        recommendedTagId: recommendedTag?.id ?? null,
        keywords: input.keywords,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, input.id))
      .returning();

    if (post) {
      await syncImageReferencesForPost(post.id);
      revalidateImageAssetList();
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        ...(currentPost?.categoryId && currentPost.categoryId !== post.categoryId
          ? [cacheTags.category(currentPost.categoryId)]
          : []),
      ]);
    }

    return { success: true };
  } catch (error) {
    return { error: "更新文章失败", message: error };
  }
}

export async function deletePostById(id: number) {
  try {
    await requireAdminSession();

    const [deletedPost] = await db.delete(posts).where(eq(posts.id, id)).returning({
      id: posts.id,
      slug: posts.slug,
      categoryId: posts.categoryId,
    });

    if (deletedPost) {
      await syncImageReferencesForPost(deletedPost.id);
      revalidateImageAssetList();
      revalidateSiteContent([
        cacheTags.post(deletedPost.id),
        cacheTags.postSlug(deletedPost.slug),
        cacheTags.category(deletedPost.categoryId),
      ]);
    }

    return { data: "删除文章成功" };
  } catch (error) {
    return { error: "删除文章失败", message: error };
  }
}

export async function deletePostsByIds(ids: number[]) {
  try {
    await requireAdminSession();

    if (ids.length === 0) {
      return { data: 0 };
    }

    const deletedPosts = await db.delete(posts).where(inArray(posts.id, ids)).returning({
      id: posts.id,
      slug: posts.slug,
      categoryId: posts.categoryId,
    });

    if (deletedPosts.length > 0) {
      await deleteImageReferencesForPosts(deletedPosts.map((post) => post.id));
      revalidateImageAssetList();
    }

    revalidateSiteContent(
      deletedPosts.flatMap((post) => [
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
      ]),
    );

    return { data: deletedPosts.length };
  } catch (error) {
    return { error: "批量删除文章失败", message: error };
  }
}

export async function updatePostTags({
  postId,
  oldTags,
  newTags,
}: UpdatePostTagsParams) {
  try {
    await requireAdminSession();
    const uniqueNewTags = Array.from(
      new Map(
        newTags
          .map((tag) => {
            const name = normalizeTagName(tag.tag.name);
            const slug = tag.tag.slug || slugify(name);

            if (!name || !slug) {
              return null;
            }

            return [
              slug,
              {
                tag: {
                  ...tag.tag,
                  name,
                  slug,
                },
              },
            ] as const;
          })
          .filter((tag): tag is NonNullable<typeof tag> => tag !== null),
      ).values(),
    );
    const newTagSlugs = new Set(uniqueNewTags.map((tag) => tag.tag.slug));

    // 找出需要添加的标签
    const tagsToAdd = uniqueNewTags.filter(
      (newTag) =>
        !oldTags.some((oldTag) => oldTag.tag.slug === newTag.tag.slug),
    );

    // 找出需要删除的标签
    const tagsToRemove = oldTags.filter(
      (oldTag) => !newTagSlugs.has(oldTag.tag.slug),
    );

    // 使用事务处理
    await db.transaction(async (tx) => {
      // 1. 删除需要移除的标签文章关联
      if (tagsToRemove.length > 0) {
        await tx.delete(postTags).where(
          and(
            eq(postTags.postId, postId),
            inArray(
              postTags.tagId,
              tagsToRemove.map((tag) => tag.tag.id),
            ),
          ),
        );
      }

      // 2. 创建新标签并获取它们的ID
      if (tagsToAdd.length > 0) {
        const createdTagsIdArray = Array.from(
          new Set(
            await Promise.all(
          tagsToAdd.map(async (tag) => {
            const slug = slugify(tag.tag.name);
            const [existingTag] = await tx
              .select({ id: tags.id })
              .from(tags)
              .where(eq(tags.slug, slug))
              .limit(1);

            if (existingTag) {
              return existingTag.id;
            }

            const [newTagResult] = await tx
              .insert(tags)
              .values({
                name: tag.tag.name,
                slug,
              })
              .returning({ id: tags.id });

            return newTagResult!.id;
          }),
            ),
          ),
        );

        // 向数据库中插入文章标签关联
        await tx.insert(postTags).values(
          createdTagsIdArray.map((tagId) => ({
            postId: postId,
            tagId: tagId,
          })),
        );
      }
    });

    const [post] = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (post) {
      revalidateSiteContent([
        cacheTags.post(post.id),
        cacheTags.postSlug(post.slug),
        cacheTags.category(post.categoryId),
        cacheTags.tags,
      ]);
    }

    return { success: true };
  } catch (error) {
    console.error("更新文章标签失败:", error);
    return { error: "更新文章标签失败" };
  }
}
