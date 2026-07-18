import Link from "next/link";
import {
  ChevronDown,
  ServerCog,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CmsTaskOperationsSummary } from "@/features/cms/data/operations";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "排队",
    pending: "排队",
    running: "运行中",
    succeeded: "成功",
    failed: "失败",
    manual_required: "需人工处理",
    cancelled: "已取消",
  };

  return labels[status] ?? status;
}

function statusVariant(status: string) {
  if (status === "failed") return "destructive" as const;
  if (status === "succeeded") return "default" as const;
  if (status === "running" || status === "pending" || status === "queued") {
    return "secondary" as const;
  }
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

function formatUptime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟`;
}

function RuntimeValue({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
}) {
  const display =
    typeof value === "boolean" ? (value ? "启用" : "关闭") : (value ?? "-");

  return (
    <div className="min-w-0 border-l-2 border-border px-2.5 py-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className="mt-1 truncate font-mono text-xs text-foreground"
        title={String(display)}
      >
        {display}
      </p>
    </div>
  );
}

function QueueSummaryLink({
  type,
  title,
  summary,
}: {
  type: "ai" | "cover" | "offer";
  title: string;
  summary: CmsTaskOperationsSummary["queues"]["ai"];
}) {
  return (
    <Link
      href={`/ai-tasks?type=${type}`}
      className="group min-w-0 px-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          共 {summary.total}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">
          处理中{" "}
          <strong className="font-semibold tabular-nums text-foreground">
            {summary.active}
          </strong>
        </span>
        <span
          className={
            summary.failed > 0 ? "text-destructive" : "text-muted-foreground"
          }
        >
          失败{" "}
          <strong className="font-semibold tabular-nums">
            {summary.failed}
          </strong>
        </span>
      </div>
    </Link>
  );
}

function SystemDiagnostics({ summary }: { summary: CmsTaskOperationsSummary }) {
  const registeredKeys = summary.backgroundWorker.registeredJobKeys;

  return (
    <details className="group overflow-hidden rounded-md border border-border/70 bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ServerCog className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">系统诊断</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          发布版本、进程、worker、心跳和重试队列
        </span>
        <Badge
          variant={
            summary.backgroundWorker.isLoopRunning ? "secondary" : "outline"
          }
        >
          {summary.backgroundWorker.isLoopRunning ? "轮询中" : "空闲"}
        </Badge>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>

      <div className="space-y-4 border-t border-border/70 p-3">
        <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <RuntimeValue label="Release" value={summary.runtime.releaseId} />
          <RuntimeValue
            label="Release 来源"
            value={summary.runtime.releaseSource}
          />
          <RuntimeValue
            label="进程"
            value={`${summary.runtime.hostname}:${summary.runtime.pid}`}
          />
          <RuntimeValue
            label="已运行"
            value={formatUptime(summary.runtime.uptimeSeconds)}
          />
          <RuntimeValue label="Node" value={summary.runtime.nodeVersion} />
          <RuntimeValue
            label="Basic Auth"
            value={summary.runtime.cmsBasicAuthEnabled}
          />
          <RuntimeValue
            label="Worker 并发"
            value={summary.backgroundWorker.concurrency}
          />
          <RuntimeValue
            label="心跳超时"
            value={`${Math.round(summary.backgroundWorker.heartbeatTimeoutMs / 1000)}秒`}
          />
          <RuntimeValue
            label="任务记录保留"
            value={`${summary.backgroundWorker.retentionDays}天`}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <RuntimeValue label="真实运行目录" value={summary.runtime.realCwd} />
          <div className="min-w-0 border-l-2 border-border px-2.5 py-1">
            <p className="text-xs text-muted-foreground">已注册 worker key</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {registeredKeys.length > 0 ? (
                registeredKeys.map((key) => (
                  <Badge
                    key={key}
                    variant="outline"
                    className="font-mono text-[11px]"
                  >
                    {key}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  暂无注册记录
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border/70">
          {summary.backgroundJobs.length > 0 ? (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>后台任务</TableHead>
                  <TableHead className="w-[92px]">状态</TableHead>
                  <TableHead className="w-[76px]">重试</TableHead>
                  <TableHead className="w-[116px]">下次运行</TableHead>
                  <TableHead className="w-[116px]">心跳</TableHead>
                  <TableHead>失败原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.backgroundJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <p className="max-w-[260px] truncate text-sm font-medium">
                        {job.label}
                      </p>
                      <p className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">
                        {job.key}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(job.status)}>
                        {statusLabel(job.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {job.attempts}/{job.maxAttempts}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(job.runAfter)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(job.heartbeatAt)}
                    </TableCell>
                    <TableCell>
                      <span
                        className="line-clamp-2 text-xs text-muted-foreground"
                        title={job.lastError ?? undefined}
                      >
                        {job.lastError ?? "无"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="p-3 text-xs text-muted-foreground">
              暂无后台队列记录。
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

export function CmsTaskOperationsOverview({
  summary,
}: {
  summary: CmsTaskOperationsSummary;
}) {
  return (
    <section aria-label="任务队列概览" className="space-y-3">
      <div className="grid divide-y divide-border/70 overflow-hidden rounded-md border border-border/70 bg-background sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <QueueSummaryLink
          type="ai"
          title="AI 改写"
          summary={summary.queues.ai}
        />
        <QueueSummaryLink
          type="cover"
          title="封面生图"
          summary={summary.queues.cover}
        />
        <QueueSummaryLink
          type="offer"
          title="供应商采集"
          summary={summary.queues.offer}
        />
      </div>

      <SystemDiagnostics summary={summary} />
    </section>
  );
}
