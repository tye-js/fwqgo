import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArrowRight,
  ArrowUpRight,
  Gauge,
  MapPin,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Tags,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  getHomepagePostsWithTags,
  getHomepageSidebarData,
} from "@/features/public/data/post";
import { HeroTagSearch } from "@/features/public/components/hero-tag-search";
import ArticleCard from "@/features/public/components/article-card";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import {
  getLatestServerOffers,
  getServerOfferTopicCounts,
  offerTopics,
} from "@/server/offers/server-offers";
import { getSiteSeoConfig } from "@/features/shared/data/site-seo";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

export async function generateMetadata(): Promise<Metadata> {
  const { data } = await getSiteSeoConfig("zh");

  return {
    title: data.title,
    description: data.description,
    keywords: data.keywords,
    alternates: {
      canonical: getSiteUrl(),
      languages: {
        "zh-CN": getSiteUrl(),
        en: `${getSiteUrl()}/en`,
        "x-default": getSiteUrl(),
      },
    },
    openGraph: {
      title: data.title,
      description: data.description,
      url: getSiteUrl(),
      siteName: data.siteName,
    },
  };
}

type LatestOffer = Awaited<ReturnType<typeof getLatestServerOffers>>[number];

const quickIntentLinks = [
  { label: "香港 CN2", href: "/search?q=香港%20CN2" },
  { label: "香港 CMI", href: "/search?q=香港%20CMI" },
  { label: "美国 VPS", href: "/servers/united-states" },
  { label: "便宜 VPS", href: "/servers/cheap-vps" },
  { label: "独立服务器", href: "/search?q=独立服务器" },
  { label: "优惠码", href: "/search?q=优惠码" },
];

const featureCards: Array<{
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    title: "完整比价工具",
    description: "集中筛选价格、地区、线路、状态、优惠码和购买入口。",
    href: "/servers",
    icon: Gauge,
  },
  {
    title: "香港服务器",
    description: "优先查看 CN2、CMI、BGP 和大陆访问优化套餐。",
    href: "/servers/hong-kong",
    icon: MapPin,
  },
  {
    title: "美国服务器",
    description: "适合外贸建站、海外业务、大带宽和测试环境。",
    href: "/servers/united-states",
    icon: Server,
  },
  {
    title: "便宜 VPS",
    description: "按低价月付和轻量配置快速找到入门方案。",
    href: "/servers/cheap-vps",
    icon: Zap,
  },
];

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatOfferPrice(offer: LatestOffer) {
  if (!offer.priceAmount) return "价格待补充";
  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) return "价格待确认";

  const currency = offer.currency === "CNY" ? "¥" : "$";
  const cycleMap: Record<string, string> = {
    monthly: "月付",
    quarterly: "季付",
    semiannual: "半年",
    yearly: "年付",
  };
  const cycle = offer.billingCycle
    ? (cycleMap[offer.billingCycle] ?? offer.billingCycle)
    : "周期待确认";

  return `${currency}${amount.toFixed(2)} / ${cycle}`;
}

