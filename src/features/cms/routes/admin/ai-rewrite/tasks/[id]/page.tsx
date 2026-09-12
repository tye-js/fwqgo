import { contentToArticleMarkdown } from "@fwqgo/core/content";
import { isDefaultArticleCover } from "@fwqgo/core/article-cover";
import { ManualArticleTaskEditor } from "@/features/cms/components/manual-article-task-editor";
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
import { AiRewriteAuditViewer } from "@/features/cms/components/ai-rewrite-audit-viewer";
import { UnifiedTaskActionButtons } from "@/features/cms/components/unified-task-action-buttons";
import { TaskDetailAutoRefresh } from "@/features/cms/components/task-detail-auto-refresh";
import { isAiRewriteStageError } from "@/features/cms/lib/ai-rewrite-task-progress";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type ScrapeDiagnostics } from "@/server/scrape/article-scraper";
import { isHttpHref, parsePostgresIntegerId } from "@fwqgo/core/utils";
import type {
  SeoKeywordProvenance,
  ValidatedSeoKeywordCandidate,
  ValidatedSeoKeywordPlan,
} from "@fwqgo/ai/seo-keyword-plan";

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
type DbTaskStep = NonNullable<
  Awaited<ReturnType<typeof getAiRewriteTaskDetail>>
>["steps"][number];

type TaskStep = {
  key?: string;
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

const keywordProvenanceLabels: Record<SeoKeywordProvenance, string> = {
  body: "正文",
  table: "表格",
  title: "标题",
  taxonomy: "分类",
};

function normalizeKeywordProvenance(
  value: unknown,
): SeoKeywordProvenance | null {
  if (value === "body") return "body";
  if (value === "table") return "table";
  if (value === "title") return "title";
  if (value === "taxonomy") return "taxonomy";
  return null;
}

function normalizeKeywordCandidate(
  value: unknown,
): ValidatedSeoKeywordCandidate | null {
  if (!isRecord(value)) return null;
  const keyword = stringValue(value.keyword).trim();
  if (!keyword) return null;
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.flatMap((item) => {
        if (!isRecord(item)) return [];
        const text = stringValue(item.text).trim();
        const provenance = normalizeKeywordProvenance(item.provenance);
        if (!text || !provenance) return [];
        return [{ text, provenance }];
      })
    : [];
  return {
    keyword,
    evidence,
    bodyEligible: booleanValue(value.bodyEligible),
  };
}

function normalizeSeoKeywordPlan(
  value: unknown,
): ValidatedSeoKeywordPlan | undefined {
  if (!isRecord(value)) return undefined;
  const primaryKeyword = normalizeKeywordCandidate(value.primaryKeyword);
  const secondaryKeywords = arrayValue(value.secondaryKeywords, (item) =>
    normalizeKeywordCandidate(item),
  ).filter((item): item is ValidatedSeoKeywordCandidate => item !== null);
  const longTailKeywords = arrayValue(value.longTailKeywords, (item) =>
    normalizeKeywordCandidate(item),
  ).filter((item): item is ValidatedSeoKeywordCandidate => item !== null);
  const searchIntent =
    value.searchIntent === "transactional" ||
    value.searchIntent === "informational"
      ? value.searchIntent
      : "mixed";
  const rejectedKeywords = Array.isArray(value.rejectedKeywords)
    ? value.rejectedKeywords.flatMap((item) => {
        if (!isRecord(item)) return [];
        const keyword = stringValue(item.keyword).trim();
        const reason = stringValue(item.reason).trim();
        return keyword && reason ? [{ keyword, reason }] : [];
      })
    : [];

  if (
    !primaryKeyword &&
    secondaryKeywords.length === 0 &&
    longTailKeywords.length === 0 &&
    rejectedKeywords.length === 0
  ) {
    return undefined;
  }
  return {
    primaryKeyword,
    secondaryKeywords,
    longTailKeywords,
    searchIntent,
    rejectedKeywords,
  };
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

function normalizeRewriteQuality(
  value: unknown,
): ScrapeDiagnostics["rewriteQuality"] {
  if (!isRecord(value)) return undefined;
  const knowledgeReferences = Array.isArray(value.knowledgeReferences)
    ? value.knowledgeReferences.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = numberValue(item.id);
        const title = stringValue(item.title);
        if (!id || !title) return [];
        return [
          {
            id,
            title,
            slug: stringValue(item.slug),
            categoryName: stringValue(item.categoryName),
          },
        ];
      })
    : [];
  const providerReferences = Array.isArray(value.providerReferences)
    ? value.providerReferences.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = numberValue(item.id);
        const name = stringValue(item.name);
        if (!id || !name) return [];
        return [
          {
            id,
            name,
            slug: stringValue(item.slug),
          },
        ];
      })
    : [];

  return {
    passed: booleanValue(value.passed),
    originalityScore: numberValue(value.originalityScore),
    narrativeSimilarity: numberValue(value.narrativeSimilarity),
    exactSentenceRatio: numberValue(value.exactSentenceRatio),
    headingSimilarity: numberValue(value.headingSimilarity),
    criticalFactCoverage: numberValue(value.criticalFactCoverage),
    missingCriticalFacts: arrayValue(value.missingCriticalFacts, (item) =>
      stringValue(item),
    ).filter(Boolean),
    unsupportedCriticalFacts: arrayValue(
      value.unsupportedCriticalFacts,
      (item) => stringValue(item),
    ).filter(Boolean),
    sourceNarrativeLength: numberValue(value.sourceNarrativeLength),
    outputNarrativeLength: numberValue(value.outputNarrativeLength),
    reasons: arrayValue(value.reasons, (item) => stringValue(item)).filter(
      Boolean,
    ),
    promptVersion: stringValue(value.promptVersion),
    attempts: numberValue(value.attempts),
    factualScore: numberValue(value.factualScore),
    factCheckSkipped: booleanValue(value.factCheckSkipped),
    reviewPassed: booleanValue(value.reviewPassed),
    reviewSkipped: booleanValue(value.reviewSkipped),
    missingFacts: arrayValue(value.missingFacts, (item) =>
      stringValue(item),
    ).filter(Boolean),
    unsupportedClaims: arrayValue(value.unsupportedClaims, (item) =>
      stringValue(item),
    ).filter(Boolean),
    distortedFacts: arrayValue(value.distortedFacts, (item) =>
      stringValue(item),
    ).filter(Boolean),
    seoKeywordPlan: normalizeSeoKeywordPlan(value.seoKeywordPlan),
    knowledgeReferences,
    providerReferences,
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
      removedContentPatterns: arrayValue(
        parsed.removedContentPatterns,
        (item) => stringValue(item),
      ).filter(Boolean),
      affiliateReport: normalizeAffiliateReport(parsed.affiliateReport),
      warnings: arrayValue(parsed.warnings, (item) => stringValue(item)).filter(
        Boolean,
      ),
      aiRewriteError:
        typeof parsed.aiRewriteError === "string"
          ? parsed.aiRewriteError
          : undefined,
      rewriteQuality: normalizeRewriteQuality(parsed.rewriteQuality),
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
    english: "英文人工编辑",
    seo: "人工 SEO 编辑",
  };

  return labels[value] ?? value;
}

