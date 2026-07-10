import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  BarChart3,
  Clock3,
  FileText,
  FolderKanban,
  PenSquare,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
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
import { formatDate } from "@fwqgo/core/utils";

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function CompactMetric({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
            {value}
          </p>
        </div>
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function HealthBar({
  title,
  value,
  progress,
  description,
}: {
  title: string;
  value: string;
  progress: number;
  description: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/70 bg-muted/15 px-3 py-2.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {value}
        </span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

export default async function Page() {
  await connection();

  const result = await getDashboardStats();
  const data = result.data;

  if (!data) {
    return (
      <AdminPageShell
        title="数据面板"
        description="暂时无法读取后台概览数据，请刷新重试。"
      >
        <AdminSectionCard>
          <p className="text-sm text-muted-foreground">
            数据加载失败。请检查数据库连接、后台日志或稍后再打开此页面。
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  const { overview, topViewedPosts, recentPosts, topCategories } = data;
  const monthLabel = formatMonthLabel(overview.monthStart);
  const totalPosts = overview.publishedPostCount + overview.draftPostCount;
  const publishRate =
    totalPosts > 0 ? (overview.publishedPostCount / totalPosts) * 100 : 0;
  const monthlyPublishRate =
    overview.monthlyNewPostCount > 0
      ? (overview.monthlyPublishedPostCount / overview.monthlyNewPostCount) *
        100
      : 0;
  const topCategoryMax = Math.max(
    ...topCategories.map((category) => category.publishedCount),
    1,
  );
  const topArticle = topViewedPosts[0] ?? null;

  return (
    <AdminPageShell
      badge={monthLabel}
      title="数据面板"
      description="查看内容规模、草稿库存、浏览表现和最近更新，用于判断下一步写作、改写或 SEO 优化重点。"
      actions={
        <>
          <Button asChild variant="secondary" size="sm">
            <Link href="/ai-rewrite/tasks#single-task">
              内容生产
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/posts/edit">文章列表</Link>
          </Button>
        </>
      }
    >
      <AdminSummaryStrip
        items={[
          {
            label: "已发布文章",
            value: formatNumber(overview.publishedPostCount),
            note: "当前站点对外可见内容。",
          },
          {
            label: "累计浏览量",
            value: formatNumber(overview.totalViews),
            note: `篇均 ${formatNumber(overview.averageViewsPerPublishedPost)} 次。`,
          },
          {
            label: `${monthLabel}新增`,
            value: formatNumber(overview.monthlyNewPostCount),
            note: "按创建时间统计的新文章。",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminSectionCard
          title="内容健康度"
          description="用发布占比、草稿库存和本月转化判断内容生产节奏。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <HealthBar
              title="发布占比"
              value={formatPercent(publishRate)}
              progress={publishRate}
              description={`总共 ${formatNumber(totalPosts)} 篇，草稿 ${formatNumber(
                overview.draftPostCount,
              )} 篇。`}
            />
            <HealthBar
              title="本月发布转化"
              value={
                overview.monthlyNewPostCount > 0
                  ? formatPercent(monthlyPublishRate)
                  : "0%"
              }
              progress={monthlyPublishRate}
              description="本月新建文章中已经发布上线的比例。"
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <CompactMetric
              title="本月已发布"
              value={formatNumber(overview.monthlyPublishedPostCount)}
              note="新建且已发布。"
              icon={PenSquare}
            />
            <CompactMetric
              title="本月浏览参考"
              value={formatNumber(overview.monthlyReferenceViews)}
              note="本月新增文章累计浏览。"
              icon={TrendingUp}
            />
            <CompactMetric
              title="草稿库存"
              value={formatNumber(overview.draftPostCount)}
              note="待编辑内容储备。"
              icon={BarChart3}
            />
            <CompactMetric
              title="篇均浏览"
              value={formatNumber(overview.averageViewsPerPublishedPost)}
              note="整体流量沉淀参考。"
              icon={FileText}
            />
          </div>
        </AdminSectionCard>

        <AdminSectionCard
          title="当前热门"
          description="优先复盘高浏览文章，适合扩展专题或更新返利链接。"
        >
          {topArticle ? (
            <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Top 1</Badge>
                <span>{formatDate(topArticle.createdAt)}</span>
              </div>
              <Link
                href={`/posts/edit/post/${encodeURIComponent(topArticle.slug)}`}
                className="mt-3 block text-base font-semibold leading-6 underline-offset-4 hover:text-primary hover:underline"
              >
                {topArticle.title}
              </Link>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">累计浏览</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatNumber(topArticle.views)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">占全部浏览</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {overview.totalViews > 0
                      ? formatPercent(
                          (topArticle.views / overview.totalViews) * 100,
                        )
                      : "0%"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无热门文章数据。</p>
          )}
        </AdminSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminSectionCard
          title="热门文章"
          description="浏览量最高的已发布文章。"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文章</TableHead>
                <TableHead className="w-[140px]">发布时间</TableHead>
                <TableHead className="w-[120px] text-right">浏览量</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topViewedPosts.length > 0 ? (
                topViewedPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Link
                        href={`/posts/edit/post/${encodeURIComponent(post.slug)}`}
                        className="line-clamp-1 font-medium underline-offset-4 hover:text-primary hover:underline"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNumber(post.views)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-20 text-center text-sm text-muted-foreground"
                  >
                    暂无热门文章。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </AdminSectionCard>

        <AdminSectionCard
          title="分类表现"
          description="按已发布文章数排序，辅助判断主题投入方向。"
        >
          <div className="space-y-3">
            {topCategories.length > 0 ? (
              topCategories.map((category, index) => {
                const progress =
                  (category.publishedCount / topCategoryMax) * 100;

                return (
                  <div
                    key={category.id}
                    className="rounded-md border border-border/70 bg-muted/20 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {category.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          排名 #{index + 1}
                        </p>
                      </div>
                      <FolderKanban className="size-4 text-muted-foreground" />
                    </div>
                    <Progress value={progress} className="mt-3 h-2" />
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          已发布文章
                        </p>
                        <p className="mt-1 font-semibold tabular-nums">
                          {formatNumber(category.publishedCount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          累计浏览量
                        </p>
                        <p className="mt-1 font-semibold tabular-nums">
                          {formatNumber(category.totalViews)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">暂无分类数据。</p>
            )}
          </div>
        </AdminSectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <AdminSectionCard title="最近更新" description="最近创建的文章。">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文章</TableHead>
                <TableHead className="w-[120px]">状态</TableHead>
                <TableHead className="w-[160px]">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPosts.length > 0 ? (
                recentPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Link
                        href={`/posts/edit/post/${encodeURIComponent(post.slug)}`}
                        className="line-clamp-1 font-medium underline-offset-4 hover:text-primary hover:underline"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={post.published ? "secondary" : "outline"}>
                        {post.published ? "已发布" : "草稿"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-20 text-center text-sm text-muted-foreground"
                  >
                    暂无最近文章。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </AdminSectionCard>

        <AdminSectionCard
          title="统计说明"
          description="当前看板的数据口径。"
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
              <p className="font-medium text-foreground">已发布文章</p>
              <p className="mt-1 leading-6">
                只统计 published = true 的文章，用来看站点实际内容规模。
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
              <p className="font-medium text-foreground">{monthLabel}新增文章</p>
              <p className="mt-1 leading-6">
                按文章 createdAt 落在本月内统计，不区分是否发布。
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-muted-foreground" />
                <p className="font-medium text-foreground">
                  {monthLabel}浏览量参考
                </p>
              </div>
              <p className="mt-1 leading-6">
                当前没有独立按天浏览日志，所以这里展示本月新增文章目前累计得到的浏览量。
              </p>
            </div>
          </div>
        </AdminSectionCard>
      </div>
    </AdminPageShell>
  );
}
