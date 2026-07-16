"use client";

import { Ban, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  cancelAiRewriteTaskAction,
  deleteAiRewriteTaskAction,
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

  function notifyUnexpectedError(action: string, error: unknown) {
    notifyError({
      title: `${taskLabel}${action}失败`,
      description: describeAdminResult([
        `任务 ID ${taskId}`,
        error instanceof Error ? error.message : "请求未完成",
        "请刷新任务中心确认最新状态后再操作",
      ]),
    });
  }

  function handleRetry() {
    startTransition(async () => {
      const action = status === "cancelled" ? "恢复" : "重试";
      try {
        const result = await retryTask(type, taskId);

        if (!result.success) {
          notifyActionError(result, {
            title: `${taskLabel}${action}失败`,
            fallbackSuggestion: "请刷新任务中心后重试。",
          });
          return;
        }

        notifySuccess({
          title: `${taskLabel}已${action}`,
          description: describeAdminResult([
            `任务 ID ${taskId}`,
            result.message ?? "已重新加入后台队列",
          ]),
        });
        router.refresh();
      } catch (error) {
        notifyUnexpectedError(action, error);
      }
    });
  }

  function handleCancel() {
    startTransition(async () => {
      try {
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
      } catch (error) {
        notifyUnexpectedError("取消", error);
      }
    });
  }

  function handleResolve() {
    if (type !== "ai") return;

    startTransition(async () => {
      try {
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
      } catch (error) {
        notifyUnexpectedError("标记完成", error);
      }
    });
  }

  function handleDelete() {
    if (type !== "ai" || status === "running") return;

    startTransition(async () => {
      try {
        const result = await deleteAiRewriteTaskAction(taskId);
        if (result.error) {
          notifyError({
            title: "AI 改写任务删除失败",
            description: describeAdminResult([
              `任务 ID ${taskId}`,
              result.error,
              "处理中任务需要等待结束后再删除",
            ]),
          });
          return;
        }

        notifySuccess({
          title: "AI 改写任务已删除",
          description: describeAdminResult([
            `任务 ID ${taskId}`,
            result.data?.postId
              ? "已生成的草稿文章保留，可继续在草稿箱编辑"
              : "仅清理任务记录和步骤日志",
          ]),
        });
        router.refresh();
      } catch (error) {
        notifyUnexpectedError("删除", error);
      }
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
      {type === "ai" && status !== "running" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size={size}
              variant="outline"
              disabled={isPending}
              aria-label={`删除 AI 改写任务 ${taskId}`}
            >
              <Trash2 className="size-4" />
              {isPending ? "处理中" : "删除"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                删除 AI 改写任务 #{taskId}？
              </AlertDialogTitle>
              <AlertDialogDescription>
                只会删除任务记录和步骤日志，已生成的草稿文章会保留。任务删除后无法恢复。
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