function buildTaskSteps(input: {
  status: string;
  sourceType: string;
  currentStep: string | null;
  postId: number | null;
  scrapedHtml: string | null;
  diagnostics: ScrapeDiagnostics | null;
}): TaskStep[] {
  return [
    {
      name: input.sourceType === "english" ? "读取中文来源" : "读取并清洗素材",
      status: input.scrapedHtml
        ? "success"
        : input.status === "running"
          ? "running"
          : "pending",
      description: "保留原始素材，供人工编辑参考",
    },
    {
      name: "人工填写正文与 SEO",
      status: input.postId
        ? "success"
        : input.status === "manual_required"
          ? "manual_required"
          : "pending",
      description: "填写最终正文、标题、slug、摘要、关键词和标签",
    },
    {
      name: "保存草稿与默认封面",
      status: input.postId ? "success" : "pending",
      description: "人工保存后创建草稿，使用默认封面，需要时手动点击生成封面",
    },
  ];
}

function normalizeStepStatus(value: string): StepStatus {
  if (value in stepStatusLabels) {
    return value as StepStatus;
  }

  return "pending";
}

function buildStoredTaskSteps(
  steps: DbTaskStep[],
  taskError?: string | null,
): TaskStep[] {
  if (steps.length === 0) {
    return [];
  }

  const latestAttempt = steps.reduce(
    (maxAttempt, step) => Math.max(maxAttempt, step.attempt),
    0,
  );

  const normalized = steps
    .filter((step) => step.attempt === latestAttempt)
    .map((step) => ({
      key: step.stepKey,
      name: step.stepName,
      status: normalizeStepStatus(step.status),
      description: step.error ?? step.message ?? "等待处理",
      progress: step.progress,
      attempt: step.attempt,
      time: step.finishedAt ?? step.updatedAt ?? step.createdAt,
      payload: step.payload,
    }));

  const hasAiRewriteStep = normalized.some((step) => step.key === "ai_rewrite");
  const failedSourceStep = normalized.find(
    (step) => step.key === "source_collect" && step.status === "failed",
  );
  if (
    !hasAiRewriteStep &&
    failedSourceStep &&
    isAiRewriteStageError(taskError)
  ) {
    failedSourceStep.status = "success";
    failedSourceStep.description =
      "素材读取已完成；旧任务未在 AI 失败前保存正文快照";

    normalized.push(
      {
        key: "html_clean",
        name: "清洗正文结构",
        status: "success",
        description: "正文清洗已完成；旧任务未保存长度信息",
        progress: 45,
        attempt: latestAttempt,
        time: failedSourceStep.time,
        payload: null,
      },
      {
        key: "affiliate_check",
        name: "识别商户与返利链接",
        status: "success",
        description: "已在进入 AI 改写前完成；旧任务未保存链接诊断",
        progress: 58,
        attempt: latestAttempt,
        time: failedSourceStep.time,
        payload: null,
      },
      {
        key: "ai_rewrite",
        name: "AI 改写文章",
        status: "failed",
        description: taskError ?? "AI 改写失败",
        progress: 70,
        attempt: latestAttempt,
        time: failedSourceStep.time,
        payload: null,
      },
    );
  }

  return normalized.sort(
    (left, right) => (left.progress ?? 0) - (right.progress ?? 0),
  );
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
          key={step.key ?? step.name}
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

function SeoKeywordPlanPanel({ plan }: { plan: ValidatedSeoKeywordPlan }) {
  const groups = [
    {
      label: "主关键词",
      items: plan.primaryKeyword ? [plan.primaryKeyword] : [],
    },
    { label: "次关键词", items: plan.secondaryKeywords },
    { label: "长尾词", items: plan.longTailKeywords },
  ];
  const intentLabel = {
    transactional: "交易型",
    informational: "信息型",
    mixed: "混合型",
  }[plan.searchIntent];

  return (
    <AdminSectionCard title="SEO 关键词规划">
      <div className="space-y-4">
        <Badge variant="outline">搜索意图：{intentLabel}</Badge>
        {groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-sm font-medium">{group.label}</p>
            {group.items.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {group.items.map((candidate) => (
                  <div
                    key={candidate.keyword}
                    className="rounded-md border border-border/70 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {candidate.keyword}
                      </span>
                      {!candidate.bodyEligible ? (
                        <Badge variant="secondary">仅元信息</Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                      {candidate.evidence.map((evidence, index) => (
                        <p
                          key={`${evidence.provenance}:${evidence.text}:${index}`}
                        >
                          {keywordProvenanceLabels[evidence.provenance]}：
                          {evidence.text}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">无有效候选</p>
            )}
          </div>
        ))}
        {plan.rejectedKeywords.length > 0 ? (
          <div className="space-y-2 border-t border-border/70 pt-4">
            <p className="text-sm font-medium text-destructive">已拒绝关键词</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              {plan.rejectedKeywords.map((item, index) => (
                <p key={`${item.keyword}:${index}`}>
                  {item.keyword}：{item.reason}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AdminSectionCard>
  );
}

function ProductionChain({
  task,
}: {
  task: NonNullable<Awaited<ReturnType<typeof getAiRewriteTaskDetail>>>;
}) {
  const manualStep = [...task.steps]
    .reverse()
    .find((step) => step.stepKey === "manual_input");
  const manualStatus: StepStatus = manualStep
    ? normalizeStepStatus(manualStep.status)
    : task.postId
      ? "success"
      : "manual_required";
  const items: Array<{ title: string; status: StepStatus; detail: string }> = [
    {
      title: task.sourceType === "english" ? "中文来源正文" : "原文与清洗",
      status: task.scrapedHtml ? "success" : "pending",
      detail: task.scrapedHtml
        ? `已保留完整正文 ${task.scrapedHtml.length} 个字符`
        : "等待读取素材",
    },
    {
      title: "人工正文",
      status: manualStatus,
      detail: task.postId
        ? "打开文章编辑页维护正文"
        : "在下方填写或粘贴最终正文",
    },
    {
      title: "人工 SEO",
      status: manualStatus,
      detail: "人工填写标题、slug、摘要、关键词和标签",
    },
    {
      title: "封面",
      status:
        task.postImgUrl && !isDefaultArticleCover(task.postImgUrl)
          ? "success"
          : "pending",
      detail:
        task.postImgUrl && !isDefaultArticleCover(task.postImgUrl)
          ? task.postImgUrl
          : "使用默认封面，手动点击生成后，后台图片任务成功时替换",
    },
  ];
  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.title}
          className="min-w-0 space-y-2 rounded-md border border-border/70 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{item.title}</p>
            <Badge variant={stepStatusVariants[item.status]}>
              {stepStatusLabels[item.status]}
            </Badge>
          </div>
          <p className="break-words text-sm leading-6 text-muted-foreground">
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
        {formatMaybeNumber(task.rewriteOutputLength)}
        。正文生成和 SEO 生成都会使用配置中的 Max
        Tokens；如果重试后仍被截断，说明模型或中转服务还有自身输出上限，建议缩短正文输入或更换推理消耗更低的模型。
      </p>
      {task.aiInputLength === null && isAiRewriteStageError(error) ? (
        <p className="mt-1 leading-6 text-amber-700/90">
          此任务由旧流程执行，失败前没有保存输入和候选正文长度，因此历史数据无法补回；重新执行后会从正文清洗阶段开始实时记录。
        </p>
      ) : null}
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
  const storedSteps = buildStoredTaskSteps(task.steps, task.error);
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
      description="查看素材、清洗结果和人工编辑状态；正文与文章 SEO 均由人工填写。"
      actions={
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
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
            canResolve={
              task.status === "manual_required" && Boolean(task.postId)
            }
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
      <TaskDetailAutoRefresh
        enabled={task.status === "pending" || task.status === "running"}
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="状态" value={statusLabels[task.status] ?? task.status} />
        <Stat label="内容方式" value="人工输入" />
        <Stat label="素材读取次数" value={task.attempts} />
        <Stat
          label="已保存正文字数"
          value={formatMaybeNumber(task.rewriteOutputLength)}
        />
      </div>
      {task.status === "manual_required" &&
      !task.postId &&
      task.sourceType !== "seo" ? (
        <ManualArticleTaskEditor
          taskId={task.id}
          expectedUpdatedAt={(task.updatedAt ?? task.createdAt).toISOString()}
          sourceMarkdown={
            contentToArticleMarkdown(
              task.scrapedHtml ?? task.sourceContent ?? "",
            ).markdown
          }
          language={task.sourceType === "english" ? "en" : "zh"}
        />
      ) : null}

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
          {task.artifacts.length > 0 ? (
            <TruncationHint task={task} diagnostics={diagnostics} />
          ) : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="文章生产链路"
        description="素材准备后填写正文与 SEO，保存草稿并使用默认封面；需要时手动点击生成封面。"
      >
        <ProductionChain task={task} />
      </AdminSectionCard>

      {diagnostics?.rewriteQuality?.seoKeywordPlan ? (
        <SeoKeywordPlanPanel plan={diagnostics.rewriteQuality.seoKeywordPlan} />
      ) : null}

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

      {task.artifacts.length > 0 ? (
        <AdminSectionCard
          title="历史 AI 调用与候选正文"
          description="保存每次模型调用的实际提示词、原始响应和人工可读正文；失败或因完整性问题重试的候选也会保留。"
        >
          <AiRewriteAuditViewer artifacts={task.artifacts} />
        </AdminSectionCard>
      ) : null}

      <ManualReviewHints diagnostics={diagnostics} postSlug={task.postSlug} />

      <AdminSectionCard
        title="来源与结果"
        description="素材来源、分类和文章编辑入口。"
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
            {task.rewriteStyleName ? (
              <div>
                <p className="text-muted-foreground">历史改写风格</p>
                <p className="font-medium">{task.rewriteStyleName}</p>
              </div>
            ) : null}
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
                <Badge variant="outline">原始素材 · 人工编辑</Badge>
              )}
            </div>
            {diagnostics.rewriteQuality ? (
              <div className="space-y-3 border-t border-border/70 pt-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Stat
                    label="原创度"
                    value={`${diagnostics.rewriteQuality.originalityScore}%`}
                  />
                  <Stat
                    label="自动重写"
                    value={`${diagnostics.rewriteQuality.attempts} 轮`}
                  />
                  <Stat label="改写模式" value="原文约束 · 不做事实核查" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {diagnostics.rewriteQuality.promptVersion}
                  </Badge>
                  <Badge variant="outline">
                    仅基于清洗后的原文 · 不执行事实核查
                  </Badge>
                </div>
              </div>
            ) : null}
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
            {diagnostics.removedContentPatterns?.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">语义清洗</p>
                <div className="flex flex-wrap gap-2">
                  {diagnostics.removedContentPatterns.map((pattern) => (
                    <Badge key={pattern} variant="outline">
                      {pattern}
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
        title={task.sourceType === "english" ? "中文来源正文预览" : "正文预览"}
        description={
          task.sourceType === "english"
            ? "此处保留中文来源供参考，英文正文、标题、slug、摘要和关键词均需人工输入。"
            : "清洗后的完整原始正文，供人工编辑参考。"
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
