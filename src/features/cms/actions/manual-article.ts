"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession, isUnauthorizedError } from "@fwqgo/auth/session";
import { structuredLog } from "@fwqgo/core/structured-log";
import { manualArticleSchema } from "@/features/cms/lib/manual-article";
import { PostEditValidationError } from "@/features/cms/lib/post-edit";
import { saveManualArticleTask } from "@/server/posts/manual-article-task";
import { withAdminAudit } from "@/features/cms/lib/admin-audit";

async function saveManualArticleTaskActionImpl(input: unknown) {
  try {
    await requireAdminSession();
    const parsed = manualArticleSchema.safeParse(input);
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? "输入信息不正确" };
    const data = await saveManualArticleTask(parsed.data);
    for (const pathname of [
      "/ai-rewrite/tasks",
      "/ai-tasks",
      `/ai-rewrite/tasks/${parsed.data.taskId}`,
      `/ai-tasks/${parsed.data.taskId}`,
      "/posts/drafts",
      "/posts/edit",
    ]) {
      revalidatePath(pathname);
    }
    return { data };
  } catch (error) {
    if (isUnauthorizedError(error)) return { error: "请先登录管理员账号" };
    if (error instanceof PostEditValidationError)
      return { error: error.message };
    structuredLog("error", "article.manual_save_failed", { error });
    return { error: "人工文章保存失败，请稍后重试" };
  }
}

export const saveManualArticleTaskAction = withAdminAudit(
  {
    action: "manual_article.save",
    entityType: "ai_rewrite_task",
  },
  saveManualArticleTaskActionImpl,
);
