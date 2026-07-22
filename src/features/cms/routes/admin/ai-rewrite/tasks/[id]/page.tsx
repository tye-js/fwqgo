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
import { AffiliateRewriteAudit } from "@/features/cms/components/affiliate-rewrite-audit";
import { UnifiedTaskActionButtons } from "@/features/cms/components/unified-task-action-buttons";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type ScrapeDiagnostics } from "@/server/scrape/article-scraper";
import { isHttpHref, parsePostgresIntegerId } from "@fwqgo/core/utils";

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
  cancelled: "已取消",
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
  progress?: number;
  attempt?: number;
  time?: Date | string | null;
  payload?: string | null;
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
      affParam: stringValue(match.affParam),
      affValue: stringValue(match.affValue),
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

function formatMaybeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : "-";
}

function parsePayloadPreview(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function sourceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    url: "网址",
    text: "手动文本",
    email: "邮件素材",
    file: "文件导入",
    english: "英文 SEO 生成",
    seo: "文章 SEO 更新",
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
  const hasInvalidLinks = (report?.invalidLinks.length ?? 0) > 0;
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
        ? hasInvalidLinks
          ? "manual_required"
          : "success"
        : hasDiagnostics
          ? "skipped"
          : "pending",
      description: report
        ? `命中 ${report.matchedLinks.length} 条，未命中 ${report.unmatchedLinks.length} 条（保留原链），无效 ${report.invalidLinks.length} 条`
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
        ? hasInvalidLinks
          ? "manual_required"
          : "success"
        : "pending",
      description: hasInvalidLinks
        ? "存在无效链接，发布前需要修复或人工确认"
        : postId
          ? "可以进入文章编辑页继续校对并发布；未命中外链会保留原 URL"
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
      progress: step.progress,
      attempt: step.attempt,
      time: step.finishedAt ?? step.updatedAt ?? step.createdAt,
      payload: step.payload,
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
            {typeof step.progress === "number" ? (
              <p className="text-xs text-muted-foreground">
                进度 {step.progress}%
              </p>
            ) : null}
            {step.payload ? (
              <details className="pt-1">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  查看步骤 payload
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                  {parsePayloadPreview(step.payload)}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductionChain({
  task,
  diagnostics,
  report,
}: {
  task: NonNullable<Awaited<ReturnType<typeof getAiRewriteTaskDetail>>>;
  diagnostics: ScrapeDiagnostics | null;
  report: ScrapeDiagnostics["affiliateReport"] | undefined;
}) {
  const isEnglishTask = task.sourceType === "english";
  const hasSeo =
    Boolean(task.postTitle) ||
    Boolean(task.postDescription) ||
    Boolean(task.postKeywords);
  const items = [
    {
      title: "原文 / 素材",
      status: task.sourceContent || task.scrapedTitle ? "success" : "pending",
      detail:
        task.sourceTitle ??
        task.scrapedTitle ??
        (isHttpHref(task.sourceUrl) ? task.sourceUrl : "等待读取素材"),
    },
    {
      title: "清洗后正文",
      status: task.scrapedHtml ? "success" : "pending",
      detail: task.scrapedHtml
        ? `${task.scrapedHtml.length} 字符，AI 输入 ${formatMaybeNumber(task.aiInputLength)}`
        : "暂无正文快照",
    },
    {
      title: isEnglishTask ? "中文改写输入" : "改写中文",
      status: task.rewriteOutputLength ? "success" : "pending",
      detail: task.rewriteOutputLength
        ? `输出 ${task.rewriteOutputLength} 字符`
        : "等待模型输出",
    },
    {
      title: "翻译英文",
      status:
        task.sourceType === "english" && task.postId
          ? "success"
          : task.sourceType === "english"
            ? "running"
            : "pending",
      detail:
        task.sourceType === "english"
          ? task.postId
            ? `英文草稿 #${task.postId}`
            : "正在从中文正文翻译英文"
          : "中文任务完成后会自动创建英文任务",
    },
    {
      title: "SEO 字段",
      status: hasSeo ? "success" : "pending",
      detail: hasSeo
        ? [task.postTitle, task.postDescription, task.postKeywords]
            .filter(Boolean)
            .join(" / ")
            .slice(0, 160)
        : "等待标题、摘要、关键词写入草稿",
    },
    {
      title: "封面图",
      status: task.postImgUrl ? "success" : "pending",
      detail: task.postImgUrl ?? "暂无封面或自动生图未完成",
    },
    {
      title: "返利审计",
      status: report
        ? report.invalidLinks.length > 0
          ? "manual_required"
          : "success"
        : "pending",
      detail: report
        ? `命中 ${report.matchedLinks.length}，未命中 ${report.unmatchedLinks.length}（保留原链），无效 ${report.invalidLinks.length}`
        : diagnostics?.usedAiRewrite
          ? "英文任务不重复采集返利诊断"
          : "等待链接替换记录",
    },
  ] satisfies Array<{
    title: string;
    status: StepStatus;
    detail: string;
  }>;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-md border border-border/70 bg-background p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{item.title}</p>
            <Badge variant={stepStatusVariants[item.status]}>
              {stepStatusLabels[item.status]}
            </Badge>
          </div>
          <p className="mt-2 line-clamp-3 break-all text-xs leading-5 text-muted-foreground">
            {item.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

function TruncationHint({
  task,
  diagnostics,
}: {
  task: NonNullable<Awaited<ReturnType<typeof getAiRewriteTaskDetail>>>;
  diagnostics: ScrapeDiagnostics | null;
}) {
  const error = task.error ?? diagnostics?.aiRewriteError ?? "";
  const isTruncated =
    (diagnostics?.aiInputTruncated ?? false) ||
    /截断|truncated|max tokens|max_tokens|length/i.test(error);

  if (!isTruncated) {
    return null;
  }

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <p className="font-medium text-amber-700">可能是输出或输入长度问题</p>
      <p className="mt-1 leading-6 text-amber-700/90">
        当前模型 {task.model ?? "未记录"}，Max Tokens{" "}
        {formatMaybeNumber(task.maxTokens)}，AI 输入{" "}
        {formatMaybeNumber(task.aiInputLength)}，输出{" "}
        {formatMaybeNumber(task.rewriteOutputLength)}。如果英文 SEO
        或正文生成被截断，优先在 AI 改写配置中调大 Max Tokens，或缩短正文输入。
      </p>
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
      description="无效链接需要人工处理；未命中外链保留原 URL，仅作为返利配置优化建议。"
    >
      <div className="space-y-3">
        {unmatchedHosts.length > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-sm font-medium text-amber-700">
              可选：为这些外链域名补充返利规则
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              未配置不会阻止发布，正文会继续使用原链接。
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
              <Link href={`/posts/edit/post/${encodeURIComponent(postSlug)}`}>
                打开草稿审核
              </Link>
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
  const taskId = parsePostgresIntegerId(id);

  if (taskId === null) {
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
          <UnifiedTaskActionButtons
            type="ai"
            taskId={task.id}
            status={task.status}
            canRetry={task.status === "failed" || task.status === "cancelled"}
            canCancel={task.status === "pending"}
            canResolve={task.status === "manual_required"}
            afterDeleteHref={basePath}
            size="default"
          />
          {task.postSlug ? (
            <Button asChild>
              <Link
                href={`/posts/edit/post/${encodeURIComponent(task.postSlug)}`}
              >
                编辑草稿
              </Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="状态" value={statusLabels[task.status] ?? task.status} />
        <Stat label="尝试次数" value={task.attempts} />
        <Stat label="改写配置" value={task.rewriteStyleName ?? "-"} />
        <Stat label="模型" value={task.model ?? "-"} />
        <Stat
          label="生图配置"
          value={task.imageConfigName ?? "未绑定 / 已跳过"}
        />
        <Stat label="生图模型" value={task.imageModel ?? "-"} />
        <Stat label="Max Tokens" value={formatMaybeNumber(task.maxTokens)} />
        <Stat
          label="AI 输入长度"
          value={formatMaybeNumber(task.aiInputLength)}
        />
        <Stat
          label="改写输出长度"
          value={formatMaybeNumber(task.rewriteOutputLength)}
        />
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
            <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm leading-6 text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {task.error}
            </p>
          ) : null}
          <TruncationHint task={task} diagnostics={diagnostics} />
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="文章生产链路"
        description="按抓取、清洗、改写、翻译、SEO、封面和返利审计查看每一步产物。"
      >
        <ProductionChain
          task={task}
          diagnostics={diagnostics}
          report={report}
        />
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
        description="逐条确认替换前、替换后、命中商家、命中参数，以及是否 href 整条替换。"
      >
        {report ? (
          <div className="space-y-4">
            <AffiliateRewriteAudit report={report} />
            <Button asChild variant="outline" size="sm">
              <Link href="/collect/aff-man">
                <RotateCcw className="size-4" />
                去补返利规则
              </Link>
            </Button>
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
