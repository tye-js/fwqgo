import { eq } from "drizzle-orm";

import { DEFAULT_ARTICLE_COVER } from "@fwqgo/core/article-cover";
import { structuredLog } from "@fwqgo/core/structured-log";
import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  aiTaskSteps,
  posts,
  sourceMaterials,
} from "@fwqgo/db/schema";
import {
  getManualEnglishSourceId,
  type ManualArticleInput,
} from "@/features/cms/lib/manual-article";
import { PostEditValidationError } from "@/features/cms/lib/post-edit";
import { createPostRecordInTransaction } from "@/server/posts/create-post-record";
import { regeneratePostInternalLinks } from "@/server/posts/internal-links";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";

export async function saveManualArticleTask(input: ManualArticleInput) {
  const post = await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.id, input.taskId))
      .for("update")
      .limit(1);
    if (!task) throw new PostEditValidationError("任务不存在");
    if (task.status !== "manual_required") {
      throw new PostEditValidationError("任务状态已变化，请刷新后再保存", 409);
    }
    if (
      (task.updatedAt ?? task.createdAt).toISOString() !==
      input.expectedUpdatedAt
    ) {
      throw new PostEditValidationError("任务内容已更新，请刷新后再保存", 409);
    }
    const language = task.sourceType === "english" ? "en" : "zh";
    const parentId =
      language === "en" ? getManualEnglishSourceId(task.sourceUrl) : null;
    const hasLegacyParentPointer =
      language === "en" && task.postId === parentId;
    if ((task.postId && !hasLegacyParentPointer) || task.sourceType === "seo") {
      throw new PostEditValidationError(
        "任务已有文章，请从文章编辑页修改正文和 SEO",
        409,
      );
    }

    if (language === "en") {
      if (!parentId)
        throw new PostEditValidationError("英文任务缺少中文来源文章");
      const [parent] = await tx
        .select({ id: posts.id, language: posts.language })
        .from(posts)
        .where(eq(posts.id, parentId))
        .for("update")
        .limit(1);
      if (!parent || parent.language === "en") {
        throw new PostEditValidationError("对应的中文来源文章不存在");
      }
      const [translation] = await tx
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.translationSourcePostId, parentId))
        .limit(1);
      if (translation)
        throw new PostEditValidationError(
          "已存在英文文章，请编辑已有英文稿",
          409,
        );
    }

    const result = await createPostRecordInTransaction(
      {
        post: {
          title: input.title,
          slug: input.slug,
          description: input.description,
          content: input.content,
          keywords: input.keywords,
          categoryId: task.categoryId,
          language,
          translationSourcePostId: parentId,
          published: false,
          imgUrl: DEFAULT_ARTICLE_COVER,
          recommendedTagName: input.tagNames[0] ?? null,
        },
        tags: input.tagNames.map((name) => ({ name })),
      },
      tx,
    );
    if (result.error || !result.data) {
      throw new PostEditValidationError(result.error ?? "草稿保存失败");
    }

    const now = new Date();
    await tx
      .update(aiRewriteTasks)
      .set({
        postId: result.data.id,
        resultTitle: result.data.title,
        status: "succeeded",
        requestStage: "checkpointed",
        progress: 100,
        currentStep:
          "人工正文和 SEO 已保存，使用默认封面，可在文章编辑页手动生成封面",
        rewriteOutputLength: input.content.length,
        error: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(aiRewriteTasks.id, task.id));
    if (task.sourceMaterialId) {
      await tx
        .update(sourceMaterials)
        .set({ status: "succeeded", updatedAt: now })
        .where(eq(sourceMaterials.id, task.sourceMaterialId));
    }
    await tx
      .insert(aiTaskSteps)
      .values({
        taskId: task.id,
        attempt: task.attempts,
        stepKey: "manual_input",
        stepName: "人工填写正文与 SEO",
        status: "success",
        progress: 100,
        message: `人工内容已保存为草稿 #${result.data.id}`,
        finishedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [aiTaskSteps.taskId, aiTaskSteps.stepKey, aiTaskSteps.attempt],
        set: {
          status: "success",
          progress: 100,
          message: `人工内容已保存为草稿 #${result.data.id}`,
          finishedAt: now,
          updatedAt: now,
        },
      });
    return result.data;
  });

  const warnings: string[] = [];
  try {
    await syncImageReferencesForPost(post.id);
    await regeneratePostInternalLinks({
      postId: post.id,
      mode: "activate-high-confidence",
      generatedBy: "rule",
      includeKnowledge: false,
    });
  } catch (error) {
    structuredLog("error", "article.manual_postprocess_failed", {
      postId: post.id,
      error,
    });
    warnings.push("草稿已保存，图片引用或标签内链稍后需要重新检查");
  }
  try {
    schedulePublicWebCache("post.changed", {
      postIds: [post.id],
      postSlugs: [post.slug],
      categoryIds: [post.categoryId],
    });
  } catch (error) {
    structuredLog("warn", "article.manual_cache_refresh_failed", {
      postId: post.id,
      error,
    });
  }

  return { postId: post.id, slug: post.slug, warnings };
}
