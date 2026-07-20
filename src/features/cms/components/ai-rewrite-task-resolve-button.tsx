"use client";

import { CheckCircle2 } from "lucide-react";

import { resolveManualRequiredAiRewriteTaskAction } from "@/features/cms/actions/ai-rewrite-task";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { describeAdminResult } from "@/lib/admin-toast";

export function AiRewriteTaskResolveButton({
  taskId,
  size = "default",
}: {
  taskId: number;
  size?: "default" | "sm";
}) {
  const { mutate, isPending } = useAdminMutation();
  const mutationKey = `ai-rewrite-task:${taskId}`;
  const pending = isPending(mutationKey);

  const handleResolve = () => {
    void mutate({
      key: mutationKey,
      action: () => resolveManualRequiredAiRewriteTaskAction(taskId),
      pendingMessage: {
        title: "正在更新任务状态...",
        description: `任务 ID ${taskId}`,
      },
      successMessage: {
        title: "任务已标记为完成",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "该任务将不再出现在需人工处理统计中",
        ]),
      },
      errorTitle: "任务状态更新失败",
      errorSuggestion: "请确认已完成草稿审核和返利链接处理。",
    });
  };

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={pending}
      onClick={handleResolve}
    >
      <CheckCircle2 className="size-4" />
      {pending ? "更新中" : "标记完成"}
    </Button>
  );
}
