"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";

import {
  cancelAiRewriteTaskAction,
  createAiRewriteTaskAction,
  deleteAiRewriteTaskAction,
  retryAiRewriteTaskAction,
} from "@/features/cms/actions/ai-rewrite-task";
import {
  type AiRewriteTaskLanguageFilter,
  type AiRewriteTaskSourceTypeFilter,
  type AiRewriteTaskStatusFilter,
} from "@/features/cms/lib/ai-rewrite-task-filters";
import { AiRewriteTaskResolveButton } from "@/features/cms/components/ai-rewrite-task-resolve-button";
import { type getAiRewriteTaskList } from "@/features/cms/actions/ai-rewrite-task";
import { AdminTableWorkbench } from "@/features/cms/components/admin-table-workbench";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { useUrlQueryUpdater } from "@/features/cms/hooks/use-url-query-updater";
import { type ScrapeDiagnostics } from "@/server/scrape/article-scraper";
import { type AffiliateRewriteReport } from "@/server/links/affiliate-link-rewriter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";
import { isHttpHref } from "@fwqgo/core/utils";
import { AdminTableEmpty } from "@/features/cms/components/admin-table-workbench";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type RewriteTask = Awaited<ReturnType<typeof getAiRewriteTaskList>>[number];

type Option = {
  id: number;
  name: string;
};

type RewriteStyleOption = {
  id: number;
  styleName: string;
  isDefault: boolean;
};

const sourceTypeOptions = [
  { value: "url", label: "网址", icon: Link2 },
  { value: "text", label: "文本", icon: FileText },
  { value: "email", label: "邮件", icon: Mail },
  { value: "file", label: "文件", icon: Upload },
] as const;

const statusLabels: Record<string, string> = {
  pending: "等待中",
  running: "处理中",
  succeeded: "已完成",
  manual_required: "需人工处理",
  failed: "失败",
  cancelled: "已取消",
};

const statusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  running: "secondary",
  succeeded: "default",
  manual_required: "secondary",
  failed: "destructive",
  cancelled: "outline",
};

function formatTime(value: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "时间异常";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseTaskDiagnostics(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return normalizeTaskDiagnostics(parsed);
  } catch {
    return null;
  }
}

function normalizeTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeRequiredNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function normalizeAffiliateReport(
  report: Partial<AffiliateRewriteReport> | null | undefined,
): AffiliateRewriteReport {
  return {
    totalLinks: normalizeRequiredNumber(report?.totalLinks),
    internalLinksRemoved: normalizeRequiredNumber(report?.internalLinksRemoved),
    matchedLinks: Array.isArray(report?.matchedLinks)
      ? report.matchedLinks
      : [],
    unmatchedLinks: Array.isArray(report?.unmatchedLinks)
      ? report.unmatchedLinks
      : [],
    invalidLinks: Array.isArray(report?.invalidLinks)
      ? report.invalidLinks
      : [],
  };
}

function normalizeTaskDiagnostics(
  diagnostics: Partial<ScrapeDiagnostics>,
): ScrapeDiagnostics {
  return {
    sourceHost:
      typeof diagnostics.sourceHost === "string" ? diagnostics.sourceHost : "",
    strategy:
      typeof diagnostics.strategy === "string"
        ? diagnostics.strategy
        : "未知规则",
    usedPuppeteer: normalizeBoolean(diagnostics.usedPuppeteer),
    usedFallback: normalizeBoolean(diagnostics.usedFallback),
    usedAiRewrite: normalizeBoolean(diagnostics.usedAiRewrite),
    contentLength: normalizeRequiredNumber(diagnostics.contentLength),
    scrapedTitle:
      typeof diagnostics.scrapedTitle === "string"
        ? diagnostics.scrapedTitle
        : undefined,
    scrapedDescription:
      typeof diagnostics.scrapedDescription === "string"
        ? diagnostics.scrapedDescription
        : undefined,
    cleanedHtmlLength: normalizeOptionalNumber(diagnostics.cleanedHtmlLength),
    aiInputLength: normalizeOptionalNumber(diagnostics.aiInputLength),
    rewriteOutputLength: normalizeOptionalNumber(
      diagnostics.rewriteOutputLength,
    ),
    aiInputTruncated:
      typeof diagnostics.aiInputTruncated === "boolean"
        ? diagnostics.aiInputTruncated
        : undefined,
    removedSelectors: normalizeTextArray(diagnostics.removedSelectors),
    affiliateReport: normalizeAffiliateReport(diagnostics.affiliateReport),
    warnings: normalizeTextArray(diagnostics.warnings),
    aiRewriteError:
      typeof diagnostics.aiRewriteError === "string"
        ? diagnostics.aiRewriteError
        : undefined,
    rewriteQuality:
      diagnostics.rewriteQuality &&
      typeof diagnostics.rewriteQuality === "object"
        ? diagnostics.rewriteQuality
        : undefined,
  };
}

