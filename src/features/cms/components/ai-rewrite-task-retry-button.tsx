"use client";

import { RotateCcw } from "lucide-react";

import { retryAiRewriteTaskAction } from "@/features/cms/actions/ai-rewrite-task";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { describeAdminResult } from "@/lib/admin-toast";

export function AiRewriteTaskRetryButton({ taskId }: { taskId: number }) {
  const { mutate, isPending } = useAdminMutation();
  const mutationKey = `ai-rewrite-task:${taskId}`;
  const pending = isPending(mutationKey);

  const handleRetry = () => {
    void mutate({
      key: mutationKey,
      action: () => retryAiRewriteTaskAction(taskId),
      pendingMessage: {
        title: "正在重新加入任务队列...",
        description: `任务 ID ${taskId}`,
      },
      successMessage: {
        title: "AI 改写任务已重新加入队列",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "系统会重新抓取、清洗、改写，成功后再保存草稿",
        ]),
      },
      errorTitle: "AI 改写任务重试失败",
      errorSuggestion:
        "请确认任务仍存在，并检查 AI 配置、来源链接和服务器日志。",
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={handleRetry}
    >
      <RotateCcw className="size-4" />
      {pending ? "启动中" : "重试任务"}
    </Button>
  );
}
