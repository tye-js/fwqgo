"use client";

import {
  createContext,
  useContext,
  useOptimistic,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@fwqgo/core/utils";

type TaskType = "ai" | "cover" | "offer";
type TaskOperation = "retry" | "resume" | "cancel" | "resolve" | "delete";
type TaskMutation = {
  operation: TaskOperation;
  phase: "submitting" | "accepted";
};

const TaskMutationContext = createContext<{
  type: TaskType;
  mutation: TaskMutation | null;
  update: (mutation: TaskMutation | null) => void;
} | null>(null);

function describeTaskMutation(type: TaskType, mutation: TaskMutation) {
  if (mutation.phase === "submitting") {
    const labels: Record<TaskOperation, string> = {
      retry: "正在提交重试",
      resume: "正在恢复任务",
      cancel: "正在取消任务",
      resolve: "正在标记完成",
      delete: "正在删除任务",
    };
    return {
      label: labels[mutation.operation],
      message: `${labels[mutation.operation]}，请稍候。`,
    };
  }
  switch (mutation.operation) {
    case "retry":
    case "resume":
      return type === "offer"
        ? {
            label: "已提交新运行",
            message: "新的采集运行已提交，可在任务中心查看进度。",
          }
        : {
            label: "已加入队列",
            message: "请求已提交，等待后台执行。",
          };
    case "cancel":
      return { label: "已取消", message: "任务已取消，正在同步最新状态。" };
    case "resolve":
      return {
        label: "已标记完成",
        message: "任务已标记完成，正在同步最新状态。",
      };
    case "delete":
      return { label: "已删除", message: "任务已删除，正在更新列表。" };
  }
}

export function TaskMutationBoundary({
  type,
  children,
}: {
  type: TaskType;
  children: ReactNode;
}) {
  const [mutation, update] = useOptimistic<TaskMutation | null>(null);
  return (
    <TaskMutationContext.Provider value={{ type, mutation, update }}>
      {children}
    </TaskMutationContext.Provider>
  );
}

export function useTaskMutationFeedback() {
  const context = useContext(TaskMutationContext);
  return {
    mutation: context?.mutation ?? null,
    optimistic(operation: TaskOperation) {
      if (!context) return undefined;
      return {
        apply: () => context.update({ operation, phase: "submitting" }),
        commit: () => context.update({ operation, phase: "accepted" }),
        rollback: () => context.update(null),
      };
    },
  };
}

export function TaskMutationBadge({
  children,
  ...props
}: ComponentProps<typeof Badge>) {
  const context = useContext(TaskMutationContext);
  const feedback = context?.mutation
    ? describeTaskMutation(context.type, context.mutation)
    : null;
  return (
    <Badge
      {...props}
      variant={feedback ? "secondary" : props.variant}
      role="status"
      aria-label="任务状态"
    >
      {context?.mutation?.phase === "submitting" ? (
        <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden="true" />
      ) : null}
      {feedback?.label ?? children}
    </Badge>
  );
}

export function TaskMutationText({
  children,
  mode = "status",
}: {
  children: ReactNode;
  mode?: "status" | "message";
}) {
  const context = useContext(TaskMutationContext);
  if (!context?.mutation) return <>{children}</>;
  const feedback = describeTaskMutation(context.type, context.mutation);
  return <>{mode === "status" ? feedback.label : feedback.message}</>;
}

export function TaskMutationMessage({
  children,
  as: Tag = "p",
  className,
}: {
  children: ReactNode;
  as?: "p" | "span";
  className?: string;
}) {
  const context = useContext(TaskMutationContext);
  if (!context?.mutation) return <>{children}</>;
  return (
    <Tag
      className={cn(
        "block break-words text-sm leading-6 text-muted-foreground",
        className,
      )}
    >
      {describeTaskMutation(context.type, context.mutation).message}
    </Tag>
  );
}

export function TaskMutationIdle({ children }: { children: ReactNode }) {
  const context = useContext(TaskMutationContext);
  return context?.mutation ? null : <>{children}</>;
}
