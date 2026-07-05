import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import type { CmsTaskOperationsSummary } from "@/features/cms/data/operations";

const sourceLabel: Record<string, string> = {
  ai: "AI改写",
  cover: "封面生图",
  offer: "套餐提取",
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "排队",
    running: "运行中",
    succeeded: "成功",
    failed: "失败",
    manual_required: "需人工处理",
  };

  return labels[status] ?? status;
}

function statusVariant(status: string) {
  if (status === "failed") return "destructive" as const;
  if (status === "succeeded") return "default" as const;
  if (status === "running" || status === "pending") return "secondary" as const;
  return "outline" as const;
}

function formatTime(value: string | null) {
  if (!value) return "未记录";

  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function QueueCard({
  title,
  summary,
}: {
  title: string;
  summary: CmsTaskOperationsSummary["queues"]["ai"];
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            总计 {summary.total.toLocaleString("zh-CN")} 个任务
          </p>
        </div>
        <Badge variant={summary.failed > 0 ? "destructive" : "outline"}>
          失败 {summary.failed}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-sm bg-muted/50 px-2 py-1.5">
          <p className="text-muted-foreground">处理中</p>
          <p className="mt-0.5 font-semibold tabular-nums">{summary.active}</p>
        </div>
        <div className="rounded-sm bg-muted/50 px-2 py-1.5">
          <p className="text-muted-foreground">成功</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {summary.succeeded}
          </p>
        </div>
        <div className="rounded-sm bg-muted/50 px-2 py-1.5">
          <p className="text-muted-foreground">人工</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {summary.manualRequired}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CmsTaskOperationsOverview({
  summary,
}: {
  summary: CmsTaskOperationsSummary;
}) {
  return (
    <AdminSectionCard
      title="任务队列健康"
      description="统一查看 AI 改写、封面生图、套餐提取和后台 worker 的状态；失败和长时间未更新的任务优先处理。"
    >
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <QueueCard title="AI 改写任务" summary={summary.queues.ai} />
          <QueueCard title="封面生图任务" summary={summary.queues.cover} />
          <QueueCard title="套餐提取任务" summary={summary.queues.offer} />
        </div>

        <div className="rounded-md border border-border/70 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">后台 worker 快照</p>
              <p className="mt-1 text-xs text-muted-foreground">
                记录当前 Node 进程内触发过的后台任务，重启后会重新累计。
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/ai-tasks">
                <RefreshCw className="size-4" />
                刷新
              </Link>
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.backgroundJobs.length > 0 ? (
              summary.backgroundJobs.map((job) => (
                <Badge
                  key={job.key}
                  variant={
                    job.lastError
                      ? "destructive"
                      : job.running
                        ? "default"
                        : "outline"
                  }
                  title={job.lastError ?? undefined}
                >
                  {job.label} · {job.running ? "运行中" : "空闲"} · 运行
                  {job.runCount} 次
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                当前进程暂未记录后台 worker 运行。
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">最近失败</p>
            {summary.recentFailures.length > 0 ? (
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>任务</TableHead>
                    <TableHead>原因</TableHead>
                    <TableHead className="w-[108px]">时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recentFailures.map((task) => (
                    <TableRow key={`${task.source}-${task.id}`}>
                      <TableCell>
                        <Link
                          href={task.href}
                          className="group flex min-h-11 items-start gap-2 rounded-sm px-1 py-1 hover:bg-muted/50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <Badge variant="destructive">
                                {sourceLabel[task.source]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                #{task.id}
                              </span>
                            </span>
                            <span className="mt-1 line-clamp-2 block text-sm">
                              {task.title}
                            </span>
                          </span>
                          <ExternalLink className="mt-1 size-4 shrink-0 opacity-60 group-hover:opacity-100" />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                          {task.message}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTime(task.updatedAt ?? task.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
                暂无失败任务。
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">疑似卡住</p>
            {summary.staleTasks.length > 0 ? (
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>任务</TableHead>
                    <TableHead className="w-[96px]">状态</TableHead>
                    <TableHead className="w-[108px]">未更新</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.staleTasks.map((task) => (
                    <TableRow key={`${task.source}-${task.id}`}>
                      <TableCell>
                        <Link
                          href={task.href}
                          className="line-clamp-2 min-h-11 rounded-sm px-1 py-1 text-sm hover:bg-muted/50"
                        >
                          {sourceLabel[task.source]} #{task.id} · {task.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(task.status)}>
                          {statusLabel(task.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {task.ageMinutes ?? "-"} 分钟
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
                暂无超过 15 分钟未更新的排队或运行任务。
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminSectionCard>
  );
}
