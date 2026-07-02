"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";

import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { db } from "@fwqgo/db";
import { posts } from "@fwqgo/db/schema";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { generateArticleCoverImage } from "@/server/images/generated-cover";

const coverSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空"),
  description: z.string().trim().optional(),
  keywords: z.string().trim().optional(),
  content: z.string().optional(),
  fileSlug: z.string().trim().optional(),
  language: z.enum(["zh", "en"]).default("zh"),
  configId: z.coerce.number().int().positive().optional(),
});

const batchCoverSchema = z.object({
  postIds: z.array(z.coerce.number().int().positive()).min(1).max(20),
});

export async function generateArticleCoverImageAction(input: {
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  fileSlug?: string | null;
  language?: "zh" | "en";
  configId?: number;
}) {
  try {
    const session = await requireAdminSession();
    const payload = coverSchema.parse(input);
    const result = await generateArticleCoverImage({
      ...payload,
      uploadedBy: session.userId,
    });

    revalidatePath("/images/list");

    return {
      success: true,
      url: result.asset.path,
      assetId: result.asset.id,
      prompt: result.prompt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "生成封面图失败",
    };
  }
}

export async function batchGenerateArticleCoverImagesAction(input: {
  postIds: number[];
}) {
  try {
    const session = await requireAdminSession();
    const payload = batchCoverSchema.parse(input);
    const uniquePostIds = [...new Set(payload.postIds)];
    const postRows = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        description: posts.description,
        keywords: posts.keywords,
        content: posts.content,
        categoryId: posts.categoryId,
      })
      .from(posts)
      .where(inArray(posts.id, uniquePostIds));
    const postById = new Map(postRows.map((post) => [post.id, post]));
    const revalidateTags = new Set<string>();
    const results: Array<{
      postId: number;
      title?: string;
      success: boolean;
      url?: string;
      assetId?: number;
      error?: string;
    }> = [];

    for (const postId of uniquePostIds) {
      const post = postById.get(postId);

      if (!post) {
        results.push({
          postId,
          success: false,
          error: "文章不存在或已被删除",
        });
        continue;
      }

      try {
        const generated = await generateArticleCoverImage({
          title: post.title,
          description: post.description,
          keywords: post.keywords,
          content: post.content,
          fileSlug: post.slug,
          language: "zh",
          uploadedBy: session.userId,
        });

        const [updatedPost] = await db
          .update(posts)
          .set({
            imgUrl: generated.asset.path,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, post.id))
          .returning({
            id: posts.id,
            slug: posts.slug,
            categoryId: posts.categoryId,
          });

        if (!updatedPost) {
          throw new Error("封面写入文章失败");
        }

        await syncImageReferencesForPost(updatedPost.id);
        revalidateTags.add(cacheTags.post(updatedPost.id));
        revalidateTags.add(cacheTags.postSlug(updatedPost.slug));
        revalidateTags.add(cacheTags.category(updatedPost.categoryId));
        results.push({
          postId: post.id,
          title: post.title,
          success: true,
          url: generated.asset.path,
          assetId: generated.asset.id,
        });
      } catch (error) {
        results.push({
          postId: post.id,
          title: post.title,
          success: false,
          error: error instanceof Error ? error.message : "生成封面图失败",
        });
      }
    }

    if (revalidateTags.size > 0) {
      revalidateSiteContent([...revalidateTags]);
    }

    revalidatePath("/images/covers");
    revalidatePath("/images/ai-generate");
    revalidatePath("/images/list");
    revalidatePath("/posts/edit");
    revalidatePath("/posts/drafts");

    return {
      success: true,
      results,
      successCount: results.filter((result) => result.success).length,
      failedCount: results.filter((result) => !result.success).length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "批量生成封面图失败",
    };
  }
}
