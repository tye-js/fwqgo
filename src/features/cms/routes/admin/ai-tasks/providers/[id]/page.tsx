import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { parsePositiveInt } from "@fwqgo/core/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getProviderRunDetail } from "@/features/cms/data/operations";

type PageProps = {
  params: Promise<{ id: string }>;
};

const statusLabels: Record<string, string> = {
  running: "采集中",
  succeeded: "已完成",
  failed: "失败",
};

const purposeLabels: Record<string, string> = {
  catalog: "常规目录",
  promotion: "促销套餐",
  stock: "库存补充",
};

export default async function ProviderRunDetailPage({ params }: PageProps) {
  const { id } = await params;
  const runId = parsePositiveInt(id);
  if (runId === null) notFound();

  const run = await getProviderRunDetail(runId);
  if (!run) notFound();

  return (
    <AdminPageShell
      badge="供应商采集任务"
      title={run.title}
      description="查看供应商请求、解析质量、幂等同步、待审核数量、缺失判定和可读失败原因。"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/ai-tasks">
              <ArrowLeft className="size-4" />
              返回任务中心
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/servers/monitor">管理采集源</Link>
          </Button>
          <UnifiedTaskActionButtons
            type="offer"
            taskId={run.id}
            status={run.status}
            canRetry={run.canRetry}
            canCancel={false}
            size="default"
          />
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <UnifiedTaskStat
          label="状态"
          value={statusLabels[run.status] ?? run.status}
        />
        <UnifiedTaskStat label="适配器" value={run.adapter.toUpperCase()} />
        <UnifiedTaskStat
          label="采集目的"
          value={purposeLabels[run.purpose] ?? run.purpose}
        />
        <UnifiedTaskStat label="HTTP" value={run.httpStatus ?? "-"} />
        <UnifiedTaskStat label="接收套餐" value={run.received} />
        <UnifiedTaskStat
          label="完成时间"
          value={formatUnifiedTaskTime(run.finishedAt)}
        />
      </div>

      <AdminSectionCard
        title="采集结果"
        description="新增套餐在关闭自动发布时进入待审核；缺失只在完整成功的采集后累计。"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={run.status === "failed" ? "destructive" : "outline"}
            >
              {statusLabels[run.status] ?? run.status}
            </Badge>
            <Badge variant="outline">
              {run.autoPublish ? "新套餐自动发布" : "新套餐先审核"}
            </Badge>
            <Badge variant="outline">
              连续缺失 {run.missingThreshold} 次后停售
            </Badge>
          </div>
          <a
            href={run.endpointUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-primary underline-offset-4 hover:underline"
          >
            {run.endpointUrl}
            <ExternalLink className="size-3 shrink-0" />
          </a>
          {run.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
              {run.error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <UnifiedTaskStat label="接收" value={run.received} />
            <UnifiedTaskStat label="新增" value={run.created} />
            <UnifiedTaskStat label="待审核" value={run.pending} />
            <UnifiedTaskStat label="更新" value={run.updated} />
            <UnifiedTaskStat label="未变化" value={run.unchanged} />
            <UnifiedTaskStat label="跳过" value={run.skipped} />
            <UnifiedTaskStat label="缺失" value={run.missing} />
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="步骤日志"
        description="运行记录按供应商请求、解析同步和审核判定生成统一时间线。"
      >
        <UnifiedTaskStepTimeline steps={run.steps} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
