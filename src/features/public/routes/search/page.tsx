import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, Search, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ArticleCard from "@/features/public/components/article-card";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ServerOfferTable } from "@/features/public/components/server-offer-table";
import { searchPublishedPosts } from "@/features/public/data/post";
import { searchServerOffers } from "@/server/offers/server-offers";

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[]; lang?: string | string[] }>;
};

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function normalizeQuery(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim().slice(0, 80) ?? "";
}

function normalizeLanguage(value: string | string[] | undefined): "zh" | "en" {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "en" ? "en" : "zh";
}

function getSearchHref(query: string, language: "zh" | "en") {
  const params = new URLSearchParams({ q: query });
  if (language === "en") params.set("lang", "en");
  return `/search?${params.toString()}`;
}

export const metadata: Metadata = {
  title: "搜索服务器优惠、文章和套餐 - 服务器go",
  description:
    "搜索服务器优惠文章、VPS 套餐、商家、地区、线路和优惠码，快速找到合适的购买入口和测评内容。",
  alternates: {
    canonical: `${getSiteUrl()}/search`,
  },
  robots: {
    index: false,
    follow: true,
  },
};

const quickQueries = {
  zh: ["香港服务器", "美国服务器", "便宜 VPS", "CN2", "CMI", "独立服务器"],
  en: [
    "Hong Kong VPS",
    "US VPS",
    "Cheap VPS",
    "CN2",
    "CMI",
    "Dedicated server",
  ],
};

async function SearchContent({ searchParams }: SearchPageProps) {
  await connection();

  const params = await searchParams;
  const query = normalizeQuery(params.q);
  const language = normalizeLanguage(params.lang);
  const copy =
    language === "en"
      ? {
          badge: "Site search",
          h1: "Search server deals, articles, and offers",
          description:
            "Search providers, regions, network routes, coupons, article titles and server specs. Use it to find buying entries quickly or continue reading deal details.",
          label: "Search keywords",
          placeholder:
            "Search provider, region, route, coupon, or article keyword",
          submit: "Search",
          emptyTitle: "Enter keywords to search",
          emptyDescription:
            "Start with Hong Kong VPS, US VPS, provider name, network route, or coupon.",
          resultTitle: (value: string) => `Results for "${value}"`,
          resultCount: (postCount: number, offerCount: number) =>
            `${postCount} articles and ${offerCount} offers found.`,
          serverDeals: "Server deals",
          offers: "Matched offers",
          articles: "Matched articles",
          noArticles:
            "No matching articles found. Try a provider, region, or route keyword.",
        }
      : {
          badge: "站内搜索",
          h1: "搜索服务器优惠、文章和套餐",
          description:
            "支持搜索商家、地区、线路、优惠码、文章标题和套餐配置。适合直接找目标购买入口，也适合从文章继续了解活动细节。",
          label: "搜索关键词",
          placeholder: "输入商家、地区、线路、优惠码或文章关键词",
          submit: "搜索",
          emptyTitle: "输入关键词开始搜索",
          emptyDescription:
            "可以从香港服务器、美国服务器、商家名称、线路或优惠码开始。",
          resultTitle: (value: string) => `“${value}” 的搜索结果`,
          resultCount: (postCount: number, offerCount: number) =>
            `找到 ${postCount} 篇文章，${offerCount} 个套餐。`,
          serverDeals: "服务器比价",
          offers: "匹配套餐",
          articles: "匹配文章",
          noArticles: "没有找到匹配文章，可以换一个商家、地区或线路关键词。",
        };
  const [{ data: posts }, offers] = query
    ? await Promise.all([
        searchPublishedPosts({ query, language, limit: 16 }),
        searchServerOffers({ query, limit: 40 }),
      ])
    : [{ data: [] }, []];

  return (
    <main className="flex-1">
      <section className="border-b border-border/60 bg-muted/20">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="max-w-3xl space-y-4">
            <Badge className="bg-primary text-primary-foreground">
              {copy.badge}
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {copy.h1}
            </h1>
            <p className="text-sm leading-7 text-muted-foreground md:text-base">
              {copy.description}
            </p>
            <form action="/search" className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="public-search">
                {copy.label}
              </label>
              {language === "en" ? (
                <input type="hidden" name="lang" value="en" />
              ) : null}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="public-search"
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder={copy.placeholder}
                  autoComplete="off"
                  className="min-h-11 w-full rounded-md border border-border/70 bg-background pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button type="submit" className="min-h-11">
                {copy.submit}
                <ArrowRight className="size-4" />
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {quickQueries[language].map((item) => (
                <Link
                  key={item}
                  href={getSearchHref(item, language)}
                  prefetch
                  className="inline-flex min-h-9 items-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
                >
                  {item}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        {!query ? (
          <Card className="border-border/70 bg-background shadow-sm">
            <CardContent className="p-8 text-center">
              <Search className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-4 text-base font-medium text-foreground">
                {copy.emptyTitle}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {copy.emptyDescription}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {copy.resultTitle(query)}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {copy.resultCount(posts.length, offers.length)}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/servers" prefetch>
                  <Server className="size-4" />
                  {copy.serverDeals}
                </Link>
              </Button>
            </div>

            <section className="space-y-4">
              <h3 className="text-xl font-semibold">{copy.offers}</h3>
              <ServerOfferTable offers={offers} />
            </section>

            <section className="space-y-4">
              <h3 className="text-xl font-semibold">{copy.articles}</h3>
              {posts.length > 0 ? (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <ArticleCard
                      key={post.id}
                      post={post}
                      language={language}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
                  {copy.noArticles}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

export default async function SearchPage(props: SearchPageProps) {
  const searchParams = await props.searchParams;
  const language = normalizeLanguage(searchParams.lang);
  const resolvedSearchParams = Promise.resolve(searchParams);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language={language} />
      <Suspense
        fallback={
          <main className="container mx-auto flex flex-1 items-center px-4 py-12">
            <div className="w-full rounded-md border border-border/70 bg-card p-6 text-sm text-muted-foreground">
              正在加载搜索页...
            </div>
          </main>
        }
      >
        <SearchContent searchParams={resolvedSearchParams} />
      </Suspense>
      <Footer language={language} />
    </div>
  );
}
