"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { retryAiRewriteTaskAction } from "@/app/_actions/ai-rewrite-task";
import { Button } from "@/components/ui/button";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";

export function AiRewriteTaskRetryButton({ taskId }: { taskId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    startTransition(async () => {
      const result = await retryAiRewriteTaskAction(taskId);

      if (result.error) {
        notifyError({
          title: "AI 改写任务重试失败",
          description: describeAdminResult([
            `任务 ID ${taskId}`,
            result.error,
            "请确认任务仍存在，并检查 AI 配置、来源链接和服务器日志",
          ]),
        });
        return;
      }

      notifySuccess({
        title: "AI 改写任务已重新加入队列",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "系统会重新抓取、清洗、改写，成功后再保存草稿",
        ]),
      });
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={handleRetry}
    >
      <RotateCcw className="size-4" />
      {isPending ? "启动中" : "重试任务"}
    </Button>
  );
}
