import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  ArrowRight,
  ArrowUpRight,
  Gauge,
  Globe2,
  MapPin,
  Server,
  Sparkles,
  Tags,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate, isHttpHref, isInternalHref } from "@fwqgo/core/utils";
import {
  getLatestServerOffers,
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

type LatestOffer = Awaited<ReturnType<typeof getLatestServerOffers>>[number];

const englishEntries: Array<{
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    title: "Full deal console",
    description: "Filter by price, region, line type, stock status, coupon, and buying link.",
    href: "/servers",
    icon: Gauge,
  },
  {
    title: "Hong Kong servers",
    description: "CN2, CMI, BGP, and low-latency options for Asia-focused projects.",
    href: "/servers/hong-kong",
    icon: MapPin,
  },
  {
    title: "United States servers",
    description: "Useful for overseas sites, testing, bandwidth-heavy workloads, and global users.",
    href: "/servers/united-states",
    icon: Globe2,
  },
  {
    title: "Cheap VPS",
    description: "Entry-level monthly VPS offers for lightweight websites and experiments.",
    href: "/servers/cheap-vps",
    icon: Zap,
  },
];

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatOfferPrice(offer: LatestOffer) {
  if (!offer.priceAmount) return "Price pending";
  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) return "Price to confirm";

  const currency = offer.currency === "CNY" ? "¥" : "$";
  const cycleMap: Record<string, string> = {
    monthly: "mo",
    quarterly: "quarter",
    semiannual: "half-year",
    yearly: "year",
  };
  const cycle = offer.billingCycle
    ? (cycleMap[offer.billingCycle] ?? offer.billingCycle)
    : "cycle pending";

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

