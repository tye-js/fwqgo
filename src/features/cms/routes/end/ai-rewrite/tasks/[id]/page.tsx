import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { getAiRewriteTaskDetail } from "@/app/_actions/ai-rewrite-task";
import { AiRewriteTaskRetryButton } from "@/app/_components/ai-rewrite-task-retry-button";
import { AiRewriteTaskResolveButton } from "@/app/_components/ai-rewrite-task-resolve-button";
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
  manual_required: "需人工处理",
  failed: "失败",
};

const stepStatusLabels = {
  pending: "等待中",
  running: "处理中",
  success: "成功",
  failed: "失败",
  skipped: "跳过",
  manual_required: "需人工处理",
} as const;

const stepStatusVariants: Record<
  keyof typeof stepStatusLabels,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  running: "secondary",
  success: "default",
  failed: "destructive",
  skipped: "outline",
  manual_required: "secondary",
};

type StepStatus = keyof typeof stepStatusLabels;

type TaskStep = {
  name: string;
  status: StepStatus;
  description: string;
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

function sourceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    url: "网址",
    text: "手动文本",
    email: "邮件素材",
    file: "文件导入",
  };

  return labels[value] ?? value;
}

function buildTaskSteps({
  status,
  currentStep,
  postId,
  scrapedHtml,
  diagnostics,
}: {
  status: string;
  currentStep: string | null;
  postId: number | null;
  scrapedHtml: string | null;
  diagnostics: ScrapeDiagnostics | null;
}): TaskStep[] {
  const hasDiagnostics = Boolean(diagnostics);
  const hasCleanHtml = Boolean(scrapedHtml);
  const report = diagnostics?.affiliateReport;
  const hasUnmatchedLinks = (report?.unmatchedLinks.length ?? 0) > 0;
  const isFailed = status === "failed";
  const isRunning = status === "running";

  return [
    {
      name: "抓取素材",
      status: hasDiagnostics ? "success" : isFailed ? "failed" : isRunning ? "running" : "pending",
      description: hasDiagnostics
        ? `使用 ${diagnostics?.strategy ?? "未知"} 策略，正文 ${diagnostics?.contentLength ?? 0} 字`
        : currentStep ?? "等待抓取来源内容",
    },
    {
      name: "清洗正文",
      status: hasCleanHtml ? "success" : isFailed ? "failed" : hasDiagnostics ? "running" : "pending",
      description: hasCleanHtml
        ? `清洗后 HTML ${diagnostics?.cleanedHtmlLength ?? scrapedHtml?.length ?? 0} 字符`
        : "等待正文清洗结果",
    },
    {
      name: "识别商户与返利链接",
      status: report
        ? hasUnmatchedLinks
          ? "manual_required"
          : "success"
        : hasDiagnostics
          ? "skipped"
          : "pending",
      description: report
        ? `命中 ${report.matchedLinks.length} 条，未命中 ${report.unmatchedLinks.length} 条，移除站内 ${report.internalLinksRemoved} 条`
        : "暂无返利链接诊断",
    },
    {
      name: "AI 改写文章",
      status: diagnostics?.usedAiRewrite
        ? "success"
        : diagnostics?.aiRewriteError
          ? "failed"
          : hasDiagnostics
            ? "skipped"
            : "pending",
      description: diagnostics?.usedAiRewrite
        ? `输入 ${diagnostics.aiInputLength ?? "-"} 字符，输出 ${diagnostics.rewriteOutputLength ?? "-"} 字符`
        : diagnostics?.aiRewriteError ?? "等待 AI 改写",
    },
    {
      name: "保存草稿",
      status: postId ? "success" : isFailed ? "failed" : isRunning ? "running" : "pending",
      description: postId ? `已生成草稿文章 #${postId}` : currentStep ?? "成功后才会写入草稿",
    },
    {
      name: "等待人工审核",
      status: postId
        ? hasUnmatchedLinks
          ? "manual_required"
          : "success"
        : "pending",
      description: hasUnmatchedLinks
        ? "存在未命中外链，发布前建议补充返利规则或人工确认"
        : postId
          ? "可以进入文章编辑页继续校对并发布"
          : "草稿生成后进入人工审核",
    },
  ];
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "success") {
    return <CheckCircle2 className="size-4 text-primary" />;
  }

  if (status === "failed") {
    return <XCircle className="size-4 text-destructive" />;
  }

  if (status === "manual_required") {
    return <AlertCircle className="size-4 text-amber-600" />;
  }

  return <CircleDashed className="size-4 text-muted-foreground" />;
}

