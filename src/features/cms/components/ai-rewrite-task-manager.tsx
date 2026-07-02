"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  RotateCcw,
} from "lucide-react";

import {
  createAiRewriteTaskAction,
  retryAiRewriteTaskAction,
} from "@/features/cms/actions/ai-rewrite-task";
import { AiRewriteTaskResolveButton } from "@/features/cms/components/ai-rewrite-task-resolve-button";
import { type getAiRewriteTaskList } from "@/features/cms/actions/ai-rewrite-task";
import { type ScrapeDiagnostics } from "@fwqgo/scrape/article-scraper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { AdminTableEmpty } from "@/features/cms/components/admin-table-workbench";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

const statusLabels: Record<string, string> = {
  pending: "等待中",
  running: "处理中",
  succeeded: "已完成",
  manual_required: "需人工处理",
  failed: "失败",
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
};

function formatTime(value: Date | string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

    return parsed as ScrapeDiagnostics;
  } catch {
    return null;
  }
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
          className="h-8 px-2 text-xs text-muted-foreground"
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
  onRetry,
}: {
  tasks: RewriteTask[];
  retryingId: number | null;
  onRetry: (taskId: number) => void;
}) {
  const failedTasks = tasks.filter((task) => task.status === "failed").slice(0, 4);

  if (failedTasks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
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
              <a
                href={task.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-xs text-muted-foreground hover:text-primary"
              >
                {task.sourceUrl}
              </a>
              <p className="text-xs text-muted-foreground">
                {formatTime(task.updatedAt)} · 尝试 {task.attempts} 次
              </p>
            </div>
            <TaskFailureMessage error={task.error} />
            <div className="flex items-center justify-end gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/end/ai-rewrite/tasks/${task.id}`}>详情</Link>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function countSubmittedUrls(formData: FormData) {
  const sourceType = formData.get("sourceType");
  if (sourceType === "text" || sourceType === "email" || sourceType === "file") {
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
  };

  return labels[value] ?? value;
}

function taskSourceTitle(task: RewriteTask) {
  if (task.sourceType === "url") {
    return task.sourceUrl;
  }

  return task.sourceTitle ?? task.sourceUrl;
}

function AffiliateDiagnosticsSummary({
  diagnostics,
}: {
  diagnostics: ScrapeDiagnostics | null;
}) {
  const report = diagnostics?.affiliateReport;

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
          <Badge variant={diagnostics.usedAiRewrite ? "secondary" : "destructive"}>
            {diagnostics.usedAiRewrite ? "AI 已改写" : "AI 回退"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-border/70 p-2">
            <p className="text-muted-foreground">链接</p>
            <p className="mt-1 font-medium text-foreground">{report.totalLinks}</p>
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
              className="h-8 px-2 text-xs text-muted-foreground"
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
              <p className="font-medium text-foreground">未配置返利的外链域名</p>
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
}: {
  tasks: RewriteTask[];
  categories: Option[];
  rewriteStyles: RewriteStyleOption[];
}) {
  const router = useRouter();
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [sourceType, setSourceType] = useState("url");
  const defaultCategoryId = categories[0]?.id ? String(categories[0].id) : "";
  const defaultRewriteStyleId = useMemo(
    () => rewriteStyles.find((style) => style.isDefault)?.id ?? rewriteStyles[0]?.id,
    [rewriteStyles],
  );
  const hasActiveTask = tasks.some((task) =>
    ["pending", "running"].includes(task.status),
  );

  useEffect(() => {
    if (!hasActiveTask) return;

    const interval = window.setInterval(() => {
      router.refresh();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [hasActiveTask, router]);

  function handleSubmit(formData: FormData) {
    startSubmitTransition(async () => {
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
    });
  }

  async function handleRetry(taskId: number) {
    setRetryingId(taskId);
    const result = await retryAiRewriteTaskAction(taskId);
    setRetryingId(null);

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
  }

  return (
    <div className="space-y-5">
      <form
        action={handleSubmit}
        encType="multipart/form-data"
        className="grid gap-3 rounded-lg border border-border/70 bg-background p-4 shadow-sm lg:grid-cols-[150px_minmax(0,1fr)_180px_180px_auto]"
      >
        <Select name="sourceType" value={sourceType} onValueChange={setSourceType}>
          <SelectTrigger className="min-h-11">
            <SelectValue placeholder="素材类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="url">网址</SelectItem>
            <SelectItem value="text">手动文本</SelectItem>
            <SelectItem value="email">邮件素材</SelectItem>
            <SelectItem value="file">文件导入</SelectItem>
          </SelectContent>
        </Select>
        <div className="space-y-2">
          {sourceType === "url" ? (
            <Textarea
              name="sourceUrls"
              placeholder="输入要采集并改写的文章 URL，支持一行一个批量提交"
              required
              className="min-h-11 lg:min-h-11"
            />
          ) : sourceType === "file" ? (
            <>
              <Input
                name="sourceTitle"
                placeholder="素材标题，可留空使用文件名"
                className="min-h-11"
              />
              <Input
                name="sourceFile"
                type="file"
                accept=".txt,.md,.markdown,.html,.htm,.csv,text/plain,text/markdown,text/html,text/csv"
                required
                className="min-h-11"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                支持 txt、md、html、csv，单个文件不超过 2MB。导入后会清洗、替换返利链接并改写为草稿。
              </p>
            </>
          ) : (
            <>
              <Input
                name="sourceTitle"
                placeholder={sourceType === "email" ? "邮件标题" : "素材标题"}
                required
                className="min-h-11"
              />
              <Textarea
                name="sourceContent"
                placeholder={
                  sourceType === "email"
                    ? "粘贴邮件正文，系统会清洗、替换返利链接并改写为草稿"
                    : "粘贴活动文案、商家素材或配置表，系统会改写为草稿"
                }
                required
                className="min-h-28"
              />
            </>
          )}
        </div>
        <Select name="categoryId" defaultValue={defaultCategoryId} required>
          <SelectTrigger className="min-h-11">
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
        <Select
          name="rewriteStyleId"
          defaultValue={
            defaultRewriteStyleId ? String(defaultRewriteStyleId) : undefined
          }
          disabled={rewriteStyles.length === 0}
        >
          <SelectTrigger className="min-h-11">
            <SelectValue
              placeholder={rewriteStyles.length > 0 ? "改写风格" : "未配置 AI"}
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
        <Button
          type="submit"
          disabled={isSubmitting || categories.length === 0}
          className="min-h-11"
        >
          {isSubmitting ? "加入中..." : "采集并改写"}
        </Button>
      </form>

      <FailedTaskPanel
        tasks={tasks}
        retryingId={retryingId}
        onRetry={(taskId) => void handleRetry(taskId)}
      />

      <div className="rounded-lg border border-border/70 bg-background shadow-sm">
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
                    className={isFailed ? "bg-destructive/5 align-top" : "align-top"}
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
                        </div>
                        {task.sourceType === "url" ? (
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
                        <TaskDiagnosticsDisclosure diagnostics={diagnostics} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={task.status} />
                    </TableCell>
                    <TableCell>
                      {isFailed ? (
                        <TaskFailureMessage error={task.error} />
                      ) : (
                        <TaskProgress task={task} />
                      )}
                    </TableCell>
                    <TableCell>
                      {task.postSlug ? (
                        <Link
                          href={`/end/posts/edit/post/${task.postSlug}`}
                          className="inline-flex max-w-[260px] items-start gap-2 text-sm font-medium text-primary hover:underline"
                        >
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                          <span className="line-clamp-2">
                            {task.postTitle ?? task.resultTitle ?? "编辑草稿"}
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
                          <Link href={`/end/ai-rewrite/tasks/${task.id}`}>
                            详情
                          </Link>
                        </Button>
                        {task.postSlug ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/end/posts/edit/post/${task.postSlug}`}>
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
                        {task.status === "manual_required" ? (
                          <AiRewriteTaskResolveButton
                            taskId={task.id}
                            size="sm"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
