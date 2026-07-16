import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  Bot,
  CircleDashed,
  Eye,
  FileText,
  Images,
  Languages,
  PackageSearch,
  PenLine,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { getDashboardStats } from "@/features/cms/data/post";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDate } from "@fwqgo/core/utils";

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

type MetricItem = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  href?: string;
  tone?: "neutral" | "attention";
};

function MetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <section
      aria-label="核心指标"
      className="grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium text-muted-foreground">
                {item.label}
              </p>
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  item.tone === "attention"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {item.value}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {item.note}
            </p>
          </>
        );

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className="min-h-[104px] bg-card px-3 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {content}
          </Link>
        ) : (
          <div key={item.label} className="min-h-[104px] bg-card px-3 py-3">
            {content}
          </div>
        );
      })}
    </section>
  );
}

type QueueItemProps = {
  title: string;
  count: number;
  detail: string;
  href: string;
  icon: LucideIcon;
  tone: "critical" | "warning" | "neutral";
};

function QueueItem({
  title,
  count,
  detail,
  href,
  icon: Icon,
  tone,
}: QueueItemProps) {
  const toneClasses = {
    critical: "border-l-destructive text-destructive",
    warning:
      "border-l-amber-600 text-amber-800 dark:border-l-amber-400 dark:text-amber-300",
    neutral: "border-l-muted-foreground/45 text-foreground",
  };

  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-[96px] min-w-0 items-start gap-3 rounded-md border border-l-2 border-border/70 bg-card px-3 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        toneClasses[tone],
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground group-hover:text-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <strong className="shrink-0 text-lg font-semibold tabular-nums">
            {formatNumber(count)}
          </strong>
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {detail}
        </span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

type TrendItem = {
  date: Date;
  createdCount: number;
  publishedCount: number;
};

function ContentTrendChart({ data }: { data: TrendItem[] }) {
  const maxValue = Math.max(
    ...data.flatMap((item) => [item.createdCount, item.publishedCount]),
    1,
  );
  const totalCreated = data.reduce((sum, item) => sum + item.createdCount, 0);
  const totalPublished = data.reduce(
    (sum, item) => sum + item.publishedCount,
    0,
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm bg-muted-foreground/30" />
            新建 {formatNumber(totalCreated)}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm bg-foreground/75" />
            已发布 {formatNumber(totalPublished)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">按创建日期统计</span>
      </div>

      <div
        className="mt-4 grid h-48 grid-cols-7 items-end gap-1.5 sm:gap-3"
        role="img"
        aria-label={`近七日新建 ${totalCreated} 篇，其中已发布 ${totalPublished} 篇`}
      >
        {data.map((item) => {
          const createdHeight = Math.max(
            item.createdCount > 0 ? 5 : 1,
            (item.createdCount / maxValue) * 100,
          );
          const publishedHeight = Math.max(
            item.publishedCount > 0 ? 5 : 1,
            (item.publishedCount / maxValue) * 100,
          );

          return (
            <div
              key={item.date.toISOString()}
              className="flex h-full min-w-0 flex-col items-center"
              title={`${formatDate(item.date)}：新建 ${item.createdCount}，已发布 ${item.publishedCount}`}
            >
              <span className="mb-1 text-[11px] font-medium tabular-nums text-foreground">
                {item.createdCount}/{item.publishedCount}
              </span>
              <div className="flex min-h-0 w-full flex-1 items-end justify-center gap-1">
                <span
                  className="w-2.5 rounded-t-sm bg-muted-foreground/30 sm:w-4"
                  style={{ height: `${createdHeight}%` }}
                />
                <span
                  className="w-2.5 rounded-t-sm bg-foreground/75 sm:w-4"
                  style={{ height: `${publishedHeight}%` }}
                />
              </div>
              <span className="mt-2 text-[11px] tabular-nums text-muted-foreground">
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                }).format(item.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type TaskSummary = {
  total: number;
  active: number;
  succeeded: number;
  failed: number;
  manualRequired: number;
  attention: number;
};

function TaskHealthRow({
  title,
  summary,
  href,
  icon: Icon,
}: {
  title: string;
  summary: TaskSummary;
  href: string;
  icon: LucideIcon;
}) {
  const completedRate =
    summary.total > 0 ? (summary.succeeded / summary.total) * 100 : 0;

  return (
    <Link
      href={href}
      className="group block border-b border-border/60 py-3 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium group-hover:text-primary">
              {title}
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">
              共 {formatNumber(summary.total)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              处理中 <strong className="font-medium">{summary.active}</strong>
            </span>
            <span
              className={summary.attention > 0 ? "text-destructive" : undefined}
            >
              需处理{" "}
              <strong className="font-medium">{summary.attention}</strong>
            </span>
            <span>
              完成 <strong className="font-medium">{summary.succeeded}</strong>
            </span>
          </div>
          <Progress value={completedRate} className="mt-2 h-1.5" />
        </div>
      </div>
    </Link>
  );
}

function LanguageBadge({ language }: { language: string }) {
  return (
    <Badge variant="outline" className="min-w-9 justify-center font-normal">
      {language === "en" ? "EN" : "中文"}
    </Badge>
  );
}

export default async function Page() {
  await connection();

  const data = await getDashboardStats()
    .then((result) => result.data)
    .catch((error: unknown) => {
      console.error("Dashboard data loading failed:", error);
      return null;
    });

  if (!data) {
    return (
      <AdminPageShell
        title="运营看板"
        description="暂时无法读取后台概览数据，请刷新重试。"
      >
        <AdminSectionCard>
          <p className="text-sm text-muted-foreground">
            数据加载失败。请检查数据库连接和后台日志后重试。
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  const {
    overview,
    taskOverview,
    operations,
    contentTrend,
    topViewedPosts,
    recentPosts,
    topCategories,
  } = data;
  const monthLabel = formatMonthLabel(overview.monthStart);
  const englishCoverage =
    overview.zhPublishedPostCount > 0
      ? (overview.enPublishedPostCount / overview.zhPublishedPostCount) * 100
      : 0;
  const topCategoryMax = Math.max(
    ...topCategories.map((category) => category.publishedCount),
    1,
  );
  const totalTaskAttention =
    taskOverview.ai.attention +
    taskOverview.cover.attention +
    taskOverview.offer.attention +
    taskOverview.background.attention;
  const aiAttentionHref =
    taskOverview.ai.manualRequired > 0
      ? "/ai-tasks?type=ai&status=manual_required"
      : "/ai-tasks?type=ai&status=failed";

  return (
    <AdminPageShell
      badge={monthLabel}
      title="运营看板"
      description={`内容、AI 任务和数据资产的实时工作概览 · 更新于 ${formatDateTime(overview.generatedAt)}`}
      actions={
        <>
          <Button asChild variant="secondary" size="sm">
            <Link href="/ai-rewrite/tasks#single-task">
              <Sparkles className="size-4" />
              内容生产
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/posts/drafts">
              <PenLine className="size-4" />
              草稿箱
            </Link>
          </Button>
        </>
      }
    >
      <MetricStrip
        items={[
          {
            label: "已发布文章",
            value: formatNumber(overview.publishedPostCount),
            note: `中文 ${overview.zhPublishedPostCount} · 英文 ${overview.enPublishedPostCount}`,
            icon: FileText,
            href: "/posts/edit",
          },
          {
            label: "草稿库存",
            value: formatNumber(overview.draftPostCount),
            note: `中文 ${overview.zhDraftPostCount} · 英文 ${overview.enDraftPostCount}`,
            icon: PenLine,
            href: "/posts/drafts",
            tone: overview.draftPostCount > 0 ? "attention" : "neutral",
          },
          {
            label: "累计浏览量",
            value: formatNumber(overview.totalViews),
            note: `已发布文章篇均 ${formatNumber(overview.averageViewsPerPublishedPost)} 次`,
            icon: Eye,
          },
          {
            label: "英文内容覆盖",
            value: formatPercent(englishCoverage),
            note: `${overview.enPublishedPostCount}/${overview.zhPublishedPostCount} 篇已发布中文文章`,
            icon: Languages,
            href: "/posts/quality?language=zh",
          },
        ]}
      />

      <section aria-labelledby="priority-queue-title" className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="priority-queue-title" className="text-sm font-semibold">
              优先处理
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              按影响范围聚合需要人工介入的工作。
            </p>
          </div>
          <Badge variant={totalTaskAttention > 0 ? "destructive" : "outline"}>
            {totalTaskAttention > 0
              ? `${totalTaskAttention} 个任务异常`
              : "任务队列正常"}
          </Badge>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <QueueItem
            title="AI 改写需处理"
            count={taskOverview.ai.attention}
            detail={`${taskOverview.ai.manualRequired} 个人工确认 · ${taskOverview.ai.failed} 个失败`}
            href={aiAttentionHref}
            icon={Bot}
            tone={taskOverview.ai.attention > 0 ? "critical" : "neutral"}
          />
          <QueueItem
            title="封面生图失败"
            count={taskOverview.cover.failed}
            detail={`${taskOverview.cover.active} 个处理中 · 可进入任务中心重试`}
            href="/ai-tasks?type=cover&status=failed"
            icon={Images}
            tone={taskOverview.cover.failed > 0 ? "critical" : "neutral"}
          />
          <QueueItem
            title="套餐待审核"
            count={operations.offers.pendingReviewCount}
            detail={`${operations.offers.needsFixCount} 条需修正 · ${operations.offers.visibleCount} 条前台可见`}
            href="/servers/manage?reviewStatus=pending"
            icon={PackageSearch}
            tone={
              operations.offers.pendingReviewCount > 0 ? "warning" : "neutral"
            }
          />
          <QueueItem
            title="内容质量待处理"
            count={overview.contentAttentionCount}
            detail={`${overview.missingCoverCount} 篇缺封面 · ${overview.affiliateAttentionCount} 篇返利待检查`}
            href="/posts/quality"
            icon={PenLine}
            tone={overview.contentAttentionCount > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <AdminSectionCard
          title="近 7 日内容产出"
          description="对比每日新建文章与当前已发布文章，判断内容生产节奏。"
        >
          <ContentTrendChart data={contentTrend} />
          <div className="mt-4 grid grid-cols-2 border-t border-border/60 pt-3 sm:grid-cols-4">
            <div className="pr-2">
              <p className="text-xs text-muted-foreground">本月新建</p>
              <p className="mt-1 text-base font-semibold tabular-nums">
                {formatNumber(overview.monthlyNewPostCount)}
              </p>
            </div>
            <div className="border-l border-border/60 px-2">
              <p className="text-xs text-muted-foreground">本月已发布</p>
              <p className="mt-1 text-base font-semibold tabular-nums">
                {formatNumber(overview.monthlyPublishedPostCount)}
              </p>
            </div>
            <div className="mt-3 border-t border-border/60 pr-2 pt-3 sm:mt-0 sm:border-l sm:border-t-0 sm:px-2 sm:pt-0">
              <p className="text-xs text-muted-foreground">本月新文累计浏览</p>
              <p className="mt-1 text-base font-semibold tabular-nums">
                {formatNumber(overview.monthlyReferenceViews)}
              </p>
            </div>
            <div className="mt-3 border-l border-t border-border/60 px-2 pt-3 sm:mt-0 sm:border-t-0 sm:pt-0">
              <p className="text-xs text-muted-foreground">内容总量</p>
              <p className="mt-1 text-base font-semibold tabular-nums">
                {formatNumber(overview.totalPostCount)}
              </p>
            </div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard
          title="生产链路"
          description="AI、封面、供应商采集和后台 worker 的累计状态。"
        >
          <TaskHealthRow
            title="AI 改写"
            summary={taskOverview.ai}
            href="/ai-tasks?type=ai"
            icon={Bot}
          />
          <TaskHealthRow
            title="封面生图"
            summary={taskOverview.cover}
            href="/ai-tasks?type=cover"
            icon={Images}
          />
          <TaskHealthRow
            title="供应商采集"
            summary={taskOverview.offer}
            href="/ai-tasks?type=offer"
            icon={PackageSearch}
          />
          <TaskHealthRow
            title="后台队列"
            summary={taskOverview.background}
            href="/ai-tasks"
            icon={CircleDashed}
          />

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-3 text-xs">
            <Link
              href="/images/list?filter=unused"
              className="group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-muted-foreground group-hover:text-foreground">
                未使用图片
              </span>
              <strong className="mt-1 block text-base tabular-nums text-foreground">
                {formatNumber(operations.images.unusedCount)}
              </strong>
            </Link>
            <Link
              href="/images/list?filter=missing-alt"
              className="group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-muted-foreground group-hover:text-foreground">
                缺少 Alt
              </span>
              <strong className="mt-1 block text-base tabular-nums text-foreground">
                {formatNumber(operations.images.missingAltCount)}
              </strong>
            </Link>
            <div>
              <span className="text-muted-foreground">图片资产</span>
              <strong className="mt-1 block text-base tabular-nums text-foreground">
                {formatNumber(operations.images.totalCount)}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground">在售套餐</span>
              <strong className="mt-1 block text-base tabular-nums text-foreground">
                {formatNumber(operations.offers.inStockCount)}
              </strong>
            </div>
          </div>
        </AdminSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <AdminSectionCard
          title="内容表现"
          description="累计浏览量最高的已发布文章。"
        >
          <div className="overflow-x-auto">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">排名</TableHead>
                  <TableHead>文章</TableHead>
                  <TableHead className="w-28">分类</TableHead>
                  <TableHead className="w-20">语言</TableHead>
                  <TableHead className="w-24 text-right">浏览量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topViewedPosts.length > 0 ? (
                  topViewedPosts.map((post, index) => (
                    <TableRow key={post.id}>
                      <TableCell className="font-medium tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/posts/edit/post/${encodeURIComponent(post.slug)}`}
                          className="line-clamp-1 max-w-[520px] font-medium underline-offset-4 hover:text-primary hover:underline"
                        >
                          {post.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(post.createdAt)}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.categoryName}
                      </TableCell>
                      <TableCell>
                        <LanguageBadge language={post.language} />
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatNumber(post.views)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      暂无已发布文章。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </AdminSectionCard>

        <AdminSectionCard
          title="分类表现"
          description="按已发布文章量排序，浏览量作为辅助指标。"
        >
          <div className="divide-y divide-border/60">
            {topCategories.length > 0 ? (
              topCategories.map((category, index) => {
                const progress =
                  (category.publishedCount / topCategoryMax) * 100;

                return (
                  <div key={category.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {category.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          #{index + 1} · {formatNumber(category.totalViews)}{" "}
                          次浏览
                        </p>
                      </div>
                      <strong className="shrink-0 text-sm tabular-nums">
                        {formatNumber(category.publishedCount)} 篇
                      </strong>
                    </div>
                    <Progress value={progress} className="mt-2 h-1.5" />
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                暂无分类数据。
              </p>
            )}
          </div>
        </AdminSectionCard>
      </div>

      <AdminSectionCard
        title="最近内容"
        description="最近创建的中文和英文文章，可直接进入编辑。"
      >
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>文章</TableHead>
                <TableHead className="w-32">分类</TableHead>
                <TableHead className="w-20">语言</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-32">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPosts.length > 0 ? (
                recentPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Link
                        href={`/posts/edit/post/${encodeURIComponent(post.slug)}`}
                        className="line-clamp-1 max-w-[720px] font-medium underline-offset-4 hover:text-primary hover:underline"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {post.categoryName}
                    </TableCell>
                    <TableCell>
                      <LanguageBadge language={post.language} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={post.published ? "secondary" : "outline"}>
                        {post.published ? "已发布" : "草稿"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    暂无最近文章。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </AdminSectionCard>

      <div className="sr-only" aria-live="polite">
        {totalTaskAttention > 0 ? (
          <span>当前有 {totalTaskAttention} 个任务需要处理。</span>
        ) : (
          <span>当前任务队列正常。</span>
        )}
      </div>
    </AdminPageShell>
  );
}