function EntryCard({
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
      className="group rounded-lg border border-border/70 bg-background p-4 shadow-sm transition-colors hover:border-accent/35 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-accent">
          <Icon className="size-5" />
        </span>
        {typeof count === "number" ? (
          <Badge variant="secondary">{formatCount(count)} offers</Badge>
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

function OfferStrip({ offer }: { offer: LatestOffer }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="line-clamp-1 text-xs text-white/55">
        {[offer.providerName, offer.region, offer.lineType].filter(Boolean).join(" · ") ||
          "Server offer"}
      </p>
      <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-white">
        {offer.title}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-cyan-200">
          {formatOfferPrice(offer)}
        </span>
        <SmartLink
          href={offer.purchaseUrl}
          className="inline-flex items-center gap-1 text-xs font-medium text-cyan-200 underline-offset-4 hover:text-white hover:underline"
        >
          Buy
          <ArrowUpRight className="size-3.5" />
        </SmartLink>
      </div>
    </article>
  );
}

async function EnglishHomeContent() {
  await connection();

  const [
    { data: posts },
    { data: sidebarData },
    offerCounts,
    latestOffers,
  ] = await Promise.all([
    getHomepagePostsWithTags("en"),
    getHomepageSidebarData("en"),
    getServerOfferTopicCounts(),
    getLatestServerOffers(5),
  ]);

  const safePosts = posts ?? [];
  const latestArticles = safePosts.slice(0, 8);
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const popularPosts = sidebarData?.popularPosts ?? [];
  const totalTopicOffers = offerCounts.reduce((sum, item) => sum + item.count, 0);

  return (
    <main className="flex-1">
      <section className="home-grid-surface border-b border-border/60">
        <div className="container mx-auto px-4 py-7 md:py-10">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
            <div className="rounded-lg border border-border/70 bg-background/90 p-5 shadow-sm backdrop-blur md:p-7">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-foreground text-background hover:bg-foreground">
                  FWQGO Intelligence
                </Badge>
                <Badge variant="secondary">English server deals</Badge>
              </div>
              <h1 className="font-editorial text-gradient mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
                A cleaner entry point for server deals, reviews, and structured offers
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                The homepage routes readers to the comparison console, topic pages, and latest English articles. The full filtering workflow stays on the dedicated server tool page.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                  <p className="text-xs text-muted-foreground">Structured offers</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatCount(totalTopicOffers)}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                  <p className="text-xs text-muted-foreground">Topic hubs</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {offerTopics.length}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/25 p-3">
                  <p className="text-xs text-muted-foreground">English articles</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {formatCount(safePosts.length)}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild className="h-10 rounded-md bg-foreground px-5 text-background hover:bg-accent">
                  <Link href="/servers" prefetch>
                    Open deal console
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-10 rounded-md px-5">
                  <Link href="#latest-english-articles" prefetch>
                    Read articles
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <aside className="rounded-lg border border-border/70 bg-zinc-950 p-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    <Sparkles className="size-4 text-cyan-300" />
                    Deal snapshot
                  </p>
                  <p className="mt-2 text-xs leading-5 text-white/60">
                    A compact preview before opening the full comparison tool.
                  </p>
                </div>
                <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                  Live
                </Badge>
              </div>
              <div className="mt-5 space-y-3">
                {latestOffers.slice(0, 4).map((offer) => (
                  <OfferStrip key={offer.id} offer={offer} />
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
              <Server className="size-4" />
              Browse by intent
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              Choose the right entry before comparing plans
            </h2>
          </div>
          <Button asChild variant="outline" className="rounded-md">
            <Link href="/" prefetch>
              中文首页
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {englishEntries.map((entry) => {
            const topic = offerTopics.find((item) => `/servers/${item.slug}` === entry.href);
            const count = topic
              ? offerCounts.find((item) => item.slug === topic.slug)?.count
              : undefined;

            return <EntryCard key={entry.href} {...entry} count={count} />;
          })}
        </div>
      </section>

      <section
        id="latest-english-articles"
        className="container mx-auto grid gap-8 px-4 pb-12 xl:grid-cols-[minmax(0,0.82fr)_320px]"
      >
        <div className="space-y-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-accent">
              <Tags className="size-4" />
              Latest English content
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              Server deals and buying notes
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Recently published English server deals and reviews.
            </p>
          </div>
          {latestArticles.length > 0 ? (
            latestArticles.map((post) => (
              <ArticleCard key={post.id} post={post} language="en" />
            ))
          ) : (
            <Card className="border-dashed border-border/80 bg-muted/20">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No English articles have been published yet. Check the Chinese homepage or come back later.
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-foreground">Editor picks</p>
              <div className="mt-4 space-y-3">
                {promotedPosts.length > 0 ? (
                  promotedPosts.slice(0, 4).map((post) => (
                    <Link
                      key={post.id}
                      href={`/en/fwq/posts/${encodeURIComponent(post.slug)}`}
                      prefetch
                      className="block rounded-md border border-border/70 p-3 text-sm transition-colors hover:border-accent/30 hover:bg-muted/30"
                    >
                      <p className="line-clamp-2 font-medium underline-offset-4 hover:text-accent hover:underline">
                        {post.title}
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {post.description ?? "Read the article."}
                      </p>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No English picks configured yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-foreground">Popular articles</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ranked by accumulated views.
              </p>
              <div className="mt-4 space-y-3">
                {popularPosts.length > 0 ? (
                  popularPosts.slice(0, 5).map((post, index) => (
                    <Link
                      key={post.id}
                      href={`/en/fwq/posts/${encodeURIComponent(post.slug)}`}
                      prefetch
                      className="flex min-h-11 gap-3 rounded-md border border-border/70 p-3 text-sm transition-colors hover:border-accent/30 hover:bg-muted/30"
                    >
                      <Badge variant="secondary">TOP {index + 1}</Badge>
                      <span className="line-clamp-2">{post.title}</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No English popularity data yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {safePosts[0] ? (
            <Card className="rounded-lg border-border/70 bg-background shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm font-medium text-foreground">Latest update</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(safePosts[0].createdAt)}
                </p>
                <Link
                  href={`/en/fwq/posts/${encodeURIComponent(safePosts[0].slug)}`}
                  prefetch
                  className="mt-3 block text-sm font-medium leading-6 underline-offset-4 hover:text-accent hover:underline"
                >
                  {safePosts[0].title}
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

export default function EnglishHomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="en" />
      <Separator />
      <Suspense
        fallback={
          <main className="flex-1 px-4 py-10 text-sm text-muted-foreground">
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
