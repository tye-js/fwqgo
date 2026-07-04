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

import { getAiRewriteTaskDetail } from "@/features/cms/actions/ai-rewrite-task";
import { AiRewriteTaskRetryButton } from "@/features/cms/components/ai-rewrite-task-retry-button";
import { AiRewriteTaskResolveButton } from "@/features/cms/components/ai-rewrite-task-resolve-button";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type ScrapeDiagnostics } from "@fwqgo/scrape/article-scraper";
import { isHttpHref } from "@fwqgo/core/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

type AiRewriteTaskDetailPageContentProps = PageProps & {
  basePath?: string;
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
  attempt?: number;
  time?: Date | string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function arrayValue<T>(
  value: unknown,
  normalizeItem: (item: unknown) => T,
): T[] {
  return Array.isArray(value) ? value.map(normalizeItem) : [];
}

function normalizeAffiliateReport(
  value: unknown,
): ScrapeDiagnostics["affiliateReport"] {
  const report = isRecord(value) ? value : {};
  const normalizeMatch = (
    item: unknown,
  ): ScrapeDiagnostics["affiliateReport"]["matchedLinks"][number] => {
    const match = isRecord(item) ? item : {};
    return {
      originalHref: stringValue(match.originalHref),
      resolvedHref: stringValue(match.resolvedHref),
      finalHref: stringValue(match.finalHref),
      matchedDomain: stringValue(match.matchedDomain),
      providerName: stringValue(match.providerName, "未知商家"),
      mode: match.mode === "replace" ? "replace" : "param",
    };
  };
  const normalizeMiss = (
    item: unknown,
  ): ScrapeDiagnostics["affiliateReport"]["unmatchedLinks"][number] => {
    const miss = isRecord(item) ? item : {};
    const reason = stringValue(miss.reason);
    return {
      href: stringValue(miss.href),
      host: typeof miss.host === "string" ? miss.host : null,
      reason:
        reason === "invalid-url" ||
        reason === "internal" ||
        reason === "no-provider"
          ? reason
          : "no-provider",
    };
  };

  return {
    totalLinks: numberValue(report.totalLinks),
    internalLinksRemoved: numberValue(report.internalLinksRemoved),
    matchedLinks: arrayValue(report.matchedLinks, normalizeMatch),
    unmatchedLinks: arrayValue(report.unmatchedLinks, normalizeMiss),
    invalidLinks: arrayValue(report.invalidLinks, normalizeMiss),
  };
}

function parseDiagnostics(value: string | null) {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) {
      return null;
    }

    return {
      sourceHost: stringValue(parsed.sourceHost),
      strategy: stringValue(parsed.strategy, "未知"),
      usedPuppeteer: booleanValue(parsed.usedPuppeteer),
      usedFallback: booleanValue(parsed.usedFallback),
      usedAiRewrite: booleanValue(parsed.usedAiRewrite),
      contentLength: numberValue(parsed.contentLength),
      scrapedTitle:
        typeof parsed.scrapedTitle === "string"
          ? parsed.scrapedTitle
          : undefined,
      scrapedDescription:
        typeof parsed.scrapedDescription === "string"
          ? parsed.scrapedDescription
          : undefined,
      cleanedHtmlLength:
        typeof parsed.cleanedHtmlLength === "number"
          ? parsed.cleanedHtmlLength
          : undefined,
      aiInputLength:
        typeof parsed.aiInputLength === "number"
          ? parsed.aiInputLength
          : undefined,
      rewriteOutputLength:
        typeof parsed.rewriteOutputLength === "number"
          ? parsed.rewriteOutputLength
          : undefined,
      aiInputTruncated: booleanValue(parsed.aiInputTruncated),
      removedSelectors: arrayValue(parsed.removedSelectors, (item) =>
        stringValue(item),
      ).filter(Boolean),
      affiliateReport: normalizeAffiliateReport(parsed.affiliateReport),
      warnings: arrayValue(parsed.warnings, (item) => stringValue(item)).filter(
        Boolean,
      ),
      aiRewriteError:
        typeof parsed.aiRewriteError === "string"
          ? parsed.aiRewriteError
          : undefined,
    } satisfies ScrapeDiagnostics;
  } catch {
    return null;
  }
}

function formatTime(value: Date | string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
    english: "英文 SEO 生成",
  };

  return labels[value] ?? value;
}

