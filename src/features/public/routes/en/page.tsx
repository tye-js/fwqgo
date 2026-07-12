import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  Gauge,
  MapPin,
  Search,
  Server,
  Store,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  getHomepagePostsWithTags,
  getHomepageSidebarData,
} from "@/features/public/data/post";
import { getSiteSeoConfig } from "@/features/shared/data/site-seo";
import ArticleCard from "@/features/public/components/article-card";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import {
  FeaturedOfferList,
  type FeaturedOffer,
} from "@/features/public/components/featured-offer-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import {
  getLatestServerOffers,
  getPublicServerOfferCount,
  getServerOfferTopicCounts,
  offerTopics,
} from "@/server/offers/server-offers";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { data } = await getSiteSeoConfig("en");

  return {
    title: data.title,
    description: data.description,
    keywords: data.keywords,
    alternates: {
      canonical: `${getSiteUrl()}/en`,
      languages: {
        "zh-CN": getSiteUrl(),
        en: `${getSiteUrl()}/en`,
        "x-default": getSiteUrl(),
      },
    },
    openGraph: {
      title: data.title,
      description: data.description,
      url: `${getSiteUrl()}/en`,
      siteName: data.siteName,
    },
  };
}

const quickIntentLinks = [
  { label: "Hong Kong CN2", href: "/search?lang=en&q=Hong%20Kong%20CN2" },
  { label: "US VPS", href: "/servers/united-states" },
  { label: "Cheap VPS", href: "/servers/cheap-vps" },
  { label: "Dedicated servers", href: "/search?lang=en&q=dedicated%20server" },
  { label: "Coupon codes", href: "/search?lang=en&q=coupon" },
];

const compareEntries: Array<{
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  topicSlug?: string;
}> = [
  {
    title: "Compare all offers",
    description: "Filter every offer by price, region, line, status, and coupon.",
    href: "/servers",
    icon: Gauge,
  },
  {
    title: "Hong Kong servers",
    description: "CN2, CMI, and BGP routes with low latency to mainland China.",
    href: "/servers/hong-kong",
    icon: MapPin,
    topicSlug: "hong-kong",
  },
  {
    title: "US servers",
    description: "Bandwidth-heavy workloads, overseas sites, and global users.",
    href: "/servers/united-states",
    icon: Server,
    topicSlug: "united-states",
  },
  {
    title: "Cheap VPS",
    description: "Entry-level monthly plans for tests and lightweight sites.",
    href: "/servers/cheap-vps",
    icon: Zap,
    topicSlug: "cheap-vps",
  },
];

