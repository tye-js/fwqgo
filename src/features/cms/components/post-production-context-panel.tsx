"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  Languages,
  RotateCcw,
} from "lucide-react";

import { enqueueEnglishVersionForPostAction } from "@/features/cms/actions/ai-rewrite-task";
import { AffiliateRewriteAudit } from "@/features/cms/components/affiliate-rewrite-audit";
import { AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";
import { type AffiliateRewriteReport } from "@fwqgo/scrape/affiliate-link-rewriter";
import { type getPostProductionContext } from "@/features/cms/data/post";

type ProductionContext = NonNullable<
  Awaited<ReturnType<typeof getPostProductionContext>>
>;

const statusLabels: Record<string, string> = {
  pending: "等待中",
  running: "处理中",
  succeeded: "已完成",
  manual_required: "需人工处理",
  failed: "失败",
  cancelled: "已取消",
  success: "成功",
  skipped: "跳过",
};

const statusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  running: "secondary",
  succeeded: "default",
  success: "default",
  manual_required: "secondary",
  failed: "destructive",
  cancelled: "outline",
  skipped: "outline",
};

function formatTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeAffiliateReport(value: unknown): AffiliateRewriteReport | null {
  const report = isRecord(value) ? value : null;
  if (!report) {
    return null;
  }

  const matchedSource = Array.isArray(report.matchedLinks)
    ? report.matchedLinks
    : [];
  const unmatchedSource = Array.isArray(report.unmatchedLinks)
    ? report.unmatchedLinks
    : [];
  const invalidSource = Array.isArray(report.invalidLinks)
    ? report.invalidLinks
    : [];

  if (
    matchedSource.length === 0 &&
    unmatchedSource.length === 0 &&
    invalidSource.length === 0
  ) {
    return null;
  }

  return {
    totalLinks: numberValue(report.totalLinks),
    internalLinksRemoved: numberValue(report.internalLinksRemoved),
    matchedLinks: matchedSource.map((item) => {
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
    }),
    unmatchedLinks: unmatchedSource.map((item) => {
      const miss = isRecord(item) ? item : {};
      return {
        href: stringValue(miss.href),
        host: typeof miss.host === "string" ? miss.host : null,
        reason: "no-provider" as const,
      };
    }),
    invalidLinks: invalidSource.map((item) => {
      const miss = isRecord(item) ? item : {};
      return {
        href: stringValue(miss.href),
        host: typeof miss.host === "string" ? miss.host : null,
        reason: "invalid-url" as const,
      };
    }),
  };
}

function parseAffiliateReviewDetails(value: string | null) {
  if (!value) {
    return { report: null, summary: null };
  }

  try {
    const parsed: unknown = JSON.parse(value);
    const source = isRecord(parsed) && isRecord(parsed.report)
      ? parsed.report
      : parsed;
    return {
      report: normalizeAffiliateReport(source),
      summary: isRecord(parsed) ? parsed : null,
    };
  } catch {
    return { report: null, summary: null };
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusVariants[status] ?? "outline"}>
      {statusLabels[status] ?? status}
    </Badge>
  );
}

function RegenerateEnglishButton({ postId }: { postId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await enqueueEnglishVersionForPostAction(postId);
          if (result.error) {
            notifyError({
              title: "英文生成任务创建失败",
              description: describeAdminResult([
                result.error,
                "请确认中文文章正文和 AI 改写配置可用",
              ]),
            });
            return;
          }

          if (!result.data) {
            notifyError({
              title: "英文生成任务创建失败",
              description: "服务端没有返回任务 ID，请刷新后重试。",
            });
            return;
          }

          notifySuccess({
            title: "英文生成任务已加入队列",
            description: describeAdminResult([
              `任务 ID ${result.data.taskId}`,
              "会从当前中文文章正文翻译英文，并单独生成 SEO 字段",
            ]),
          });
          router.refresh();
        });
      }}
    >
      <RotateCcw className="size-4" />
      {isPending ? "提交中..." : "重新生成英文"}
    </Button>
  );
}

function relationshipTarget(context: ProductionContext) {
  if (context.currentPost.language === "en") {
    return context.sourcePost;
  }

  return context.translations.find((post) => post.language === "en") ?? null;
}

