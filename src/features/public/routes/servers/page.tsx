import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Database,
  Filter,
  MapPin,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Suspense } from "react";
import { connection } from "next/server";

import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import { ServerOfferTable } from "@/features/public/components/server-offer-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPublicServerOffers,
  getServerOfferTopicCounts,
  offerTopics,
} from "@/server/offers/server-offers";
import { formatDate, jsonLdScriptContent } from "@fwqgo/core/utils";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export const metadata = {
  title: "服务器比价工具 - 服务器go",
  description:
    "集中筛选服务器套餐价格、地区、线路、配置、库存状态、优惠码、购买链接和来源文章，快速比较香港服务器、美国服务器、便宜 VPS 等方案。",
  alternates: {
    canonical: `${getSiteUrl()}/servers`,
  },
  openGraph: {
    title: "服务器比价工具 - 服务器go",
    description:
      "集中筛选服务器套餐价格、地区、线路、配置、库存状态、优惠码、购买链接和来源文章，快速比较香港服务器、美国服务器、便宜 VPS 等方案。",
    url: `${getSiteUrl()}/servers`,
    siteName: "服务器go",
  },
};

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function uniqueCount(values: Array<string | null>) {
  return new Set(
    values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
  ).size;
}

async function ServersContent() {
  await connection();

  const [counts, offers] = await Promise.all([
    getServerOfferTopicCounts(),
    getPublicServerOffers(160),
  ]);
  const providerCount = uniqueCount(offers.map((offer) => offer.providerName));
  const regionCount = uniqueCount(offers.map((offer) => offer.region));
  const latestUpdatedAt = offers
    .map((offer) => offer.updatedAt ?? offer.createdAt)
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const totalTopicOffers = counts.reduce((sum, item) => sum + item.count, 0);
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "服务器比价工具",
    description: metadata.description,
    url: `${getSiteUrl()}/servers`,
    numberOfItems: offers.length,
    itemListElement: offerTopics.map((topic, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${getSiteUrl()}/servers/${encodeURIComponent(topic.slug)}`,
      name: topic.title,
      description: topic.description,
    })),
  };

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScriptContent(itemListJsonLd),
        }}
      />

      <section className="home-grid-surface border-b border-border/60">
        <div className="container mx-auto px-4 py-7 md:py-10">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch">
            <div className="rounded-lg border border-border/70 bg-background/90 p-5 shadow-sm backdrop-blur md:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-foreground text-background hover:bg-foreground">
                  Server Deal Console
                </Badge>
                <Badge variant="secondary">结构化比价工具</Badge>
              </div>
              <h1 className="font-editorial text-gradient mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
                用一张可筛选列表比较服务器套餐
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                这里集中展示从推广文章和测评内容中提取出的价格、地区、线路、配置、库存状态、优惠码和购买入口。首页负责快速分发，完整比较放在这个工具页。
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild className="h-10 rounded-md bg-foreground px-5 text-background hover:bg-accent">
                  <a href="#server-offer-table">
                    开始筛选
                    <Filter className="size-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="h-10 rounded-md px-5">
                  <Link href="/fwq/vps/page/1" prefetch>
                    查看相关文章
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <aside className="rounded-lg border border-border/70 bg-zinc-950 p-5 text-white shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <BarChart3 className="size-4 text-cyan-300" />
                    数据概览
                  </p>
                  <p className="mt-2 text-xs leading-5 text-white/60">
                    仅统计可见且带购买入口的套餐。
                  </p>
                </div>
                <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">
                  {latestUpdatedAt ? formatDate(latestUpdatedAt) : "待更新"}
                </Badge>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-white/55">当前列表</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {formatCount(offers.length)}
                  </p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-white/55">专题覆盖</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {formatCount(totalTopicOffers)}
                  </p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-white/55">商家</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {formatCount(providerCount)}
                  </p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-white/55">地区</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    {formatCount(regionCount)}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-accent">
              <Sparkles className="size-4" />
              SEO 专题入口
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              先按典型需求缩小范围
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            专题页保留独立 SEO 入口，工具页负责横向比较。两个入口互相链接，不破坏原来的文章导航权重。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {offerTopics.map((topic) => {
            const count = counts.find((item) => item.slug === topic.slug)?.count ?? 0;

            return (
              <Link
                key={topic.slug}
                href={`/servers/${encodeURIComponent(topic.slug)}`}
                prefetch
                className="group rounded-lg border border-border/70 bg-background p-5 shadow-sm transition-colors hover:border-accent/35 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex size-10 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-accent">
                    {topic.slug === "hong-kong" ? (
                      <MapPin className="size-5" />
                    ) : topic.slug === "cheap-vps" ? (
                      <ShieldCheck className="size-5" />
                    ) : (
                      <Server className="size-5" />
                    )}
                  </div>
                  <Badge variant="secondary">{formatCount(count)} 个套餐</Badge>
                </div>
                <h3 className="mt-5 text-xl font-semibold">{topic.title}</h3>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {topic.description}
                </p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent">
                  查看专题
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="server-offer-table" className="container mx-auto px-4 pb-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-accent">
              <Database className="size-4" />
              套餐数据库
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              按价格、地区、线路和库存状态筛选
            </h2>
          </div>
          <Badge variant="outline" className="rounded-md px-3 py-1.5">
            显示最近 {formatCount(offers.length)} 条可购买套餐
          </Badge>
        </div>
        <ServerOfferTable offers={offers} />
      </section>

      <section className="container mx-auto px-4 pb-12">
        <div className="rounded-lg border border-border/70 bg-background p-5 shadow-sm md:p-6">
          <h2 className="text-xl font-semibold">为什么还保留文章入口</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            比价工具负责高效率比较和购买转化，来源文章和测评文章继续负责 SEO、背景说明、商家活动细节和使用场景。套餐表里的来源文章、测评链接和专题页会互相连接，方便搜索用户和人工编辑同时使用。
          </p>
          <Button asChild variant="outline" className="mt-5 rounded-md">
            <Link href="/fwq/vps/page/1" prefetch>
              继续查看文章分类
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

export default function ServersPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1">
            <section className="container mx-auto px-4 py-10">
              <Card className="border-border/70 bg-background shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  正在加载服务器比价工具...
                </CardContent>
              </Card>
            </section>
          </main>
        }
      >
        <ServersContent />
      </Suspense>
      <Footer />
    </div>
  );
}
