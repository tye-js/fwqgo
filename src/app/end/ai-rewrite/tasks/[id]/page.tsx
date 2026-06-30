import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, ExternalLink, RotateCcw } from "lucide-react";

import { getAiRewriteTaskDetail } from "@/app/_actions/ai-rewrite-task";
import { AdminPageShell, AdminSectionCard } from "@/app/_components/admin-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type ScrapeDiagnostics } from "@/server/scrape/article-scraper";

type PageProps = {
  params: Promise<{ id: string }>;
};

const statusLabels: Record<string, string> = {
  pending: "等待中",
  running: "处理中",
  succeeded: "已完成",
  failed: "失败",
};

function parseDiagnostics(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as ScrapeDiagnostics;
  } catch {
    return null;
  }
}

function formatTime(value: Date | string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default async function AiRewriteTaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const taskId = Number(id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    notFound();
  }

  const task = await getAiRewriteTaskDetail(taskId);
  if (!task) {
    notFound();
  }

  const diagnostics = parseDiagnostics(task.diagnostics);
  const report = diagnostics?.affiliateReport;

  return (
    <AdminPageShell
      badge="任务详情"
      title={task.resultTitle ?? task.scrapedTitle ?? `任务 #${task.id}`}
      description="查看抓取、清洗、AI 改写、返利链接命中和失败诊断。"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/end/ai-rewrite/tasks">
              <ArrowLeft className="size-4" />
              返回
            </Link>
          </Button>
          {task.postSlug ? (
            <Button asChild>
              <Link href={`/end/posts/edit/post/${task.postSlug}`}>
                编辑草稿
              </Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="状态" value={statusLabels[task.status] ?? task.status} />
        <Stat label="尝试次数" value={task.attempts} />
        <Stat label="AI 输入长度" value={task.aiInputLength ?? "-"} />
        <Stat label="改写输出长度" value={task.rewriteOutputLength ?? "-"} />
      </div>

      <AdminSectionCard title="进度" description={task.currentStep ?? "等待处理"}>
        <div className="space-y-3">
          <Progress value={task.progress} />
          <div className="flex flex-wrap gap-2">
            <Badge>{statusLabels[task.status] ?? task.status}</Badge>
            <Badge variant="outline">创建 {formatTime(task.createdAt)}</Badge>
            <Badge variant="outline">开始 {formatTime(task.startedAt)}</Badge>
            <Badge variant="outline">结束 {formatTime(task.finishedAt)}</Badge>
          </div>
          {task.error ? (
            <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {task.error}
            </p>
          ) : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="来源与结果" description="原始链接、分类、风格和草稿入口。">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">来源 URL</p>
            <a
              href={task.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 break-all font-medium hover:underline"
            >
              {task.sourceUrl}
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">分类</p>
              <p className="font-medium">{task.categoryName ?? "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">改写风格</p>
              <p className="font-medium">{task.rewriteStyleName ?? "默认"}</p>
            </div>
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="采集质量" description="用于判断来源站规则和清洗结果是否稳定。">
        {diagnostics ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="策略" value={diagnostics.strategy} />
              <Stat label="正文长度" value={diagnostics.contentLength} />
              <Stat label="清洗 HTML" value={diagnostics.cleanedHtmlLength ?? "-"} />
              <Stat
                label="AI 截断"
                value={diagnostics.aiInputTruncated ? "是" : "否"}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {diagnostics.usedFallback ? <Badge variant="outline">通用 fallback</Badge> : null}
              {diagnostics.usedPuppeteer ? <Badge variant="outline">Puppeteer</Badge> : null}
              {diagnostics.usedAiRewrite ? <Badge variant="secondary">AI 已改写</Badge> : <Badge variant="destructive">AI 回退</Badge>}
            </div>
            {diagnostics.removedSelectors.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">清理模块</p>
                <div className="flex flex-wrap gap-2">
                  {diagnostics.removedSelectors.map((selector) => (
                    <Badge key={selector} variant="outline">
                      {selector}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {diagnostics.warnings.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">警告</p>
                {diagnostics.warnings.map((warning) => (
                  <p key={warning} className="text-sm text-amber-600">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无诊断数据</p>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="返利链接命中" description="确认原站链接是否成功替换为你的推广链接。">
        {report ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="链接总数" value={report.totalLinks} />
              <Stat label="命中返利" value={report.matchedLinks.length} />
              <Stat label="未命中" value={report.unmatchedLinks.length} />
              <Stat label="站内移除" value={report.internalLinksRemoved} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">命中记录</p>
                {report.matchedLinks.slice(0, 10).map((item, index) => (
                  <div key={`${item.finalHref}-${index}`} className="rounded-md border border-border/70 p-3 text-xs">
                    <p className="font-medium">{item.providerName} / {item.matchedDomain}</p>
                    <p className="mt-1 break-all text-muted-foreground">原链接：{item.resolvedHref}</p>
                    <p className="mt-1 break-all text-muted-foreground">返利：{item.finalHref}</p>
                  </div>
                ))}
                {report.matchedLinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无命中</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">未命中域名</p>
                <div className="flex flex-wrap gap-2">
                  {[...new Set(report.unmatchedLinks.map((item) => item.host).filter(Boolean))].map((host) => (
                    <Badge key={host} variant="outline">
                      {host}
                    </Badge>
                  ))}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/end/collect/aff-man">
                    <RotateCcw className="size-4" />
                    去补返利规则
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无返利诊断</p>
        )}
      </AdminSectionCard>

      <AdminSectionCard title="正文预览" description="保存的清洗/改写 HTML 片段，便于排查结构是否失真。">
        <pre className="max-h-[500px] overflow-auto rounded-md bg-muted/40 p-4 text-xs leading-6 font-mono whitespace-pre-wrap break-words">
          {task.scrapedHtml ?? "暂无正文快照"}
        </pre>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