export function PostProductionContextPanel({
  context,
}: {
  context: ProductionContext;
}) {
  const relatedPost = relationshipTarget(context);
  const affiliateReview = parseAffiliateReviewDetails(
    context.currentPost.affiliateReviewDetails,
  );
  const hasSeo = Boolean(
    context.currentPost.description ?? context.currentPost.keywords,
  );

  return (
    <div className="space-y-4">
      <AdminSectionCard
        title="生产链路与中英文关系"
        description="查看当前文章对应关系、最近 AI 任务、SEO、封面图和返利审计状态。"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-3">
            <div className="rounded-md border border-border/70 bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">文章语言关系</p>
                  <p className="text-xs text-muted-foreground">
                    当前为{" "}
                    {context.currentPost.language === "en"
                      ? "英文文章"
                      : "中文文章"}
                  </p>
                </div>
                <Badge variant="outline">
                  {context.currentPost.language === "en" ? "EN" : "ZH"}
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                {relatedPost ? (
                  <Link
                    href={`/posts/edit/post/${relatedPost.slug}`}
                    className="flex items-start gap-2 rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <Languages className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {context.currentPost.language === "en"
                          ? "对应中文"
                          : "对应英文"}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {relatedPost.title}
                      </span>
                    </span>
                    <ExternalLink className="mt-0.5 size-4 shrink-0" />
                  </Link>
                ) : (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
                    <div className="flex gap-2">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {context.currentPost.language === "en"
                          ? "缺少中文来源文章，无法确认翻译关系。"
                          : "还没有对应英文文章。"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {context.currentPost.language === "zh" ||
                context.sourcePost ? (
                  <RegenerateEnglishButton
                    postId={context.sourcePost?.id ?? context.currentPost.id}
                  />
                ) : null}
                <Button asChild size="sm" variant="outline">
                  <Link href="/ai-tasks">打开 AI 任务中心</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border/70 bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4 text-primary" />
                  SEO 字段
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {hasSeo
                    ? `摘要 ${context.currentPost.description?.length ?? 0} 字，关键词 ${context.currentPost.keywords ?? "-"}`
                    : "摘要或关键词为空，建议补全后再发布。"}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ImageIcon className="size-4 text-primary" />
                  封面图
                </div>
                <p className="mt-2 break-all text-xs leading-5 text-muted-foreground">
                  {context.currentPost.imgUrl ?? "暂无封面图"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border/70 bg-background p-3">
              <p className="text-sm font-medium">最近 AI 任务</p>
              <div className="mt-3 space-y-2">
                {context.recentTasks.length > 0 ? (
                  context.recentTasks.slice(0, 5).map((task) => (
                    <Link
                      key={task.id}
                      href={`/ai-tasks/${task.id}`}
                      className="block rounded-md border border-border/70 px-3 py-2 hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            #{task.id}
                          </span>
                          <StatusBadge status={task.status} />
                          <Badge variant="outline">{task.sourceType}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(task.updatedAt ?? task.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {task.currentStep ?? task.error ?? task.resultTitle ?? "-"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline">{task.model ?? "未记录模型"}</Badge>
                        <Badge variant="outline">Max {task.maxTokens ?? "-"}</Badge>
                        <Badge variant="outline">
                          输入 {task.aiInputLength ?? "-"}
                        </Badge>
                        <Badge variant="outline">
                          输出 {task.rewriteOutputLength ?? "-"}
                        </Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    暂无关联 AI 任务。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-border/70 bg-background p-3">
              <p className="text-sm font-medium">最近封面任务</p>
              <div className="mt-3 space-y-2">
                {context.coverTasks.length > 0 ? (
                  context.coverTasks.slice(0, 4).map((task) => (
                    <div
                      key={task.id}
                      className="rounded-md border border-border/70 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">#{task.id}</span>
                        <StatusBadge status={task.status} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {task.errorTitle ??
                          task.outputUrl ??
                          task.title ??
                          "等待生成"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    暂无封面生成任务。
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="返利链接替换审计"
        description="发布前检查或手动替换后，会在这里看到命中商家、返利参数和替换前后链接。"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={context.currentPost.affiliateReviewStatus} />
            <Badge variant="outline">
              更新时间 {formatTime(context.currentPost.affiliateReviewUpdatedAt)}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link href="/collect/aff-man">补返利规则</Link>
            </Button>
          </div>

          {affiliateReview.report ? (
            <AffiliateRewriteAudit report={affiliateReview.report} />
          ) : affiliateReview.summary ? (
            <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
              <p>
                总链接 {numberValue(affiliateReview.summary.totalLinks)}，
                命中 {numberValue(affiliateReview.summary.matchedCount)}，
                未命中 {numberValue(affiliateReview.summary.unmatchedCount)}，
                无效 {numberValue(affiliateReview.summary.invalidCount)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              暂无保存的返利审计记录。可以先点击正文编辑区的“替换返利链接”，或在发布时触发检查。
            </p>
          )}
        </div>
      </AdminSectionCard>
    </div>
  );
}
