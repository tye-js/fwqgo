import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  Gauge,
  MapPin,
  Server,
  Store,
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
import {
  HomepagePrimaryPromotion,
  HomepagePromotionGrid,
  HomepageSidebarPromotions,
} from "@/features/public/components/homepage-promotion-slots";
import {
  FeaturedOfferList,
  type FeaturedOffer,
} from "@/features/public/components/featured-offer-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import {
  getLatestServerOffers,
  getPublicServerOfferCount,
  getServerOfferTopicCounts,
  offerTopics,
} from "@/server/offers/server-offers";
import { getSiteSeoConfig } from "@/features/shared/data/site-seo";
import { getActiveHomepageSlots } from "@/server/homepage/homepage-slots";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
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

const quickIntentLinks = [
  { label: "香港 CN2", href: "/search?q=香港%20CN2" },
  { label: "香港 CMI", href: "/search?q=香港%20CMI" },
  { label: "美国 VPS", href: "/servers/united-states" },
  { label: "便宜 VPS", href: "/servers/cheap-vps" },
  { label: "独立服务器", href: "/search?q=独立服务器" },
  { label: "优惠码", href: "/search?q=优惠码" },
];

const compareEntries: Array<{
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  topicSlug?: string;
}> = [
  {
    title: "服务器比价",
    description: "按价格、地区、线路、状态和优惠码筛选全部套餐。",
    href: "/servers",
    icon: Gauge,
  },
  {
    title: "香港服务器",
    description: "CN2、CMI、BGP 线路，大陆访问延迟低。",
    href: "/servers/hong-kong",
    icon: MapPin,
    topicSlug: "hong-kong",
  },
  {
    title: "美国服务器",
    description: "外贸建站、大带宽和海外业务首选。",
    href: "/servers/united-states",
    icon: Server,
    topicSlug: "united-states",
  },
  {
    title: "便宜 VPS",
    description: "低价月付、轻量配置，适合测试和入门。",
    href: "/servers/cheap-vps",
    icon: Zap,
    topicSlug: "cheap-vps",
  },
];

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function topValues(values: Array<string | null>, limit = 5) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function PromoCodeLink({ offer }: { offer: FeaturedOffer }) {
  const providerName = offer.providerName?.trim();
  const articleHref = offer.articleUrl?.trim();
  const label = providerName?.length ? providerName : offer.title;
  const href = articleHref?.length ? articleHref : "/servers";
  const className =
    "flex min-h-11 items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const content = (
    <>
      <span className="min-w-0 truncate text-foreground">{label}</span>
      <Badge className="shrink-0 bg-primary/10 font-mono text-primary hover:bg-primary/10">
        {offer.promoCode}
      </Badge>
    </>
  );

  if (isInternalHref(href)) {
    return (
      <Link href={href} prefetch className={className}>
        {content}
      </Link>
    );
  }

  if (isHttpHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
      </a>
    );
  }

  return null;
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
      className="group flex gap-3 rounded-md border border-border/70 bg-background px-3 py-3 text-sm transition-colors hover:border-primary/35 hover:bg-muted/30"
    >
      {typeof rank === "number" ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-muted text-xs font-semibold text-muted-foreground">
          {rank}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="line-clamp-2 font-medium leading-5 text-foreground underline-offset-4 group-hover:text-primary group-hover:underline">
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

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

async function HomeContent() {
  await connection();
  const [
    { data: posts },
    { data: sidebarData },
    offerCounts,
    latestOffers,
    totalOfferCount,
    homepageSlots,
  ] = await Promise.all([
    getHomepagePostsWithTags(),
    getHomepageSidebarData(),
    getServerOfferTopicCounts(),
    getLatestServerOffers(24),
    getPublicServerOfferCount(),
    getActiveHomepageSlots("zh"),
  ]);

  const safePosts = posts ?? [];
  const latestArticles = safePosts.slice(0, 8);
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const popularPosts = sidebarData?.popularPosts ?? [];
  const heroPrimarySlot = homepageSlots.find(
    (slot) => slot.placement === "hero_primary",
  );
  const promoGridSlots = homepageSlots.filter(
    (slot) => slot.placement === "promo_grid",
  );
  const sidebarSlots = homepageSlots.filter(
    (slot) => slot.placement === "sidebar",
  );
  const configuredFeaturedOffers: FeaturedOffer[] = homepageSlots
    .filter(
      (slot) =>
        slot.placement === "featured_offers" &&
        slot.contentType === "offer" &&
        slot.offerId &&
        slot.offerTitle,
    )
    .map((slot) => ({
      id: slot.offerId!,
      title: slot.offerTitle!,
      providerName: slot.offerProviderName,
      region: slot.offerRegion,
      lineType: slot.offerLineType,
      priceAmount: slot.offerPriceAmount,
      currency: slot.offerCurrency,
      billingCycle: slot.offerBillingCycle,
      promoCode: slot.offerPromoCode,
      purchaseUrl: slot.resolvedTargetUrl ?? slot.offerPurchaseUrl,
      articleUrl: slot.offerArticleUrl,
      status: slot.offerStatus ?? "in_stock",
    }));
  const featuredOffers =
    configuredFeaturedOffers.length > 0
      ? configuredFeaturedOffers.slice(0, 6)
      : latestOffers.slice(0, 6);
  const promoOffers = latestOffers
    .filter((offer) => offer.promoCode?.trim())
    .slice(0, 4);
  const topProviders = topValues(
    latestOffers.map((offer) => offer.providerName),
  );
  const topRegions = topValues(latestOffers.map((offer) => offer.region));
  const latestOfferUpdatedAt = latestOffers
    .map((offer) => offer.updatedAt ?? offer.createdAt)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return (
    <main className="flex-1">
      {/* 首屏：搜索 + 比价入口 + 真实侧栏模块 */}
      <section className="home-grid-surface border-b border-border/60">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/5 text-primary"
                >
                  服务器优惠 · 套餐比价
                </Badge>
                {totalOfferCount > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    已收录 {formatCount(totalOfferCount)} 个可购买套餐
                    {latestOfferUpdatedAt
                      ? ` · 更新于 ${formatDate(latestOfferUpdatedAt)}`
                      : ""}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
                找服务器优惠，先比价再下单
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                汇总 VPS、云服务器和独立服务器的价格、地区、线路、库存与优惠码，
                每个套餐都保留购买入口和来源文章。
              </p>

              <div className="mt-5 max-w-2xl">
                <HeroTagSearch />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  快速筛选
                </span>
                {quickIntentLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9 md:px-3"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            {heroPrimarySlot ? (
              <HomepagePrimaryPromotion slot={heroPrimarySlot} />
            ) : (
              <aside className="min-w-0 space-y-4 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <BadgePercent className="size-4 text-primary" />
                    最新优惠码
                  </p>
                  <div className="mt-3 space-y-2">
                    {promoOffers.length > 0 ? (
                      promoOffers.map((offer) => (
                        <PromoCodeLink key={offer.id} offer={offer} />
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-4 text-xs leading-5 text-muted-foreground">
                        暂无带优惠码的套餐，可以先打开比价工具查看全部优惠。
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Store className="size-4 text-primary" />
                    热门商家
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topProviders.length > 0 ? (
                      topProviders.map((name) => (
                        <Link
                          key={name}
                          href={`/servers/providers/${encodeURIComponent(name)}`}
                          prefetch
                          className="inline-flex min-h-11 items-center rounded-md border border-border bg-muted/40 px-2.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:text-primary md:min-h-8"
                        >
                          {name}
                        </Link>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        暂无数据
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MapPin className="size-4 text-primary" />
                    热门地区
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topRegions.length > 0 ? (
                      topRegions.map((name) => (
                        <Link
                          key={name}
                          href={`/servers/regions/${encodeURIComponent(name)}`}
                          prefetch
                          className="inline-flex min-h-11 items-center rounded-md border border-border bg-muted/40 px-2.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:text-primary md:min-h-8"
                        >
                          {name}
                        </Link>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        暂无数据
                      </span>
                    )}
                  </div>
                </div>
              </aside>
            )}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {compareEntries.map((entry) => {
              const Icon = entry.icon;
              const count = entry.topicSlug
                ? offerCounts.find((item) => item.slug === entry.topicSlug)
                    ?.count
                : totalOfferCount;

              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  prefetch
                  className="group rounded-lg border border-border/70 bg-background p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    {typeof count === "number" && count > 0 ? (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatCount(count)} 个套餐
                      </span>
                    ) : (
                      <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                    )}
                  </div>
                  <h2 className="mt-3 text-base font-semibold text-foreground group-hover:text-primary">
                    {entry.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {entry.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {promoGridSlots.length > 0 ? (
        <section className="container mx-auto px-4 pt-8 md:pt-10">
          <div className="mb-4">
            <SectionHeading
              title="特别推荐"
              description="当前活动、精选文章和站内重点内容。"
            />
          </div>
          <HomepagePromotionGrid slots={promoGridSlots} />
        </section>
      ) : null}

      {/* 精选套餐：少量展示，完整筛选在 /servers */}
      <section className="container mx-auto px-4 py-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <SectionHeading
            title="最新精选套餐"
            description="价格、地区、线路和购买入口一眼可比，下单前请以商家结算页为准。"
          />
          <Button asChild variant="outline" size="sm" className="rounded-md">
            <Link href="/servers" prefetch>
              打开比价工具
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <FeaturedOfferList offers={featuredOffers} />
      </section>

      {/* 最新文章 + 侧栏 */}
      <section className="container mx-auto grid gap-8 px-4 pb-12 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              title="最新优惠与测评"
              description="新发布的服务器优惠、测评和选购指南。"
            />
            <Button asChild variant="outline" size="sm" className="rounded-md">
              <Link href="/fwq/page/1" prefetch>
                全部文章
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          {latestArticles.length > 0 ? (
            latestArticles.map((post) => (
              <ArticleCard key={post.id} post={post} />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              暂无文章内容。
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">站长推荐</p>
              <Badge variant="secondary">精选</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {sidebarSlots.length > 0 ? (
                <HomepageSidebarPromotions slots={sidebarSlots} />
              ) : promotedPosts.length > 0 ? (
                promotedPosts
                  .slice(0, 4)
                  .map((post) => (
                    <SidebarArticleLink key={post.id} post={post} />
                  ))
              ) : (
                <p className="rounded-md border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  当前还没有推荐文章。
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">
              高浏览量文章
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              按累计浏览量排序
            </p>
            <div className="mt-3 space-y-2">
              {popularPosts.length > 0 ? (
                popularPosts
                  .slice(0, 5)
                  .map((post, index) => (
                    <SidebarArticleLink
                      key={post.id}
                      post={post}
                      rank={index + 1}
                    />
                  ))
              ) : (
                <p className="text-sm text-muted-foreground">暂无热门文章。</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">服务器专题</p>
            <div className="mt-3 grid gap-2">
              {offerTopics.map((topic) => {
                const count =
                  offerCounts.find((item) => item.slug === topic.slug)?.count ??
                  0;

                return (
                  <Link
                    key={topic.slug}
                    href={`/servers/${encodeURIComponent(topic.slug)}`}
                    prefetch
                    className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border/70 px-3 text-sm text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
                  >
                    <span>{topic.title}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatCount(count)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1 px-4 py-10 text-center text-sm text-muted-foreground">
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