function buildTaskSteps({
  status,
  sourceType,
  currentStep,
  postId,
  scrapedHtml,
  diagnostics,
}: {
  status: string;
  sourceType: string;
  currentStep: string | null;
  postId: number | null;
  scrapedHtml: string | null;
  diagnostics: ScrapeDiagnostics | null;
}): TaskStep[] {
  const isEnglishTask = sourceType === "english";
  const hasDiagnostics = Boolean(diagnostics);
  const hasCleanHtml = Boolean(scrapedHtml);
  const report = diagnostics?.affiliateReport;
  const hasUnmatchedLinks = (report?.unmatchedLinks.length ?? 0) > 0;
  const isFailed = status === "failed";
  const isRunning = status === "running";

  return [
    {
      name: isEnglishTask ? "读取中文草稿" : "抓取素材",
      status: hasDiagnostics
        ? "success"
        : isFailed
          ? "failed"
          : isRunning
            ? "running"
            : "pending",
      description: hasDiagnostics
        ? `使用 ${diagnostics?.strategy ?? "未知"} 策略，正文 ${diagnostics?.contentLength ?? 0} 字`
        : isEnglishTask
          ? (currentStep ?? "等待读取改写后的中文正文")
          : (currentStep ?? "等待抓取来源内容"),
    },
    {
      name: isEnglishTask ? "准备翻译输入" : "清洗正文",
      status: hasCleanHtml
        ? "success"
        : isFailed
          ? "failed"
          : hasDiagnostics
            ? "running"
            : "pending",
      description: hasCleanHtml
        ? isEnglishTask
          ? `中文改写正文 ${scrapedHtml?.length ?? 0} 字符，等待翻译为英文正文`
          : `清洗后正文 ${diagnostics?.cleanedHtmlLength ?? scrapedHtml?.length ?? 0} 字符，AI Markdown 输入 ${diagnostics?.aiInputLength ?? "-"} 字符`
        : isEnglishTask
          ? "等待中文改写正文快照"
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
        : isEnglishTask
          ? "英文任务复用中文草稿中的链接，不重复做采集诊断"
          : "暂无返利链接诊断",
    },
    {
      name: isEnglishTask ? "翻译英文正文" : "AI 改写文章",
      status: diagnostics?.usedAiRewrite
        ? "success"
        : diagnostics?.aiRewriteError
          ? "failed"
          : hasDiagnostics
            ? "skipped"
            : "pending",
      description: diagnostics?.usedAiRewrite
        ? `输入 ${diagnostics.aiInputLength ?? "-"} 字符，输出 ${diagnostics.rewriteOutputLength ?? "-"} 字符`
        : isEnglishTask
          ? "等待从中文改写正文翻译英文正文，SEO 字段会单独生成"
          : (diagnostics?.aiRewriteError ?? "等待 AI 改写"),
    },
    {
      name: "保存草稿",
      status: postId
        ? "success"
        : isFailed
          ? "failed"
          : isRunning
            ? "running"
            : "pending",
      description: postId
        ? `已生成草稿文章 #${postId}`
        : (currentStep ?? "成功后才会写入草稿"),
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

type DbTaskStep = NonNullable<
  Awaited<ReturnType<typeof getAiRewriteTaskDetail>>
>["steps"][number];

function normalizeStepStatus(value: string): StepStatus {
  if (value in stepStatusLabels) {
    return value as StepStatus;
  }

  return "pending";
}

function buildStoredTaskSteps(steps: DbTaskStep[]): TaskStep[] {
  if (steps.length === 0) {
    return [];
  }

  const latestAttempt = steps.reduce(
    (maxAttempt, step) => Math.max(maxAttempt, step.attempt),
    0,
  );

  return steps
    .filter((step) => step.attempt === latestAttempt)
    .map((step) => ({
      name: step.stepName,
      status: normalizeStepStatus(step.status),
      description: step.error ?? step.message ?? "等待处理",
      attempt: step.attempt,
      time: step.finishedAt ?? step.updatedAt ?? step.createdAt,
    }));
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
              {step.attempt ? (
                <Badge variant="outline">第 {step.attempt} 次</Badge>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {step.description}
            </p>
            {step.time ? (
              <p className="text-xs text-muted-foreground">
                {formatTime(step.time)}
              </p>
            ) : null}
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
    ...new Set(
      report?.unmatchedLinks.map((item) => item.host).filter(Boolean) ?? [],
    ),
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
              <Link href="/collect/aff-man">
                <RotateCcw className="size-4" />
                去补返利规则
              </Link>
            </Button>
          ) : null}
          {postSlug ? (
            <Button asChild size="sm">
              <Link href={`/posts/edit/post/${postSlug}`}>打开草稿审核</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </AdminSectionCard>
  );
}

export async function AiRewriteTaskDetailPageContent({
  params,
  basePath = "/ai-rewrite/tasks",
}: AiRewriteTaskDetailPageContentProps) {
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
  const storedSteps = buildStoredTaskSteps(task.steps);
  const steps =
    storedSteps.length > 0
      ? storedSteps
      : buildTaskSteps({
          status: task.status,
          sourceType: task.sourceType,
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
            <Link href={basePath}>
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
              <Link href={`/posts/edit/post/${task.postSlug}`}>编辑草稿</Link>
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

      <AdminSectionCard
        title="进度"
        description={task.currentStep ?? "等待处理"}
      >
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
        description={
          storedSteps.length > 0
            ? "展示当前重试轮次的真实步骤记录，失败点会明确标记。"
            : "历史任务没有步骤记录，按当前任务数据推导每一步状态。"
        }
      >
        <TaskStepTimeline steps={steps} />
      </AdminSectionCard>

      <ManualReviewHints diagnostics={diagnostics} postSlug={task.postSlug} />

      <AdminSectionCard
        title="来源与结果"
        description="素材来源、分类、风格和草稿入口。"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              来源 / {sourceTypeLabel(task.sourceType)}
            </p>
            {task.sourceType === "url" && isHttpHref(task.sourceUrl) ? (
              <a
                href={task.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
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
        {task.sourceType !== "url" &&
        task.sourceType !== "english" &&
        task.sourceContent ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">原始素材预览</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-6">
              {task.sourceContent.slice(0, 5000)}
            </pre>
          </div>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard
        title="采集质量"
        description="用于判断来源站规则和清洗结果是否稳定。"
      >
        {diagnostics ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <Stat label="策略" value={diagnostics.strategy} />
              <Stat label="正文长度" value={diagnostics.contentLength} />
              <Stat
                label="清洗正文"
                value={diagnostics.cleanedHtmlLength ?? "-"}
              />
              <Stat
                label="AI Markdown 输入"
                value={diagnostics.aiInputLength ?? "-"}
              />
              <Stat
                label="AI 截断"
                value={diagnostics.aiInputTruncated ? "是" : "否"}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {diagnostics.usedFallback ? (
                <Badge variant="outline">通用 fallback</Badge>
              ) : null}
              {diagnostics.usedPuppeteer ? (
                <Badge variant="outline">Puppeteer</Badge>
              ) : null}
              {diagnostics.usedAiRewrite ? (
                <Badge variant="secondary">AI 已改写</Badge>
              ) : (
                <Badge variant="destructive">AI 回退</Badge>
              )}
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

      <AdminSectionCard
        title="返利链接命中"
        description="确认原站链接是否成功替换为你的推广链接。"
      >
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
                  <div
                    key={`${item.finalHref}-${index}`}
                    className="rounded-md border border-border/70 p-3 text-xs"
                  >
                    <p className="font-medium">
                      {item.providerName} / {item.matchedDomain}
                    </p>
                    <p className="mt-1 break-all text-muted-foreground">
                      原链接：{item.resolvedHref}
                    </p>
                    <p className="mt-1 break-all text-muted-foreground">
                      返利：{item.finalHref}
                    </p>
                  </div>
                ))}
                {report.matchedLinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无命中</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">未命中域名</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ...new Set(
                      report.unmatchedLinks
                        .map((item) => item.host)
                        .filter(Boolean),
                    ),
                  ].map((host) => (
                    <Badge key={host} variant="outline">
                      {host}
                    </Badge>
                  ))}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/collect/aff-man">
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

      <AdminSectionCard
        title={task.sourceType === "english" ? "中文改写正文预览" : "正文预览"}
        description={
          task.sourceType === "english"
            ? "英文正文会从这份已改写的中文正文翻译生成；标题、slug、摘要和关键词会在后续 SEO 步骤单独生成。"
            : "清洗后的原始正文片段，便于排查抓取和清洗结果。"
        }
      >
        <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-4 font-mono text-xs leading-6">
          {task.scrapedHtml ?? task.sourceContent ?? "暂无正文快照"}
        </pre>
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default async function AiRewriteTaskDetailPage({ params }: PageProps) {
  return <AiRewriteTaskDetailPageContent params={params} />;
}
