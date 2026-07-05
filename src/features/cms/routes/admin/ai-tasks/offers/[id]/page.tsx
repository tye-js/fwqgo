import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, DatabaseZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { UnifiedTaskActionButtons } from "@/features/cms/components/unified-task-action-buttons";
import {
  UnifiedTaskStat,
  UnifiedTaskStepTimeline,
  formatUnifiedTaskTime,
} from "@/features/cms/components/unified-task-detail";
import { getOfferTaskDetail } from "@/features/cms/data/operations";

type PageProps = {
  params: Promise<{ id: string }>;
};

const statusLabels: Record<string, string> = {
  pending: "排队中",
  running: "提取中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export default async function OfferTaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const taskId = Number(id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    notFound();
  }

  const task = await getOfferTaskDetail(taskId);
  if (!task) {
    notFound();
  }

  return (
    <AdminPageShell
      badge="套餐提取任务"
      title={task.title}
      description="查看文章套餐提取、写入统计、失败原因和可恢复操作。"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/ai-tasks">
              <ArrowLeft className="size-4" />
              返回任务中心
            </Link>
          </Button>
          <UnifiedTaskActionButtons
            type="offer"
            taskId={task.id}
            status={task.status}
            canRetry={task.canRetry}
            canCancel={task.canCancel}
            size="default"
          />
          {task.post ? (
            <Button asChild>
              <Link href={`/posts/edit/post/${task.post.slug}`}>编辑文章</Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-5">
        <UnifiedTaskStat
          label="状态"
          value={statusLabels[task.status] ?? task.status}
        />
        <UnifiedTaskStat
          label="模式"
          value={task.mode === "bulk" ? "历史文章批量" : "单篇文章"}
        />
        <UnifiedTaskStat label="进度" value={`${task.progress}%`} />
        <UnifiedTaskStat label="文章 ID" value={task.postId ?? "-"} />
        <UnifiedTaskStat
          label="更新时间"
          value={formatUnifiedTaskTime(task.updatedAt ?? task.createdAt)}
        />
      </div>

      <AdminSectionCard
        title="提取结果"
        description="确认文章扫描、套餐解析和写入数量。"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{statusLabels[task.status] ?? task.status}</Badge>
            <Badge variant="outline">
              {task.mode === "bulk" ? "批量提取" : "单篇提取"}
            </Badge>
            {task.post ? (
              <Badge variant="outline">
                {task.post.language === "en" ? "英文文章" : "中文文章"}
              </Badge>
            ) : null}
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            {task.description}
          </p>

          {task.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
              {task.error}
            </p>
          ) : null}

          {task.result ? (
            <div className="grid gap-3 md:grid-cols-5">
              <UnifiedTaskStat
                label="扫描文章"
                value={task.result.scannedPosts}
              />
              <UnifiedTaskStat label="提取套餐" value={task.result.extracted} />
              <UnifiedTaskStat label="新增" value={task.result.inserted} />
              <UnifiedTaskStat label="更新" value={task.result.updated} />
              <UnifiedTaskStat label="跳过" value={task.result.skipped} />
            </div>
          ) : (
            <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
              <DatabaseZap className="mr-2 size-4" />
              暂无写入统计
            </div>
          )}
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="步骤日志"
        description="套餐提取任务没有单独步骤表，这里按任务状态、消息和结果字段生成可读时间线。"
      >
        <UnifiedTaskStepTimeline steps={task.steps} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
