import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Clock3,
  Eye,
  FilePlus2,
  FileText,
  FolderKanban,
  PenSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { getDashboardStats } from "@/features/cms/data/post";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { connection } from "next/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

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

function MetricPanel({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p>
    </div>
  );
}

function SnapshotCard({
  title,
  value,
  description,
  icon: Icon,
  badge,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}) {
  return (
    <Card className="border-border/70 bg-gradient-to-br from-background to-muted/20">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>{title}</CardDescription>
            <CardTitle className="text-3xl font-semibold tracking-tight">
              {value}
            </CardTitle>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/60 p-2 text-muted-foreground">
            <Icon className="size-5" />
          </div>
        </div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
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
    <div className="space-y-3 rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-sm font-semibold">{value}</span>
      </div>
      <Progress value={progress} className="h-2.5" />
    </div>
  );
}

export default async function Page() {
  await connection();

  const result = await getDashboardStats();
  const data = result.data;

  if (!data) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <Card>
          <CardHeader>
            <CardTitle>数据加载失败</CardTitle>
            <CardDescription>
              暂时无法读取后台概览数据，请稍后刷新重试。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
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
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="relative overflow-hidden rounded-lg border-border/70 bg-background shadow-sm">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,transparent,hsl(var(--primary)/0.06))] lg:block" />
          <CardHeader className="relative gap-5 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary/90 text-primary-foreground">
                内容总览
              </Badge>
              <Badge variant="secondary">{monthLabel}</Badge>
            </div>
            <div className="max-w-2xl space-y-3">
              <CardTitle className="text-3xl font-semibold tracking-tight md:text-4xl">
                内容运营概览
              </CardTitle>
              <CardDescription className="max-w-xl text-sm leading-6 text-muted-foreground">
                汇总发布规模、内容产出、浏览表现和分类分布，进入后台后可以先看趋势，再决定去写新文章还是优化旧内容。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="relative space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricPanel
                title="已发布文章"
                value={formatNumber(overview.publishedPostCount)}
                note="当前站点已对外可见的文章总量。"
                icon={FileText}
              />
              <MetricPanel
                title="累计浏览量"
                value={formatNumber(overview.totalViews)}
                note={`已发布文章累计沉淀 ${formatNumber(
                  overview.averageViewsPerPublishedPost,
                )} 篇均浏览。`}
                icon={Eye}
              />
              <MetricPanel
                title={`${monthLabel}新增`}
                value={formatNumber(overview.monthlyNewPostCount)}
                note="按创建时间统计，本月写入后台的新文章数量。"
                icon={FilePlus2}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/end/posts/create">
                  新建文章
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/end/posts/edit">管理文章</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/end/seo">SEO 管理</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-gradient-to-b from-muted/30 to-background shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">内容健康度</CardTitle>
            <CardDescription>
              用几个简单的比例，快速判断内容库存和本月产出节奏。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <HealthBar
              title="发布占比"
              value={formatPercent(publishRate)}
              progress={publishRate}
              description={`总共 ${formatNumber(totalPosts)} 篇文章，其中 ${formatNumber(
                overview.draftPostCount,
              )} 篇还处于草稿。`}
            />
            <HealthBar
              title="本月发布转化"
              value={
                overview.monthlyNewPostCount > 0
                  ? formatPercent(monthlyPublishRate)
                  : "0%"
              }
              progress={monthlyPublishRate}
              description="衡量本月新建文章里，有多少已经真正发布上线。"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="text-sm text-muted-foreground">草稿库存</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatNumber(overview.draftPostCount)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="text-sm text-muted-foreground">本月浏览参考</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatNumber(overview.monthlyReferenceViews)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SnapshotCard
          title={`${monthLabel}新发文章`}
          value={formatNumber(overview.monthlyPublishedPostCount)}
          description="本月创建且已发布的文章数，更贴近真实对外产出。"
          icon={PenSquare}
        />
        <SnapshotCard
          title={`${monthLabel}浏览量参考`}
          value={formatNumber(overview.monthlyReferenceViews)}
          description="当前系统没有按天浏览日志，这里用本月新增文章的当前累计浏览量作参考。"
          icon={TrendingUp}
          badge="参考口径"
        />
        <SnapshotCard
          title="草稿文章"
          value={formatNumber(overview.draftPostCount)}
          description="适合判断待编辑内容库存是否充足。"
          icon={BarChart3}
        />
        <SnapshotCard
          title="篇均浏览"
          value={formatNumber(overview.averageViewsPerPublishedPost)}
          description="方便快速评估整体内容质量和流量沉淀能力。"
          icon={Sparkles}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>热门文章</CardTitle>
                <CardDescription>
                  浏览量最高的已发布文章，适合优先复盘和做延展内容。
                </CardDescription>
              </div>
              <Badge variant="secondary">Top 5</Badge>
            </div>
            {topArticle ? (
              <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge className="bg-primary/90 text-primary-foreground">
                    当前第一
                  </Badge>
                  <span>{formatDate(topArticle.createdAt)}</span>
                </div>
                <Link
                  href={`/end/posts/edit/post/${topArticle.slug}`}
                  className="mt-3 block text-lg font-semibold leading-7 hover:text-primary"
                >
                  {topArticle.title}
                </Link>
                <div className="mt-4 flex items-center gap-6 text-sm">
                  <div>
                    <p className="text-muted-foreground">累计浏览</p>
                    <p className="mt-1 text-xl font-semibold">
                      {formatNumber(topArticle.views)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">占全部浏览</p>
                    <p className="mt-1 text-xl font-semibold">
                      {overview.totalViews > 0
                        ? formatPercent(
                            (topArticle.views / overview.totalViews) * 100,
                          )
                        : "0%"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文章</TableHead>
                  <TableHead className="w-[140px]">发布时间</TableHead>
                  <TableHead className="w-[120px] text-right">浏览量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topViewedPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Link
                        href={`/end/posts/edit/post/${post.slug}`}
                        className="line-clamp-1 font-medium hover:text-primary"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNumber(post.views)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>分类表现</CardTitle>
            <CardDescription>
              文章数量最多的分类，结合累计浏览量看哪些主题最值得持续投入。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {topCategories.map((category, index) => {
              const progress =
                (category.publishedCount / topCategoryMax) * 100;

              return (
                <div
                  key={category.id}
                  className="rounded-2xl border border-border/70 bg-muted/20 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{category.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        排名 #{index + 1}
                      </p>
                    </div>
                    <FolderKanban className="size-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 space-y-3">
                    <Progress value={progress} className="h-2.5" />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">已发布文章</p>
                        <p className="mt-1 text-lg font-semibold">
                          {formatNumber(category.publishedCount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">累计浏览量</p>
                        <p className="mt-1 text-lg font-semibold">
                          {formatNumber(category.totalViews)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>最近更新</CardTitle>
                <CardDescription>
                  最近创建的文章，方便继续编辑或快速检查发布状态。
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/end/posts/edit">查看全部</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文章</TableHead>
                  <TableHead className="w-[120px]">状态</TableHead>
                  <TableHead className="w-[170px]">创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPosts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <Link
                        href={`/end/posts/edit/post/${post.slug}`}
                        className="line-clamp-1 font-medium hover:text-primary"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={post.published ? "default" : "outline"}>
                        {post.published ? "已发布" : "草稿"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(post.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>统计说明</CardTitle>
            <CardDescription>
              首页数据口径写清楚，方便你之后继续扩展这块看板。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="font-medium text-foreground">已发布文章</p>
              <p className="mt-2 leading-6">
                只统计 `published = true` 的文章，适合用来看站点当前实际内容规模。
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="font-medium text-foreground">{monthLabel}新增文章</p>
              <p className="mt-2 leading-6">
                按文章 `createdAt` 落在本月内统计，不区分是否发布，能更真实反映编辑工作量。
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="font-medium text-foreground">累计浏览量</p>
              <p className="mt-2 leading-6">
                基于文章表里的累计 `views` 求和，是当前系统里最可靠的总流量口径。
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Clock3 className="size-4 text-muted-foreground" />
                <p className="font-medium text-foreground">
                  {monthLabel}浏览量参考
                </p>
              </div>
              <p className="mt-2 leading-6">
                当前系统没有独立的按天浏览日志，所以这里展示的是“本月新增文章目前累计得到的浏览量”，适合作为趋势参考，不等同于严格自然月流量。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