function shortUrl(value: string) {
  if (value.length <= 72) {
    return value;
  }

  return `${value.slice(0, 44)}...${value.slice(-20)}`;
}

function getSourceHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function getErrorLines(value: string | null) {
  if (!value) return [];

  return value
    .split(/；原因：|原因：|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusVariants[status] ?? "outline"}>
      {statusLabels[status] ?? status}
    </Badge>
  );
}

function TaskProgress({ task }: { task: RewriteTask }) {
  return (
    <div className="min-w-40 space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{task.currentStep ?? "等待处理"}</span>
        <span className="tabular-nums">{task.progress}%</span>
      </div>
      <Progress value={task.progress} className="h-2" />
    </div>
  );
}

function TaskTokenMeta({ task }: { task: RewriteTask }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
      <Badge variant="outline">{task.model ?? "未配置模型"}</Badge>
      <Badge variant="outline">Max {task.maxTokens ?? "-"}</Badge>
      <Badge variant="outline">输入 {task.aiInputLength ?? "-"}</Badge>
      <Badge variant="outline">输出 {task.rewriteOutputLength ?? "-"}</Badge>
    </div>
  );
}

function TaskFailureMessage({ error }: { error: string | null }) {
  const lines = getErrorLines(error);

  if (lines.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/25 bg-destructive/5 p-3">
      <div className="flex gap-2 text-sm font-medium leading-5 text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>{lines[0]}</span>
      </div>
      {lines.length > 1 ? (
        <div className="space-y-1 pl-6 text-xs leading-5 text-destructive/80">
          {lines.slice(1, 4).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskDiagnosticsDisclosure({
  diagnostics,
}: {
  diagnostics: ScrapeDiagnostics | null;
}) {
  if (!diagnostics) {
    return null;
  }

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-3 text-xs text-muted-foreground"
        >
          <Link2 className="size-3.5" />
          采集诊断
          <ChevronDown className="size-3.5" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <AffiliateDiagnosticsSummary diagnostics={diagnostics} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function FailedTaskPanel({
  tasks,
  retryingId,
  deletingId,
  onRetry,
  onDelete,
  basePath,
}: {
  tasks: RewriteTask[];
  retryingId: number | null;
  deletingId: number | null;
  onRetry: (taskId: number) => void;
  onDelete: (task: RewriteTask) => void;
  basePath: string;
}) {
  const failedTasks = tasks
    .filter((task) => task.status === "failed")
    .slice(0, 4);

  if (failedTasks.length === 0) {
    return null;
  }

  return (
    <div
      id="failed-tasks"
      className="scroll-mt-24 space-y-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-destructive">最近失败任务</p>
          <p className="text-xs text-destructive/80">
            优先展示失败原因，修正配置或来源后可以直接重新开始。
          </p>
        </div>
        <Badge variant="destructive">{failedTasks.length} 个失败</Badge>
      </div>

      <div className="grid gap-3">
        {failedTasks.map((task) => (
          <div
            key={task.id}
            className="grid gap-3 rounded-md border border-destructive/20 bg-background p-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_auto]"
          >
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium text-foreground">
                #{task.id} {getSourceHost(task.sourceUrl)}
              </p>
              {isHttpHref(task.sourceUrl) ? (
                <a
                  href={task.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-muted-foreground hover:text-primary"
                >
                  {task.sourceUrl}
                </a>
              ) : (
                <p className="block truncate text-xs text-muted-foreground">
                  {task.sourceUrl}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatTime(task.updatedAt)} · 尝试 {task.attempts} 次
              </p>
              <TaskTokenMeta task={task} />
            </div>
            <TaskFailureMessage error={task.error} />
            <div className="flex items-center justify-end gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`${basePath}/${task.id}`}>详情</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={retryingId === task.id}
                onClick={() => onRetry(task.id)}
              >
                <RotateCcw className="size-4" />
                {retryingId === task.id ? "启动中" : "重试"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={deletingId === task.id}
                  >
                    <Trash2 className="size-4" />
                    {deletingId === task.id ? "删除中" : "删除"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除这个 AI 任务？</AlertDialogTitle>
                    <AlertDialogDescription>
                      只会删除任务记录和步骤日志，不会删除已经生成的草稿文章。任务删除后无法恢复。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(task)}>
                      确定删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function countSubmittedUrls(formData: FormData) {
  const sourceType = formData.get("sourceType");
  if (
    sourceType === "text" ||
    sourceType === "email" ||
    sourceType === "file"
  ) {
    return 1;
  }

  const sourceUrls = formData.get("sourceUrls");
  if (typeof sourceUrls !== "string") return 0;

  return sourceUrls
    .split(/\r?\n|,|\s+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function taskSourceTypeLabel(value: string) {
  const labels: Record<string, string> = {
    url: "网址",
    text: "手动文本",
    email: "邮件素材",
    file: "文件导入",
    english: "英文生成",
    seo: "SEO 更新",
  };

  return labels[value] ?? value;
}

function taskSourceTitle(task: RewriteTask) {
  if (task.sourceType === "url") {
    return task.sourceUrl;
  }

  if (task.sourceType === "english") {
    return `英文 SEO 版本：${task.postTitle ?? task.resultTitle ?? task.sourceTitle ?? task.sourceUrl}`;
  }

  if (task.sourceType === "seo") {
    return `SEO 更新：${task.postTitle ?? task.resultTitle ?? task.sourceTitle ?? task.sourceUrl}`;
  }

  return task.sourceTitle ?? task.sourceUrl;
}

function AffiliateDiagnosticsSummary({
  diagnostics,
}: {
  diagnostics: ScrapeDiagnostics | null;
}) {
  const report = diagnostics?.affiliateReport;
  const quality = diagnostics?.rewriteQuality;
  const knowledgeReferences = quality?.knowledgeReferences ?? [];
  const providerReferences = quality?.providerReferences ?? [];

  if (!report) {
    return <span className="text-sm text-muted-foreground">等待抓取</span>;
  }

  const matchedProviders = [
    ...new Set(report.matchedLinks.map((item) => item.providerName)),
  ];
  const unmatchedHosts = [
    ...new Set(report.unmatchedLinks.map((item) => item.host).filter(Boolean)),
  ];

  return (
    <Collapsible>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{diagnostics.strategy}</Badge>
          {diagnostics.usedFallback ? (
            <Badge variant="outline">通用规则</Badge>
          ) : null}
          {diagnostics.usedPuppeteer ? (
            <Badge variant="outline">浏览器渲染</Badge>
          ) : null}
          <Badge
            variant={diagnostics.usedAiRewrite ? "secondary" : "destructive"}
          >
            {diagnostics.usedAiRewrite ? "AI 已改写" : "AI 回退"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border/70 p-2">
            <p className="text-muted-foreground">链接</p>
            <p className="mt-1 font-medium text-foreground">
              {report.totalLinks}
            </p>
          </div>
          <div className="rounded-md border border-border/70 p-2">
            <p className="text-muted-foreground">返利</p>
            <p className="mt-1 font-medium text-foreground">
              {report.matchedLinks.length}
            </p>
          </div>
          <div className="rounded-md border border-border/70 p-2">
            <p className="text-muted-foreground">未命中</p>
            <p className="mt-1 font-medium text-foreground">
              {report.unmatchedLinks.length}
            </p>
          </div>
          <div className="rounded-md border border-border/70 p-2">
            <p className="text-muted-foreground">站内</p>
            <p className="mt-1 font-medium text-foreground">
              {report.internalLinksRemoved}
            </p>
          </div>
        </div>

        {quality ? (
          <div className="space-y-2 border-t border-border/60 pt-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border/70 p-2">
                <p className="text-muted-foreground">原创度</p>
                <p className="mt-1 font-medium text-foreground">
                  {quality.originalityScore}%
                </p>
              </div>
              <div className="rounded-md border border-border/70 p-2">
                <p className="text-muted-foreground">关键事实覆盖</p>
                <p className="mt-1 font-medium text-foreground">
                  {quality.criticalFactCoverage}%
                </p>
              </div>
              <div className="rounded-md border border-border/70 p-2">
                <p className="text-muted-foreground">事实审查</p>
                <p className="mt-1 font-medium text-foreground">
                  {quality.factualScore}/100
                </p>
              </div>
              <div className="rounded-md border border-border/70 p-2">
                <p className="text-muted-foreground">生成轮数</p>
                <p className="mt-1 font-medium text-foreground">
                  {quality.attempts}
                </p>
              </div>
            </div>
            {knowledgeReferences.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {knowledgeReferences.map((reference) => (
                  <Badge key={reference.id} variant="outline">
                    知识：{reference.title}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                本次未引用知识库条目
              </p>
            )}
            {providerReferences.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {providerReferences.map((reference) => (
                  <Badge key={reference.id} variant="outline">
                    供应商资料：{reference.name}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          正文 {diagnostics.contentLength} 字
          {diagnostics.removedSelectors.length > 0
            ? ` · 清理 ${diagnostics.removedSelectors.length} 类噪声`
            : ""}
        </p>

        {diagnostics.warnings.length > 0 ? (
          <p className="flex gap-1 text-xs leading-5 text-amber-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{diagnostics.warnings.join("；")}</span>
          </p>
        ) : null}

        {matchedProviders.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {matchedProviders.slice(0, 4).map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
            {matchedProviders.length > 4 ? (
              <Badge variant="outline">+{matchedProviders.length - 4}</Badge>
            ) : null}
          </div>
        ) : null}

        {report.matchedLinks.length > 0 || unmatchedHosts.length > 0 ? (
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-3 text-xs text-muted-foreground"
            >
              <Link2 className="h-3.5 w-3.5" />
              查看命中详情
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </CollapsibleTrigger>
        ) : null}

        <CollapsibleContent className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-3 text-xs">
          {report.matchedLinks.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-foreground">返利链接命中</p>
              <div className="space-y-2">
                {report.matchedLinks.slice(0, 6).map((item, index) => (
                  <div key={`${item.finalHref}-${index}`} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge>{item.providerName}</Badge>
                      <Badge variant="outline">{item.matchedDomain}</Badge>
                      <Badge variant="secondary">
                        {item.mode === "replace" ? "替换链接" : "追加参数"}
                      </Badge>
                      <Badge variant="outline">
                        {item.affParam
                          ? item.affValue
                            ? `${item.affParam}=${item.affValue}`
                            : item.affParam
                          : "-"}
                      </Badge>
                    </div>
                    <p className="break-all text-muted-foreground">
                      原链接：{shortUrl(item.resolvedHref)}
                    </p>
                    <p className="break-all text-muted-foreground">
                      返利：{shortUrl(item.finalHref)}
                    </p>
                  </div>
                ))}
              </div>
              {report.matchedLinks.length > 6 ? (
                <p className="text-muted-foreground">
                  还有 {report.matchedLinks.length - 6} 条命中未展示
                </p>
              ) : null}
            </div>
          ) : null}

          {unmatchedHosts.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-foreground">
                未配置返利的外链域名
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unmatchedHosts.slice(0, 12).map((host) => (
                  <Badge key={host} variant="outline">
                    {host}
                  </Badge>
                ))}
                {unmatchedHosts.length > 12 ? (
                  <Badge variant="outline">+{unmatchedHosts.length - 12}</Badge>
                ) : null}
              </div>
            </div>
          ) : null}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function AiRewriteTaskManager({
  tasks,
  categories,
  rewriteStyles,
  basePath = "/ai-rewrite/tasks",
  showCreateForm = true,
  showTaskList = true,
  filters,
  totalCount,
  totalPage,
}: {
  tasks: RewriteTask[];
  categories: Option[];
  rewriteStyles: RewriteStyleOption[];
  basePath?: string;
  showCreateForm?: boolean;
  showTaskList?: boolean;
  filters?: {
    pageNo: number;
    status: AiRewriteTaskStatusFilter;
    sourceType: AiRewriteTaskSourceTypeFilter;
    language: AiRewriteTaskLanguageFilter;
    query: string;
  };
  totalCount?: number;
  totalPage?: number;
}) {
  const router = useRouter();
  const updateUrlQuery = useUrlQueryUpdater();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sourceType, setSourceType] = useState("url");
  const defaultCategoryId = categories[0]?.id ? String(categories[0].id) : "";
  const defaultRewriteStyleId = useMemo(
    () =>
      rewriteStyles.find((style) => style.isDefault)?.id ??
      rewriteStyles[0]?.id,
    [rewriteStyles],
  );
  const hasActiveTask =
    showTaskList &&
    tasks.some((task) => ["pending", "running"].includes(task.status));
  const activeFilters = filters ?? {
    pageNo: 1,
    status: "all" as const,
    sourceType: "all" as const,
    language: "all" as const,
    query: "",
  };

  useEffect(() => {
    if (!hasActiveTask) return;

    const interval = window.setInterval(() => {
      router.refresh();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [hasActiveTask, router]);

  function handleSubmit(formData: FormData) {
    startSubmitTransition(async () => {
      try {
        const result = await createAiRewriteTaskAction(formData);
        if (result.error) {
          notifyError({
            title: "AI 改写任务创建失败",
            description: describeAdminResult([
              result.error,
              "请检查素材来源、分类和改写配置后再提交",
            ]),
          });
          return;
        }

        notifySuccess({
          title: "AI 改写任务已加入队列",
          description: describeAdminResult([
            `提交 ${countSubmittedUrls(formData)} 个素材`,
            `创建 ${result.count ?? 1} 个任务`,
            "任务成功后才会保存为草稿",
          ]),
        });
        router.refresh();
      } catch (error) {
        notifyError({
          title: "AI 改写任务创建失败",
          description: describeAdminResult([
            error instanceof Error ? error.message : "请求未完成",
            "服务器连接可能中断，请确认任务中心没有生成重复任务后再提交",
          ]),
        });
      }
    });
  }

  async function handleRetry(taskId: number) {
    setRetryingId(taskId);
    try {
      const result = await retryAiRewriteTaskAction(taskId);
      if (result.error) {
        notifyError({
          title: "AI 改写任务重试失败",
          description: describeAdminResult([
            `任务 ID ${taskId}`,
            result.error,
            "请确认任务仍存在且未在运行中",
          ]),
        });
        return;
      }

      notifySuccess({
        title: "AI 改写任务已重新加入队列",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "系统会重新抓取、清洗、改写，成功后再保存草稿",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "AI 改写任务重试失败",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          error instanceof Error ? error.message : "请求未完成",
          "请刷新任务状态后再重试",
        ]),
      });
    } finally {
      setRetryingId(null);
    }
  }

  async function handleCancel(taskId: number) {
    setCancelingId(taskId);
    try {
      const result = await cancelAiRewriteTaskAction(taskId);
      if (result.error) {
        notifyError({
          title: "AI 任务取消失败",
          description: describeAdminResult([
            `任务 ID ${taskId}`,
            result.error,
            "只有等待中的任务可以取消，运行中任务会等待本轮处理结束",
          ]),
        });
        return;
      }

      notifySuccess({
        title: "AI 任务已取消",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          "需要继续时可点击恢复，任务会重新加入队列",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "AI 任务取消失败",
        description: describeAdminResult([
          `任务 ID ${taskId}`,
          error instanceof Error ? error.message : "请求未完成",
          "请刷新任务状态后再操作",
        ]),
      });
    } finally {
      setCancelingId(null);
    }
  }

  async function handleDelete(task: RewriteTask) {
    setDeletingId(task.id);
    try {
      const result = await deleteAiRewriteTaskAction(task.id);
      if (result.error) {
        notifyError({
          title: "AI 任务删除失败",
          description: describeAdminResult([
            `任务 ID ${task.id}`,
            result.error,
            task.status === "running"
              ? "处理中任务需要等待结束后再删除"
              : "请刷新页面后确认任务状态",
          ]),
        });
        return;
      }

      notifySuccess({
        title: "AI 任务已删除",
        description: describeAdminResult([
          `任务 ID ${task.id}`,
          task.postSlug
            ? "已生成的草稿文章保留，可继续在草稿箱编辑"
            : "未生成草稿，仅清理任务记录和步骤日志",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "AI 任务删除失败",
        description: describeAdminResult([
          `任务 ID ${task.id}`,
          error instanceof Error ? error.message : "请求未完成",
          "请刷新页面确认任务仍存在后再操作",
        ]),
      });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {showCreateForm ? (
        <form
          action={handleSubmit}
          className="overflow-hidden rounded-md border border-border/70 bg-card"
        >
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/15 px-3 py-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              素材类型
            </p>
            <div
              role="group"
              aria-label="选择素材类型"
              className="grid grid-cols-2 gap-1 rounded-md border border-border/70 bg-background p-1 sm:grid-cols-4"
            >
              {sourceTypeOptions.map((option) => {
                const Icon = option.icon;
                const active = sourceType === option.value;

                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={active ? "secondary" : "ghost"}
                    aria-pressed={active}
                    className="h-11 min-h-11 px-3"
                    onClick={() => setSourceType(option.value)}
                  >
                    <Icon className="size-4" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <input type="hidden" name="sourceType" value={sourceType} />

          <div className="space-y-3 px-3 py-3 md:px-4 md:py-4">
            {sourceType === "url" ? (
              <div className="space-y-2">
                <Label htmlFor="ai-source-urls">文章 URL</Label>
                <Textarea
                  id="ai-source-urls"
                  name="sourceUrls"
                  placeholder="https://example.com/article"
                  required
                  className="min-h-28 resize-y text-base sm:text-sm"
                />
              </div>
            ) : sourceType === "file" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ai-source-file-title">素材标题</Label>
                  <Input
                    id="ai-source-file-title"
                    name="sourceTitle"
                    placeholder="留空使用文件名"
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-source-file">选择文件</Label>
                  <Input
                    id="ai-source-file"
                    name="sourceFile"
                    type="file"
                    accept=".txt,.md,.markdown,.html,.htm,.csv,text/plain,text/markdown,text/html,text/csv"
                    required
                    className="min-h-11"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ai-source-title">
                    {sourceType === "email" ? "邮件标题" : "素材标题"}
                  </Label>
                  <Input
                    id="ai-source-title"
                    name="sourceTitle"
                    required
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-source-content">
                    {sourceType === "email" ? "邮件正文" : "素材正文"}
                  </Label>
                  <Textarea
                    id="ai-source-content"
                    name="sourceContent"
                    required
                    className="min-h-40 resize-y text-base sm:text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 border-t border-border/60 bg-muted/15 px-3 py-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] md:items-end md:px-4">
            <div className="space-y-2">
              <Label htmlFor="ai-task-category">文章分类</Label>
              <Select
                name="categoryId"
                defaultValue={defaultCategoryId}
                required
              >
                <SelectTrigger
                  id="ai-task-category"
                  className="min-h-11 bg-background"
                >
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-task-style">改写风格</Label>
              <Select
                name="rewriteStyleId"
                defaultValue={
                  defaultRewriteStyleId
                    ? String(defaultRewriteStyleId)
                    : undefined
                }
                disabled={rewriteStyles.length === 0}
              >
                <SelectTrigger
                  id="ai-task-style"
                  className="min-h-11 bg-background"
                >
                  <SelectValue
                    placeholder={
                      rewriteStyles.length > 0 ? "选择风格" : "未配置 AI"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {rewriteStyles.map((style) => (
                    <SelectItem key={style.id} value={String(style.id)}>
                      {style.styleName}
                      {style.isDefault ? "（默认）" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={isSubmitting || categories.length === 0}
              className="w-full md:w-auto"
            >
              {isSubmitting ? "正在加入..." : "加入生产队列"}
            </Button>
          </div>
        </form>
      ) : null}

      {showTaskList ? (
        <>
          <AdminTableWorkbench
            title="任务筛选"
            description={`筛选条件和页码会写入地址栏，当前匹配 ${totalCount ?? tasks.length} 个任务。`}
            searchValue={activeFilters.query}
            onSearchChange={(value) => updateUrlQuery({ query: value || null })}
            searchPlaceholder="搜索来源、标题、分类或生成结果"
            searchMaxLength={160}
            filterSlot={
              <>
                <Select
                  value={activeFilters.status}
                  onValueChange={(value) =>
                    updateUrlQuery({ status: value === "all" ? null : value })
                  }
                >
                  <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[140px] sm:border-0 sm:bg-transparent sm:px-0">
                    <SelectValue placeholder="任务状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={activeFilters.sourceType}
                  onValueChange={(value) =>
                    updateUrlQuery({
                      sourceType: value === "all" ? null : value,
                    })
                  }
                >
                  <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[132px] sm:border-0 sm:bg-transparent sm:px-0">
                    <SelectValue placeholder="素材类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部素材</SelectItem>
                    <SelectItem value="url">网址</SelectItem>
                    <SelectItem value="text">手动文本</SelectItem>
                    <SelectItem value="email">邮件素材</SelectItem>
                    <SelectItem value="file">文件导入</SelectItem>
                    <SelectItem value="english">英文生成</SelectItem>
                    <SelectItem value="seo">SEO 更新</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={activeFilters.language}
                  onValueChange={(value) =>
                    updateUrlQuery({
                      language: value === "all" ? null : value,
                    })
                  }
                >
                  <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[120px] sm:border-0 sm:bg-transparent sm:px-0">
                    <SelectValue placeholder="语言" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部语言</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">英文</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          />

          <FailedTaskPanel
            tasks={tasks}
            retryingId={retryingId}
            deletingId={deletingId}
            onRetry={(taskId) => void handleRetry(taskId)}
            onDelete={(task) => void handleDelete(task)}
            basePath={basePath}
          />

          <div
            id="task-table"
            className="scroll-mt-24 overflow-hidden rounded-md border border-border/70 bg-card"
          >
            {tasks.length === 0 ? (
              <AdminTableEmpty
                title="暂无 AI 改写任务"
                description="提交来源 URL 后，系统会在后台抓取、清洗、改写，并在成功后保存为草稿。"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[280px]">任务来源</TableHead>
                    <TableHead className="w-[120px]">状态</TableHead>
                    <TableHead className="min-w-[280px]">失败 / 进度</TableHead>
                    <TableHead className="min-w-[220px]">结果</TableHead>
                    <TableHead className="w-[220px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const diagnostics = parseTaskDiagnostics(task.diagnostics);
                    const isFailed = task.status === "failed";
                    return (
                      <TableRow
                        key={task.id}
                        className={
                          isFailed ? "bg-destructive/5 align-top" : "align-top"
                        }
                      >
                        <TableCell>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                #{task.id}
                              </span>
                              <Badge variant="outline">
                                {task.categoryName ?? "未分类"}
                              </Badge>
                              {task.rewriteStyleName ? (
                                <Badge variant="secondary">
                                  {task.rewriteStyleName}
                                </Badge>
                              ) : null}
                              <Badge variant="outline">
                                {taskSourceTypeLabel(task.sourceType)}
                              </Badge>
                              {task.model ? (
                                <Badge variant="outline">{task.model}</Badge>
                              ) : null}
                              {task.maxTokens ? (
                                <Badge variant="outline">
                                  Max {task.maxTokens}
                                </Badge>
                              ) : null}
                            </div>
                            {task.sourceType === "url" &&
                            isHttpHref(task.sourceUrl) ? (
                              <a
                                href={task.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="line-clamp-2 break-all text-sm font-medium text-foreground hover:underline"
                              >
                                {taskSourceTitle(task)}
                              </a>
                            ) : (
                              <p className="line-clamp-2 break-all text-sm font-medium text-foreground">
                                {taskSourceTitle(task)}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="size-3.5" />
                                创建 {formatTime(task.createdAt)}
                              </span>
                              <span>更新 {formatTime(task.updatedAt)}</span>
                              <span>尝试 {task.attempts} 次</span>
                            </div>
                            <TaskDiagnosticsDisclosure
                              diagnostics={diagnostics}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={task.status} />
                        </TableCell>
                        <TableCell>
                          {isFailed ? (
                            <div className="space-y-2">
                              <TaskFailureMessage error={task.error} />
                              <TaskTokenMeta task={task} />
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <TaskProgress task={task} />
                              <TaskTokenMeta task={task} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {task.postSlug ? (
                            <Link
                              href={`/posts/edit/post/${encodeURIComponent(task.postSlug)}`}
                              className="inline-flex max-w-[260px] items-start gap-2 text-sm font-medium text-primary hover:underline"
                            >
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                              <span className="line-clamp-2">
                                {task.postTitle ??
                                  task.resultTitle ??
                                  "编辑草稿"}
                              </span>
                            </Link>
                          ) : task.resultTitle ? (
                            <span className="inline-flex max-w-[260px] items-start gap-2 text-sm text-muted-foreground">
                              <FileText className="mt-0.5 size-4 shrink-0" />
                              <span className="line-clamp-2">
                                {task.resultTitle}
                              </span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button asChild size="sm" variant="outline">
                              <Link href={`${basePath}/${task.id}`}>详情</Link>
                            </Button>
                            {task.postSlug ? (
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={`/posts/edit/post/${encodeURIComponent(task.postSlug)}`}
                                >
                                  <ExternalLink className="size-4" />
                                  编辑
                                </Link>
                              </Button>
                            ) : null}
                            {isFailed ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={retryingId === task.id}
                                onClick={() => void handleRetry(task.id)}
                              >
                                <RotateCcw className="size-4" />
                                {retryingId === task.id ? "启动中" : "重试"}
                              </Button>
                            ) : null}
                            {task.status === "cancelled" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={retryingId === task.id}
                                onClick={() => void handleRetry(task.id)}
                              >
                                <RotateCcw className="size-4" />
                                {retryingId === task.id ? "恢复中" : "恢复"}
                              </Button>
                            ) : null}
                            {task.status === "pending" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={cancelingId === task.id}
                                onClick={() => void handleCancel(task.id)}
                              >
                                <Ban className="size-4" />
                                {cancelingId === task.id ? "取消中" : "取消"}
                              </Button>
                            ) : null}
                            {task.status === "manual_required" ? (
                              <AiRewriteTaskResolveButton
                                taskId={task.id}
                                size="sm"
                              />
                            ) : null}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    deletingId === task.id ||
                                    task.status === "running"
                                  }
                                  title={
                                    task.status === "running"
                                      ? "处理中任务不能删除"
                                      : "删除任务"
                                  }
                                >
                                  <Trash2 className="size-4" />
                                  {deletingId === task.id ? "删除中" : "删除"}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    删除 AI 任务 #{task.id}？
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    只会删除任务记录和步骤日志，不会删除已经生成的草稿文章。任务删除后无法恢复。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void handleDelete(task)}
                                  >
                                    确定删除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <PaginationComponent
            pageNo={activeFilters.pageNo}
            totalPage={totalPage ?? 1}
          />
        </>
      ) : null}
    </div>
  );
}