function formatCount(value: number) {
  return value.toLocaleString("en-US");
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
      href={`/en/fwq/posts/${encodeURIComponent(post.slug)}`}
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

async function EnglishHomeContent() {
  await connection();

  const [
    { data: posts },
    { data: sidebarData },
    offerCounts,
    latestOffers,
    totalOfferCount,
  ] = await Promise.all([
    getHomepagePostsWithTags("en"),
    getHomepageSidebarData("en"),
    getServerOfferTopicCounts(),
    getLatestServerOffers(24),
    getPublicServerOfferCount(),
  ]);

  const safePosts = posts ?? [];
  const latestArticles = safePosts.slice(0, 8);
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const popularPosts = sidebarData?.popularPosts ?? [];
  const featuredOffers = latestOffers.slice(0, 6);
  const promoOffers = latestOffers
    .filter((offer) => offer.promoCode?.trim())
    .slice(0, 4);
  const topProviders = topValues(latestOffers.map((offer) => offer.providerName));
  const topRegions = topValues(latestOffers.map((offer) => offer.region));
  const latestOfferUpdatedAt = latestOffers
    .map((offer) => offer.updatedAt ?? offer.createdAt)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return (
    <main className="flex-1">
      <section className="home-grid-surface border-b border-border/60">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/5 text-primary"
                >
                  Server deals &amp; price comparison
                </Badge>
                {totalOfferCount > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {formatCount(totalOfferCount)} purchasable offers tracked
                    {latestOfferUpdatedAt
                      ? ` · updated ${formatDate(latestOfferUpdatedAt, "en-US")}`
                      : ""}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
                Compare server deals before you buy
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                VPS, cloud, and dedicated server offers with prices, regions,
                network routes, stock status, and coupon codes — every offer
                keeps its buying link and source article.
              </p>

              <form action="/search" method="get" className="mt-5 max-w-2xl">
                <input type="hidden" name="lang" value="en" />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      name="q"
                      placeholder="Search offers, providers, regions, coupons…"
                      aria-label="Search server offers and articles"
                      className="h-12 rounded-md border-border bg-background pl-10 text-sm shadow-sm"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="h-12 rounded-md px-6 text-sm font-medium"
                  >
                    Search
                  </Button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Quick filters
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

            <aside className="min-w-0 space-y-4 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BadgePercent className="size-4 text-primary" />
                  Latest coupon codes
                </p>
                <div className="mt-3 space-y-2">
                  {promoOffers.length > 0 ? (
                    promoOffers.map((offer) => (
                      <PromoCodeLink key={offer.id} offer={offer} />
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-4 text-xs leading-5 text-muted-foreground">
                      No coupon offers right now. Open the comparison tool for
                      the full list.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Store className="size-4 text-primary" />
                  Popular providers
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
                      No data yet
                    </span>
                  )}
                </div>
              </div>

              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MapPin className="size-4 text-primary" />
                  Popular regions
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
                      No data yet
                    </span>
                  )}
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {compareEntries.map((entry) => {
              const Icon = entry.icon;
              const count = entry.topicSlug
                ? offerCounts.find((item) => item.slug === entry.topicSlug)?.count
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
                        {formatCount(count)} offers
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

      <section className="container mx-auto px-4 py-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <SectionHeading
            title="Latest featured offers"
            description="Prices, regions, routes, and buying links at a glance. Always confirm at checkout."
          />
          <Button asChild variant="outline" size="sm" className="rounded-md">
            <Link href="/servers" prefetch>
              Open comparison tool
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <FeaturedOfferList offers={featuredOffers} language="en" />
      </section>

      <section className="container mx-auto grid gap-8 px-4 pb-12 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              title="Latest deals and reviews"
              description="Recently published English server deals, reviews, and buying notes."
            />
            <Button asChild variant="outline" size="sm" className="rounded-md">
              <Link href="/en/fwq/vps/page/1" prefetch>
                All articles
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          {latestArticles.length > 0 ? (
            latestArticles.map((post) => (
              <ArticleCard key={post.id} post={post} language="en" />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              No English articles have been published yet. Check the Chinese
              homepage or come back later.
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                Editor picks
              </p>
              <Badge variant="secondary">Featured</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {promotedPosts.length > 0 ? (
                promotedPosts
                  .slice(0, 4)
                  .map((post) => <SidebarArticleLink key={post.id} post={post} />)
              ) : (
                <p className="rounded-md border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  No English picks configured yet.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">
              Popular articles
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ranked by accumulated views.
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
                <p className="text-sm text-muted-foreground">
                  No popularity data yet.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">
              Server topics
            </p>
            <div className="mt-3 grid gap-2">
              {offerTopics.map((topic) => {
                const count =
                  offerCounts.find((item) => item.slug === topic.slug)?.count ??
                  0;
                const entry = compareEntries.find(
                  (item) => item.topicSlug === topic.slug,
                );

                return (
                  <Link
                    key={topic.slug}
                    href={`/servers/${encodeURIComponent(topic.slug)}`}
                    prefetch
                    className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border/70 px-3 text-sm text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
                  >
                    <span>{entry?.title ?? topic.title}</span>
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

export default function EnglishHomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="en" />
      <Suspense
        fallback={
          <main className="flex-1 px-4 py-10 text-center text-sm text-muted-foreground">
            Loading English homepage...
          </main>
        }
      >
        <EnglishHomeContent />
      </Suspense>
      <Footer language="en" />
    </div>
  );
}
