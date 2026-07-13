"use client";

import { Ban, CheckCircle2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  cancelAiRewriteTaskAction,
  retryAiRewriteTaskAction,
  resolveManualRequiredAiRewriteTaskAction,
} from "@/features/cms/actions/ai-rewrite-task";
import {
  cancelCoverGenerationTaskAction,
  retryCoverGenerationTaskAction,
} from "@/features/cms/actions/article-cover-image";
import {
  cancelServerOfferImportTaskAction,
  retryServerOfferImportTaskAction,
} from "@/features/cms/actions/server-offers";
import { Button } from "@/components/ui/button";
import {
  describeAdminResult,
  notifyActionError,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";
import type { UnifiedTaskListItem } from "@/features/cms/data/operations";

type UnifiedTaskActionType = UnifiedTaskListItem["type"];

type TaskActionResult =
  | { success: true; message?: string }
  | { success: false; error?: string; message?: string; errorTitle?: string };

async function retryTask(
  type: UnifiedTaskActionType,
  taskId: number,
): Promise<TaskActionResult> {
  if (type === "ai") {
    const result = await retryAiRewriteTaskAction(taskId);
    return result.error
      ? ({ success: false, error: result.error } satisfies TaskActionResult)
      : ({ success: true } satisfies TaskActionResult);
  }

  if (type === "cover") {
    return retryCoverGenerationTaskAction(taskId);
  }

  return retryServerOfferImportTaskAction(taskId);
}

async function cancelTask(type: UnifiedTaskActionType, taskId: number) {
  if (type === "ai") {
    const result = await cancelAiRewriteTaskAction(taskId);
    return result.error
      ? ({ success: false, error: result.error } satisfies TaskActionResult)
      : ({ success: true } satisfies TaskActionResult);
  }

  if (type === "cover") {
    return cancelCoverGenerationTaskAction(taskId);
  }

  return cancelServerOfferImportTaskAction(taskId);
}

export function UnifiedTaskActionButtons({
  type,
  taskId,
  status,
  canRetry,
  canCancel,
  canResolve = false,
  size = "sm",
}: {
  type: UnifiedTaskActionType;
  taskId: number;
  status: string;
  canRetry: boolean;
  canCancel: boolean;
  canResolve?: boolean;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const taskLabel =
    type === "ai"
      ? "AI 改写任务"
      : type === "cover"
        ? "封面生成任务"
        : "套餐提取任务";

  function handleRetry() {
    startTransition(async () => {
      const result = await retryTask(type, taskId);

      if (!result.success) {
        notifyActionError(result, {
          title: `${taskLabel}${status === "cancelled" ? "恢复" : "重试"}失败`,
          fallbackSuggestion: "请刷新任务中心后重试。",
        });
        return;
      }

      notifySuccess({
        title: `${taskLabel}已${status === "cancelled" ? "恢复" : "重试"}`,
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          result.message ?? "已重新加入后台队列",
        ]),
      });
      router.refresh();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelTask(type, taskId);

      if (!result.success) {
        notifyActionError(result, {
          title: `${taskLabel}取消失败`,
          fallbackSuggestion: "只能取消尚未开始执行的排队任务。",
        });
        return;
      }

      notifySuccess({
        title: `${taskLabel}已取消`,
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "需要继续时可点击恢复，任务会重新加入队列",
        ]),
      });
      router.refresh();
    });
  }

  function handleResolve() {
    if (type !== "ai") return;

    startTransition(async () => {
      const result = await resolveManualRequiredAiRewriteTaskAction(taskId);

      if (result.error) {
        notifyError({
          title: "AI 任务标记完成失败",
          description: describeAdminResult([
            `任务 ID ${taskId}`,
            result.error,
            "请确认已完成草稿审核和返利链接处理",
          ]),
        });
        return;
      }

      notifySuccess({
        title: "AI 任务已标记完成",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "该任务将不再出现在需人工处理统计中",
        ]),
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canRetry ? (
        <Button
          type="button"
          size={size}
          variant="outline"
          disabled={isPending}
          onClick={handleRetry}
        >
          <RotateCcw className="size-4" />
          {isPending ? "处理中" : status === "cancelled" ? "恢复" : "重试"}
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          type="button"
          size={size}
          variant="outline"
          disabled={isPending}
          onClick={handleCancel}
        >
          <Ban className="size-4" />
          {isPending ? "取消中" : "取消"}
        </Button>
      ) : null}
      {canResolve ? (
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
      ) : null}
    </div>
  );
}
