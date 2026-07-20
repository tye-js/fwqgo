"use client";

import { Ban, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  cancelAiRewriteTaskAction,
  deleteAiRewriteTaskAction,
  retryAiRewriteTaskAction,
  resolveManualRequiredAiRewriteTaskAction,
} from "@/features/cms/actions/ai-rewrite-task";
import {
  cancelCoverGenerationTaskAction,
  deleteCoverGenerationTaskAction,
  retryCoverGenerationTaskAction,
} from "@/features/cms/actions/article-cover-image";
import { retryProviderMonitorRunAction } from "@/features/cms/actions/provider-monitors";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { describeAdminResult } from "@/lib/admin-toast";
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

  return retryProviderMonitorRunAction(taskId);
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

  return {
    success: false,
    error: "供应商采集运行开始后不能取消，请停用采集源阻止后续计划。",
  } satisfies TaskActionResult;
}

async function deleteTask(
  type: "ai" | "cover",
  taskId: number,
): Promise<TaskActionResult> {
  if (type === "cover") {
    return deleteCoverGenerationTaskAction(taskId);
  }

  const result = await deleteAiRewriteTaskAction(taskId);
  return result.error
    ? ({ success: false, error: result.error } satisfies TaskActionResult)
    : ({ success: true } satisfies TaskActionResult);
}

export function UnifiedTaskActionButtons({
  type,
  taskId,
  status,
  canRetry,
  canCancel,
  canResolve = false,
  afterDeleteHref,
  size = "sm",
}: {
  type: UnifiedTaskActionType;
  taskId: number;
  status: string;
  canRetry: boolean;
  canCancel: boolean;
  canResolve?: boolean;
  afterDeleteHref?: string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const { mutate, isPending } = useAdminMutation();
  const mutationKey = `unified-task:${type}:${taskId}`;
  const pending = isPending(mutationKey);
  const taskLabel =
    type === "ai"
      ? "AI 改写任务"
      : type === "cover"
        ? "封面生成任务"
        : "供应商采集任务";

  function handleRetry() {
    const actionLabel = status === "cancelled" ? "恢复" : "重试";
    void mutate({
      key: mutationKey,
      action: () => retryTask(type, taskId),
      pendingMessage: {
        title: `正在${actionLabel}${taskLabel}...`,
        description: `任务 ID ${taskId}`,
      },
      successMessage: (result) => ({
        title: `${taskLabel}已${actionLabel}`,
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          result.message ?? "已重新加入后台队列",
        ]),
      }),
      errorTitle: `${taskLabel}${actionLabel}失败`,
      errorSuggestion: "请刷新任务中心后重试。",
    });
  }

  function handleCancel() {
    void mutate({
      key: mutationKey,
      action: () => cancelTask(type, taskId),
      pendingMessage: {
        title: `正在取消${taskLabel}...`,
        description: `任务 ID ${taskId}`,
      },
      successMessage: {
        title: `${taskLabel}已取消`,
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "需要继续时可点击恢复，任务会重新加入队列",
        ]),
      },
      errorTitle: `${taskLabel}取消失败`,
      errorSuggestion: "只能取消尚未开始执行的排队任务。",
    });
  }

  function handleResolve() {
    if (type !== "ai") return;

    void mutate({
      key: mutationKey,
      action: () => resolveManualRequiredAiRewriteTaskAction(taskId),
      pendingMessage: {
        title: "正在更新 AI 任务状态...",
        description: `任务 ID ${taskId}`,
      },
      successMessage: {
        title: "AI 任务已标记完成",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "该任务将不再出现在需人工处理统计中",
        ]),
      },
      errorTitle: "AI 任务标记完成失败",
      errorSuggestion: "请确认已完成草稿审核和返利链接处理。",
    });
  }

  function handleDelete() {
    if ((type !== "ai" && type !== "cover") || status === "running") return;

    void mutate({
      key: mutationKey,
      action: () => deleteTask(type, taskId),
      pendingMessage: {
        title: `正在删除${taskLabel}...`,
        description: `任务 ID ${taskId}`,
      },
      successMessage: {
        title: `${taskLabel}已删除`,
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          type === "cover"
            ? "图片资产和文章封面保持不变"
            : "已生成的草稿文章会保留，仅清理任务记录和步骤日志",
        ]),
      },
      errorTitle: `${taskLabel}删除失败`,
      errorSuggestion: "处理中任务需要等待结束后再删除。",
      refresh: !afterDeleteHref,
      onSuccess: () => {
        if (afterDeleteHref) {
          router.push(afterDeleteHref);
        }
      },
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {canRetry ? (
        <Button
          type="button"
          size={size}
          variant="outline"
          disabled={pending}
          onClick={handleRetry}
        >
          <RotateCcw className="size-4" />
          {pending ? "处理中" : status === "cancelled" ? "恢复" : "重试"}
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          type="button"
          size={size}
          variant="outline"
          disabled={pending}
          onClick={handleCancel}
        >
          <Ban className="size-4" />
          {pending ? "取消中" : "取消"}
        </Button>
      ) : null}
      {canResolve ? (
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
      ) : null}
      {(type === "ai" || type === "cover") && status !== "running" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size={size}
              variant="outline"
              disabled={pending}
              aria-label={`删除${taskLabel} ${taskId}`}
            >
              <Trash2 className="size-4" />
              {pending ? "处理中" : "删除"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                删除{taskLabel} #{taskId}？
              </AlertDialogTitle>
              <AlertDialogDescription>
                {type === "cover"
                  ? "只会删除任务记录，已生成的图片资产和文章封面会保留。任务删除后无法恢复。"
                  : "只会删除任务记录和步骤日志，已生成的草稿文章会保留。任务删除后无法恢复。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                确定删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
