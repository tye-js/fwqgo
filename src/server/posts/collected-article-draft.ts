import { eq } from "drizzle-orm";

import { DEFAULT_ARTICLE_COVER } from "@fwqgo/core/article-cover";
import { structuredLog } from "@fwqgo/core/structured-log";
import { TaskLeaseLostError } from "@fwqgo/core/task-lease";
import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  aiTaskSteps,
  posts,
  sourceMaterials,
} from "@fwqgo/db/schema";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { createPostRecordInTransaction } from "@/server/posts/create-post-record";
import type { AffiliateRewriteReport } from "@/server/links/affiliate-link-rewriter";
import type { ScrapedArticle } from "@/server/scrape/article-scraper";

type CollectionTask = typeof aiRewriteTasks.$inferSelect;

/**
 * 把采集时的返利盘点结果序列化成 `posts.affiliateReviewDetails` 的结构。
 *
 * 字段与发布审核写入的那份保持一致（这样列表里的「命中/未命中/无效」计数逻辑只有一套），
 * 额外带 `source: "collection"` 以便区分这份快照是入稿时写的、还是发布时写的。
 */
function serializeCollectedAffiliateDetails(report: AffiliateRewriteReport) {
  return JSON.stringify({
    totalLinks: report.totalLinks,
    matchedCount: report.matchedLinks.length,
    unmatchedCount: report.unmatchedLinks.length,
    invalidCount: report.invalidLinks.length,
    internalLinksRemoved: report.internalLinksRemoved,
    matchedLinks: report.matchedLinks,
    unmatchedLinks: report.unmatchedLinks,
    invalidLinks: report.invalidLinks,
    manualHosts: [
      ...new Set(
        report.invalidLinks
          .map((item) => item.host)
          .filter((host): host is string => Boolean(host)),
      ),
    ],
    checkedAt: new Date().toISOString(),
    source: "collection",
  });
}

export async function saveCollectedArticleDraft(
  task: CollectionTask,
  article: ScrapedArticle,
) {
  if (!task.leaseOwner) throw new TaskLeaseLostError();
  if (!article.htmlContent.trim())
    throw new Error("清洗后的正文为空，无法保存草稿");

  const post = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(aiRewriteTasks)
      .where(eq(aiRewriteTasks.id, task.id))
      .for("update")
      .limit(1);
    if (
      current?.status !== "running" ||
      current.leaseOwner !== task.leaseOwner
    ) {
      throw new TaskLeaseLostError();
    }

    // The task lock makes draft creation and its checkpoint one atomic operation.
    // A retry may reuse a linked article, but must never overwrite operator edits.
    let savedPost = current.postId
      ? (
          await tx
            .select()
            .from(posts)
            .where(eq(posts.id, current.postId))
            .limit(1)
        )[0]
      : undefined;
    if (!savedPost) {
      const title =
        article.title.trim().slice(0, 300) || `采集草稿 #${task.id}`;
      const slug = `${slugify(title).slice(0, 260) || "collected-article"}-${task.id}`;
      const result = await createPostRecordInTransaction(
        {
          title,
          slug,
          description: article.description.trim().slice(0, 800),
          content: article.htmlContent,
          categoryId: current.categoryId,
          language: "zh",
          published: false,
          imgUrl: DEFAULT_ARTICLE_COVER,
          keywords: "",
          // 采集阶段已经盘点过链接，把结果留在文章上，「未命中」才不会在草稿箱里隐身。
          // 用可选链：类型上 diagnostics 是必填，但手工构造的 article（测试、历史调用）
          // 可能没有，读崩了会让整个入稿失败——这比少一条标记严重得多。
          affiliateReviewDetails: article.diagnostics?.affiliateReport
            ? serializeCollectedAffiliateDetails(
                article.diagnostics.affiliateReport,
              )
            : null,
        },
        tx,
        // 采集入稿不应保留历史 `/go/{slug}`：源站可能复用我们的短链，旧草稿也会残留。
        // 展开后再补返利参数，草稿里看到的就是商家真实地址。
        { expandShortLinks: true },
      );
      if (result.error || !result.data) {
        throw new Error(result.error ?? "采集正文保存草稿失败");
      }
      savedPost = result.data;
    }

    const now = new Date();
    await tx
      .update(aiRewriteTasks)
      .set({
        postId: savedPost.id,
        resultTitle: savedPost.title,
        status: "succeeded",
        requestStage: "checkpointed",
        progress: 100,
        currentStep: "正文已清洗、替换返利链接并保存到草稿箱",
        rewriteOutputLength: savedPost.content.length,
        error: null,
        finishedAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
      })
      .where(eq(aiRewriteTasks.id, task.id));
    if (current.sourceMaterialId) {
      await tx
        .update(sourceMaterials)
        .set({ status: "succeeded", updatedAt: now })
        .where(eq(sourceMaterials.id, current.sourceMaterialId));
    }
    await tx
      .insert(aiTaskSteps)
      .values({
        taskId: task.id,
        attempt: current.attempts,
        stepKey: "draft_save",
        stepName: "保存草稿",
        status: "success",
        progress: 100,
        message: `完整正文已保存为草稿 #${savedPost.id}`,
        finishedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [aiTaskSteps.taskId, aiTaskSteps.stepKey, aiTaskSteps.attempt],
        set: {
          stepName: "保存草稿",
          status: "success",
          progress: 100,
          message: `完整正文已保存为草稿 #${savedPost.id}`,
          finishedAt: now,
          updatedAt: now,
        },
      });
    return savedPost;
  });

  try {
    await syncImageReferencesForPost(post.id);
  } catch (error) {
    structuredLog("warn", "article.collection_image_references_failed", {
      postId: post.id,
      error,
    });
  }
  try {
    schedulePublicWebCache("post.changed", {
      postIds: [post.id],
      postSlugs: [post.slug],
      categoryIds: [post.categoryId],
    });
  } catch (error) {
    structuredLog("warn", "article.collection_cache_refresh_failed", {
      postId: post.id,
      error,
    });
  }
  return post;
}
