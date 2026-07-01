"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { resolveManualRequiredAiRewriteTaskAction } from "@/app/_actions/ai-rewrite-task";
import { Button } from "@/components/ui/button";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";

export function AiRewriteTaskResolveButton({
  taskId,
  size = "default",
}: {
  taskId: number;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleResolve = () => {
    startTransition(async () => {
      const result = await resolveManualRequiredAiRewriteTaskAction(taskId);

      if (result.error) {
        notifyError({
          title: "任务状态更新失败",
          description: describeAdminResult([
            `任务 ID ${taskId}`,
            result.error,
            "请确认已完成草稿审核和返利链接处理",
          ]),
        });
        return;
      }

      notifySuccess({
        title: "任务已标记为完成",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "该任务将不再出现在需人工处理统计中",
        ]),
      });
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={isPending}
      onClick={handleResolve}
    >
      <CheckCircle2 className="size-4" />
      {isPending ? "更新中" : "标记完成"}
    </Button>
  );
}
