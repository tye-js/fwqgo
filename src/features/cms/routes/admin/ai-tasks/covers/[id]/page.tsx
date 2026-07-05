import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageIcon } from "lucide-react";

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
import { getCoverTaskDetail } from "@/features/cms/data/operations";
import {
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";

type PageProps = {
  params: Promise<{ id: string }>;
};

const statusLabels: Record<string, string> = {
  pending: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function CoverPreview({ src, title }: { src: string | null; title: string }) {
  if (!isRenderableImageSrc(src)) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
        <ImageIcon className="mr-2 size-4" />
        暂无可预览封面
      </div>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-md border border-border/70 bg-muted">
      <Image
        src={getOptimizedImageSrc(src)}
        alt={title}
        fill
        sizes="(min-width: 1024px) 520px, 100vw"
        className="object-cover"
      />
    </div>
  );
}

export default async function CoverTaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const taskId = Number(id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    notFound();
  }

  const task = await getCoverTaskDetail(taskId);
  if (!task) {
    notFound();
  }

  return (
    <AdminPageShell
      badge="封面生图任务"
      title={task.title}
      description="查看封面生成、写回文章、失败原因和可恢复操作。"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/ai-tasks">
              <ArrowLeft className="size-4" />
              返回任务中心
            </Link>
          </Button>
          <UnifiedTaskActionButtons
            type="cover"
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
      <div className="grid gap-4 md:grid-cols-4">
        <UnifiedTaskStat
          label="状态"
          value={statusLabels[task.status] ?? task.status}
        />
        <UnifiedTaskStat label="批次" value={task.batchId} />
        <UnifiedTaskStat label="文章 ID" value={task.postId} />
        <UnifiedTaskStat
          label="更新时间"
          value={formatUnifiedTaskTime(task.updatedAt ?? task.createdAt)}
        />
      </div>

      <AdminSectionCard
        title="封面结果"
        description="确认生成图片、写回文章字段和图片资产是否一致。"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
          <CoverPreview
            src={task.outputUrl ?? task.asset?.path ?? null}
            title={task.title}
          />
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge>{statusLabels[task.status] ?? task.status}</Badge>
              {task.asset ? (
                <Badge variant="outline">资产 #{task.asset.id}</Badge>
              ) : null}
              {task.post ? (
                <Badge variant="outline">
                  {task.post.language === "en" ? "英文文章" : "中文文章"}
                </Badge>
              ) : null}
            </div>
            <p className="break-all text-muted-foreground">
              {task.description}
            </p>
            {task.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                {task.error}
              </p>
            ) : null}
            {task.outputUrl ? (
              <p className="break-all text-xs text-muted-foreground">
                输出地址：{task.outputUrl}
              </p>
            ) : null}
            {task.asset?.prompt ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  查看生图提示词
                </summary>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                  {task.asset.prompt}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="步骤日志"
        description="封面任务没有单独步骤表，这里按任务状态、时间和输出字段生成可读时间线。"
      >
        <UnifiedTaskStepTimeline steps={task.steps} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