function SmartLink({
  href,
  children,
  className,
}: {
  href: string | null | undefined;
  children: ReactNode;
  className: string;
}) {
  const safeHref = href?.trim();
  if (!safeHref) return null;

  if (isInternalHref(safeHref)) {
    return (
      <Link href={safeHref} prefetch className={className}>
        {children}
      </Link>
    );
  }

  if (isHttpHref(safeHref)) {
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return null;
}

function topValues(values: Array<string | null>, limit = 4) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function FeatureEntryCard({
  title,
  description,
  href,
  icon: Icon,
  count,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  count?: number;
}) {
  return (
    <Link
      href={href}
      prefetch
      className="group rounded-lg border border-border/70 bg-background/90 p-4 shadow-sm transition-colors hover:border-accent/35 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-accent">
          <Icon className="size-5" />
        </span>
        {typeof count === "number" ? (
          <Badge variant="secondary">{formatCount(count)} 个套餐</Badge>
        ) : (
          <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        )}
      </div>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </Link>
  );
}

function OfferPreviewCard({ offer }: { offer: LatestOffer }) {
  const meta = [offer.providerName, offer.region, offer.lineType]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-lg border border-border/70 bg-background p-4 shadow-sm transition-colors hover:border-accent/30 hover:bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{meta || "套餐信息待补充"}</p>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-foreground">
            {offer.title}
          </h3>
        </div>
        <Badge variant="outline" className="shrink-0">
          {offer.status === "in_stock" ? "有货" : "可关注"}
        </Badge>
      </div>
      <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">
        {formatOfferPrice(offer)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <SmartLink
          href={offer.purchaseUrl}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-accent"
        >
          购买入口
          <ArrowUpRight className="size-3.5" />
        </SmartLink>
        <SmartLink
          href={offer.articleUrl}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
        >
          来源文章
          <ArrowRight className="size-3.5" />
        </SmartLink>
      </div>
    </article>
  );
}

function SidebarArticleLink({
  post,
  rank,
}: {
  post: { id: number; title: string; slug: string; description: string | null };
  rank?: number;
}) {
  return (
    <Link
      href={`/fwq/posts/${encodeURIComponent(post.slug)}`}
      prefetch
      className="group flex gap-3 rounded-md border border-border/70 bg-background px-3 py-3 text-sm transition-colors hover:border-accent/30 hover:bg-muted/20"
    >
      {typeof rank === "number" ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
          {rank}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="line-clamp-2 font-medium leading-5 text-foreground underline-offset-4 group-hover:text-accent group-hover:underline">
          {post.title}
        </span>
        {post.description ? (
          <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {post.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

async function HomeContent() {
  await connection();

  const [{ data: posts }, { data: sidebarData }, offerCounts, latestOffers] =
    await Promise.all([
      getHomepagePostsWithTags(),
      getHomepageSidebarData(),
      getServerOfferTopicCounts(),
      getLatestServerOffers(6),
    ]);

  const safePosts = posts ?? [];
  const latestArticles = safePosts.slice(0, 8);
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const popularPosts = sidebarData?.popularPosts ?? [];
  const topProviders = topValues(latestOffers.map((offer) => offer.providerName));
  const topRegions = topValues(latestOffers.map((offer) => offer.region));
  const latestPromoOffers = latestOffers
    .filter((offer) => offer.promoCode)
    .slice(0, 3);
  const totalTopicOffers = offerCounts.reduce((sum, item) => sum + item.count, 0);

  return (
    <main className="flex-1">
      <section className="home-grid-surface relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
        <div className="container relative mx-auto px-4 py-6 md:py-8">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-stretch">
            <div className="rounded-lg border border-border/70 bg-background/88 p-5 shadow-sm backdrop-blur md:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-foreground text-background hover:bg-foreground">
                  FWQGO Intelligence
                </Badge>
                <Badge variant="secondary">服务器优惠入口</Badge>
              </div>
              <h1 className="font-editorial text-gradient mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
                把服务器优惠、测评和套餐数据放到同一个决策入口
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                首页负责快速分发：进入比价工具、专题页、标签搜索和最新文章。完整筛选、排序和购买入口集中放在服务器比价页，减少首屏噪音。
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                  <p className="text-xs text-muted-foreground">结构化套餐</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatCount(totalTopicOffers)}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                  <p className="text-xs text-muted-foreground">专题入口</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {offerTopics.length}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                  <p className="text-xs text-muted-foreground">最新文章</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatCount(safePosts.length)}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild className="h-10 rounded-md bg-foreground px-5 text-background hover:bg-accent">
                  <Link href="/servers" prefetch>
                    打开比价工具
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-10 rounded-md px-5">
                  <Link href="/fwq/vps/page/1" prefetch>
                    浏览推广文章
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>

              <div className="mt-5 rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Search className="size-3.5" />
                  快速筛选
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickIntentLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      className="inline-flex min-h-9 items-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/35 hover:bg-accent/5 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <HeroTagSearch />
              </div>
            </div>

            <aside className="rounded-lg border border-border/70 bg-zinc-950 p-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    <Sparkles className="size-4 text-cyan-300" />
                    今日决策面板
                  </p>
                  <p className="mt-2 text-xs leading-5 text-white/60">
                    少量高价值入口，避免首页变成复杂表格。
                  </p>
                </div>
                <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                  Live
                </Badge>
              </div>

              <div className="mt-5 space-y-3">
                {offerTopics.map((topic) => {
                  const count =
                    offerCounts.find((item) => item.slug === topic.slug)?.count ?? 0;

                  return (
                    <Link
                      key={topic.slug}
                      href={`/servers/${encodeURIComponent(topic.slug)}`}
                      prefetch
                      className="group flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-3 transition-colors hover:border-cyan-300/40 hover:bg-white/[0.07]"
                    >
                      <span>
                        <span className="block text-sm font-medium text-white">
                          {topic.title}
                        </span>
                        <span className="mt-1 block text-xs text-white/55">
                          {topic.shortTitle} · {formatCount(count)} 个套餐
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-white/45 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-300" />
                    </Link>
                  );
                })}
              </div>

              <Separator className="my-5 bg-white/10" />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">精选套餐</p>
                  <Link
                    href="/servers"
                    prefetch
                    className="text-xs text-cyan-200 underline-offset-4 hover:text-white hover:underline"
                  >
                    全部筛选
                  </Link>
                </div>
                {latestOffers.slice(0, 3).map((offer) => (
                  <div
                    key={offer.id}
                    className="rounded-md border border-white/10 bg-white/[0.04] p-3"
                  >
                    <p className="line-clamp-1 text-xs text-white/55">
                      {[offer.providerName, offer.region].filter(Boolean).join(" · ") ||
                        "套餐信息"}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-white">
                      {offer.title}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-cyan-200">
                      {formatOfferPrice(offer)}
                    </p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-accent">
              <ShieldCheck className="size-4" />
              入口分流
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              先选入口，再做深度比较
            </h2>
          </div>
          <Button asChild variant="outline" className="rounded-md">
            <Link href="/servers" prefetch>
              进入完整工具
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((card) => {
            const topic = offerTopics.find((item) => `/servers/${item.slug}` === card.href);
            const count = topic
              ? offerCounts.find((item) => item.slug === topic.slug)?.count
              : undefined;

            return <FeatureEntryCard key={card.href} {...card} count={count} />;
          })}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-8 md:pb-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-accent">
              <Server className="size-4" />
              最新套餐
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              只展示少量精选，完整筛选放在工具页
            </h2>
          </div>
          <Link
            href="/servers"
            prefetch
            className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
          >
            打开全部套餐
          </Link>
        </div>
        {latestOffers.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {latestOffers.map((offer) => (
              <OfferPreviewCard key={offer.id} offer={offer} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            暂无可展示的结构化套餐。
          </div>
        )}
      </section>

      <section className="container mx-auto grid gap-8 px-4 pb-12 xl:grid-cols-[minmax(0,0.82fr)_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-accent">
                <Tags className="size-4" />
                最新内容
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                新发布的优惠、测评和选购文章
              </h2>
            </div>
            <Button asChild variant="outline" className="rounded-md">
              <Link href="/fwq/vps/page/1" prefetch>
                查看文章分类
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          {latestArticles.length > 0 ? (
            latestArticles.map((post) => <ArticleCard key={post.id} post={post} />)
          ) : (
            <Card className="border-dashed border-border/80 bg-muted/20">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                暂无文章内容。
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-sm font-medium text-foreground">热门筛选</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  根据结构化套餐聚合出的商家和地区。
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">热门商家</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {topProviders.length > 0 ? (
                    topProviders.map((item) => (
                      <Badge key={item.name} variant="secondary">
                        {item.name} {item.count}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">暂无数据</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">热门地区</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {topRegions.length > 0 ? (
                    topRegions.map((item) => (
                      <Badge key={item.name} variant="outline">
                        {item.name} {item.count}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">暂无数据</span>
                  )}
                </div>
              </div>
              {latestPromoOffers.length > 0 ? (
                <div>
                  <p className="text-xs text-muted-foreground">最新优惠码</p>
                  <div className="mt-2 space-y-2">
                    {latestPromoOffers.map((offer) => (
                      <SmartLink
                        key={offer.id}
                        href={offer.articleUrl ?? "/servers"}
                        className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-xs transition-colors hover:border-accent/30 hover:bg-muted/30"
                      >
                        <span className="line-clamp-1">
                          {offer.providerName ?? offer.title}
                        </span>
                        <Badge>{offer.promoCode}</Badge>
                      </SmartLink>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">站长推荐</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    近期值得优先查看的内容
                  </p>
                </div>
                <Badge variant="secondary">精选</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {promotedPosts.length > 0 ? (
                  promotedPosts
                    .slice(0, 4)
                    .map((post) => <SidebarArticleLink key={post.id} post={post} />)
                ) : (
                  <p className="rounded-md border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    当前还没有推荐文章。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-foreground">高浏览量文章</p>
              <p className="mt-1 text-xs text-muted-foreground">按累计浏览量排序</p>
              <div className="mt-4 space-y-3">
                {popularPosts.length > 0 ? (
                  popularPosts.slice(0, 5).map((post, index) => (
                    <SidebarArticleLink key={post.id} post={post} rank={index + 1} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">暂无热门文章。</p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Separator />
      <Suspense
        fallback={
          <main className="flex-1 px-4 py-10 text-sm text-muted-foreground">
            正在加载首页内容...
          </main>
        }
      >
        <HomeContent />
      </Suspense>
      <Footer />
    </div>
  );
}
