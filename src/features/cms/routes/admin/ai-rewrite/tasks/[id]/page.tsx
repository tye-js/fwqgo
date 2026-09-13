import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { contentToArticleMarkdown } from "@fwqgo/core/content";
import { isHttpHref, parsePostgresIntegerId } from "@fwqgo/core/utils";
import { getAiRewriteTaskDetail } from "@/features/cms/actions/ai-rewrite-task";
import { AffiliateRewriteAudit } from "@/features/cms/components/affiliate-rewrite-audit";
import { AiRewriteAuditViewer } from "@/features/cms/components/ai-rewrite-audit-viewer";
import { ManualArticleTaskEditor } from "@/features/cms/components/manual-article-task-editor";
import { UnifiedTaskActionButtons } from "@/features/cms/components/unified-task-action-buttons";
import { TaskDetailAutoRefresh } from "@/features/cms/components/task-detail-auto-refresh";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ScrapeDiagnostics } from "@/server/scrape/article-scraper";
import { readEnglishTranslationSource } from "@/server/ai/english-translation-source";

type PageProps = { params: Promise<{ id: string }> };
type DetailProps = PageProps & { basePath?: string };
const statusLabels: Record<string, string> = {
  pending: "等待中",
  running: "处理中",
  succeeded: "已保存草稿",
  manual_required: "需人工处理",
  failed: "失败",
  cancelled: "已停止",
  success: "完成",
  skipped: "跳过",
};
const collectionSteps = [
  { key: "source_collect", name: "读取素材" },
  { key: "html_clean", name: "清洗正文" },
  { key: "affiliate_check", name: "替换返利链接" },
  { key: "draft_save", name: "保存草稿" },
];
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function arrayValue<T>(value: unknown, normalize: (value: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(normalize) : [];
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
    if (!isRecord(parsed)) return null;
    return {
      strategy: stringValue(parsed.strategy, "未知规则"),
      affiliateReport: normalizeAffiliateReport(parsed.affiliateReport),
      removedSelectors: arrayValue(parsed.removedSelectors, (item) =>
        stringValue(item),
      ).filter(Boolean),
      removedContentPatterns: arrayValue(
        parsed.removedContentPatterns,
        (item) => stringValue(item),
      ).filter(Boolean),
      warnings: arrayValue(parsed.warnings, (item) => stringValue(item)).filter(
        Boolean,
      ),
    };
  } catch {
    return null;
  }
}
function formatTime(value: Date | string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export async function AiRewriteTaskDetailPageContent({
  params,
  basePath = "/ai-rewrite/tasks",
}: DetailProps) {
  const { id } = await params;
  const taskId = parsePostgresIntegerId(id);
  if (taskId === null) notFound();
  const task = await getAiRewriteTaskDetail(taskId);
  if (!task) notFound();
  const diagnostics = parseDiagnostics(task.diagnostics);
  const englishTask = task.sourceType === "english";
  const translating =
    englishTask && Boolean(readEnglishTranslationSource(task.diagnostics));
  const retiredSeoTask = task.sourceType === "seo";
  const source = task.scrapedHtml ?? task.sourceContent ?? "";
  const sourceMarkdown = contentToArticleMarkdown(source).markdown;
  const latestSteps = task.steps.filter(
    (step) => step.attempt === task.attempts,
  );
  const historicalSteps = task.steps.filter(
    (step) =>
      !collectionSteps.some(({ key }) => key === step.stepKey) &&
      !(englishTask && step.stepKey === "manual_input") &&
      !(translating && step.stepKey.startsWith("english_")),
  );
  const sourceLabels: Record<string, string> = {
    url: "网址",
    text: "文本",
    email: "邮件",
    file: "文件",
    english: translating ? "中文文章翻译" : "历史英文人工编辑",
    seo: "历史 SEO 任务",
  };

  return (
    <AdminPageShell
      badge={englishTask ? "英文版本" : "文章采集"}
      title={
        task.resultTitle ??
        task.scrapedTitle ??
        task.sourceTitle ??
        `任务 #${task.id}`
      }
      description={
        englishTask
          ? translating
            ? "翻译已保存的完整中文文章，保留表格与链接，完成后保存为独立英文草稿。"
            : "历史英文任务保留人工编辑，可从中文文章页发起新的自动翻译。"
          : "清洗正文、替换返利链接后直接保存草稿；正文与 SEO 在草稿箱中编辑。"
      }
      actions={
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={basePath}>
              <ArrowLeft className="size-4" />
              返回
            </Link>
          </Button>
          <UnifiedTaskActionButtons
            type="ai"
            taskId={task.id}
            status={task.status}
            canRetry={
              !retiredSeoTask &&
              (["failed", "cancelled"].includes(task.status) ||
                ((!englishTask || translating) &&
                  task.status === "manual_required"))
            }
            canCancel={task.status === "pending"}
            canResolve={
              task.status === "manual_required" && Boolean(task.postId)
            }
            afterDeleteHref={basePath}
            size="default"
          />
          {task.postSlug ? (
            <Button asChild className="min-h-11">
              <Link
                href={`/posts/edit/post/${encodeURIComponent(task.postSlug)}`}
              >
                打开草稿
              </Link>
            </Button>
          ) : null}
        </div>
      }
    >
      <TaskDetailAutoRefresh
        enabled={task.status === "pending" || task.status === "running"}
      />
      {retiredSeoTask ? (
        <AdminSectionCard
          title="历史任务"
          description="SEO 直接在草稿箱编辑，不再单独排任务。"
        >
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/posts/drafts">前往草稿箱</Link>
          </Button>
        </AdminSectionCard>
      ) : englishTask &&
        !translating &&
        task.status === "manual_required" &&
        !task.postId ? (
        <ManualArticleTaskEditor
          taskId={task.id}
          expectedUpdatedAt={(task.updatedAt ?? task.createdAt).toISOString()}
          sourceMarkdown={sourceMarkdown}
          language="en"
        />
      ) : !englishTask && task.status === "manual_required" && !task.postId ? (
        <AdminSectionCard
          title="旧流程遗留素材"
          description="此任务尚未保存草稿。点击重试即可使用已保存的完整正文，替换返利链接后保存到草稿箱。"
        >
          <p className="text-sm text-muted-foreground">
            保存后可在草稿正文工具栏复制全文。
          </p>
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard
        title="处理流程"
        description={task.currentStep ?? "等待处理"}
      >
        <div className="space-y-4">
          <Progress value={task.progress} />
          <div className="flex flex-wrap gap-2">
            <Badge>{statusLabels[task.status] ?? task.status}</Badge>
            <Badge variant="outline">处理 {task.attempts} 次</Badge>
            <Badge variant="outline">创建 {formatTime(task.createdAt)}</Badge>
            <Badge variant="outline">结束 {formatTime(task.finishedAt)}</Badge>
          </div>
          {task.error ? (
            <p role="alert" className="break-words text-sm text-destructive">
              {task.error}
            </p>
          ) : null}
          {!englishTask && !retiredSeoTask ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {collectionSteps.map(({ key, name }) => {
                const step = latestSteps.find((item) => item.stepKey === key);
                const status =
                  step?.status ??
                  (key === "draft_save" && task.postId ? "success" : "pending");
                return (
                  <div
                    key={key}
                    className="min-w-0 space-y-2 rounded-md border border-border/70 p-3"
                  >
                    <p className="text-sm font-medium">{name}</p>
                    <Badge
                      variant={status === "failed" ? "destructive" : "outline"}
                    >
                      {statusLabels[status] ?? status}
                    </Badge>
                    <p className="break-words text-xs leading-6 text-muted-foreground">
                      {step?.error ??
                        step?.message ??
                        (status === "success" ? "已保存文章" : "等待处理")}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}
          {translating ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["english_translation", "翻译中文正文"],
                ["english_metadata", "英文标题与摘要"],
                ["english_save", "保存英文草稿"],
              ].map(([key, label]) => {
                const step = latestSteps.find((item) => item.stepKey === key);
                return (
                  <div
                    key={key}
                    className="space-y-2 rounded-md border border-border/70 p-3"
                  >
                    <p className="text-sm font-medium">{label}</p>
                    <Badge variant="outline">
                      {statusLabels[step?.status ?? "pending"]}
                    </Badge>
                    <p className="break-words text-xs text-muted-foreground">
                      {step?.message ?? "等待处理"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : englishTask ? (
            <div className="space-y-2 rounded-md border border-border/70 p-3">
              <p className="text-sm font-medium">英文正文与 SEO</p>
              <p className="text-sm text-muted-foreground">
                {latestSteps.find((step) => step.stepKey === "manual_input")
                  ?.message ??
                  task.currentStep ??
                  "等待准备中文来源"}
              </p>
            </div>
          ) : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="来源与结果"
        description="来源正文完整保留，草稿中的后续编辑不会修改来源快照。"
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2 text-sm">
            <p className="text-muted-foreground">
              来源 / {sourceLabels[task.sourceType] ?? task.sourceType}
            </p>
            {isHttpHref(task.sourceUrl) ? (
              <a
                href={task.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 break-all text-primary hover:underline"
              >
                {task.sourceUrl}
                <ExternalLink className="size-4 shrink-0" />
              </a>
            ) : (
              <p className="break-words">
                {task.sourceTitle ?? task.sourceFileName ?? task.sourceUrl}
              </p>
            )}
          </div>
          <div className="space-y-2 text-sm">
            <p>分类：{task.categoryName ?? "-"}</p>
            <p>
              {englishTask ? "来源方式" : "采集策略"}：
              {englishTask
                ? "已保存的中文文章"
                : (diagnostics?.strategy ?? "-")}
            </p>
            <p>来源正文：{sourceMarkdown.length} 字符</p>
            <p>草稿正文：{task.rewriteOutputLength ?? "-"} 字符</p>
          </div>
        </div>
        {diagnostics ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                ...diagnostics.removedSelectors,
                ...diagnostics.removedContentPatterns,
              ].map((item, index) => (
                <Badge key={`${index}-${item}`} variant="outline">
                  已清理：{item}
                </Badge>
              ))}
            </div>
            {diagnostics.warnings.map((warning, index) => (
              <p key={index} className="break-words text-sm text-amber-700">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
      </AdminSectionCard>

      <AdminSectionCard
        title="返利链接替换结果"
        description="保留各套餐购买地址；普通参数只替换配置项，href 模式使用商家配置的完整地址。"
      >
        {diagnostics ? (
          <AffiliateRewriteAudit report={diagnostics.affiliateReport} />
        ) : (
          <p className="text-sm text-muted-foreground">暂无返利诊断</p>
        )}
      </AdminSectionCard>
      <AdminSectionCard
        title={englishTask ? "中文来源正文预览" : "正文预览"}
        description={
          englishTask
            ? translating
              ? "此处保留发起翻译时的中文全文，英文结果不会覆盖中文文章。"
              : "保留中文来源供参考；历史英文任务仍可人工填写并保存。"
            : "清洗后的完整来源正文。替换返利链接后的正文已保存在草稿箱，可在正文工具栏一键复制全文。"
        }
      >
        <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-4 text-xs leading-6">
          {sourceMarkdown || "暂无正文快照"}
        </pre>
      </AdminSectionCard>
      {task.artifacts.length || historicalSteps.length ? (
        <details className="min-w-0 rounded-md border border-border/70 p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-medium">
            {translating ? "英文翻译记录" : "历史 AI 记录"}
          </summary>
          <div className="min-w-0 space-y-4 pt-4">
            {historicalSteps.map((step) => (
              <p
                key={`${step.attempt}-${step.stepKey}`}
                className="break-words text-sm text-muted-foreground"
              >
                第 {step.attempt} 次 · {step.stepName} ·{" "}
                {statusLabels[step.status] ?? step.status}：
                {step.error ?? step.message}
              </p>
            ))}
            {task.artifacts.length ? (
              <AiRewriteAuditViewer artifacts={task.artifacts} />
            ) : null}
          </div>
        </details>
      ) : null}
    </AdminPageShell>
  );
}
export default async function AiRewriteTaskDetailPage({ params }: PageProps) {
  return <AiRewriteTaskDetailPageContent params={params} />;
}