function TaskStepTimeline({ steps }: { steps: TaskStep[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {steps.map((step) => (
        <div
          key={step.name}
          className="flex gap-3 rounded-md border border-border/70 bg-background p-3"
        >
          <div className="mt-0.5">
            <StepIcon status={step.status} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{step.name}</p>
              <Badge variant={stepStatusVariants[step.status]}>
                {stepStatusLabels[step.status]}
              </Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {step.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ManualReviewHints({
  diagnostics,
  postSlug,
}: {
  diagnostics: ScrapeDiagnostics | null;
  postSlug: string | null;
}) {
  const report = diagnostics?.affiliateReport;
  const unmatchedHosts = [
    ...new Set(report?.unmatchedLinks.map((item) => item.host).filter(Boolean) ?? []),
  ];
  const warnings = diagnostics?.warnings ?? [];

  if (unmatchedHosts.length === 0 && warnings.length === 0 && !postSlug) {
    return null;
  }

  return (
    <AdminSectionCard
      title="人工处理建议"
      description="把需要运营介入的事项集中显示，减少发布前漏检。"
    >
      <div className="space-y-3">
        {unmatchedHosts.length > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-sm font-medium text-amber-700">
              发现未配置返利规则的外链域名
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unmatchedHosts.slice(0, 16).map((host) => (
                <Badge key={host} variant="outline">
                  {host}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">采集/改写警告</p>
            <div className="mt-2 space-y-1 text-sm leading-6 text-muted-foreground">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {unmatchedHosts.length > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/end/collect/aff-man">
                <RotateCcw className="size-4" />
                去补返利规则
              </Link>
            </Button>
          ) : null}
          {postSlug ? (
            <Button asChild size="sm">
              <Link href={`/end/posts/edit/post/${postSlug}`}>打开草稿审核</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </AdminSectionCard>
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
  const steps = buildTaskSteps({
    status: task.status,
    currentStep: task.currentStep,
    postId: task.postId,
    scrapedHtml: task.scrapedHtml,
    diagnostics,
  });

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
          {task.status === "failed" ? (
            <AiRewriteTaskRetryButton taskId={task.id} />
          ) : null}
          {task.status === "manual_required" ? (
            <AiRewriteTaskResolveButton taskId={task.id} />
          ) : null}
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

      <AdminSectionCard
        title="处理步骤"
        description="根据当前任务数据推导每一步状态，失败或未命中外链会明确标记。"
      >
        <TaskStepTimeline steps={steps} />
      </AdminSectionCard>

      <ManualReviewHints diagnostics={diagnostics} postSlug={task.postSlug} />

      <AdminSectionCard title="来源与结果" description="素材来源、分类、风格和草稿入口。">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              来源 / {sourceTypeLabel(task.sourceType)}
            </p>
            {task.sourceType === "url" ? (
              <a
                href={task.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all font-medium hover:underline"
              >
                {task.sourceUrl}
                <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <p className="font-medium">
                {task.sourceTitle ?? task.sourceFileName ?? task.sourceUrl}
              </p>
            )}
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
        {task.sourceType !== "url" && task.sourceContent ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">原始素材预览</p>
            <pre className="max-h-56 overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-6 whitespace-pre-wrap break-words">
              {task.sourceContent.slice(0, 5000)}
            </pre>
          </div>
        ) : null}
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
