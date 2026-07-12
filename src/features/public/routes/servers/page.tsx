import Link from "next/link";
import { ArrowRight, MapPin, Server, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { connection } from "next/server";

import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import { ServerOfferTable } from "@/features/public/components/server-offer-table";
import { Badge } from "@/components/ui/badge";
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
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
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
  const summaryStats: Array<{ label: string; value: string }> = [
    { label: "当前套餐", value: formatCount(offers.length) },
    { label: "商家", value: formatCount(providerCount) },
    { label: "地区", value: formatCount(regionCount) },
    {
      label: "数据更新",
      value: latestUpdatedAt ? formatDate(latestUpdatedAt) : "待更新",
    },
  ];
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

      {/* 紧凑页头 + 数据摘要 */}
      <section className="home-grid-surface border-b border-border/60">
        <div className="container mx-auto px-4 py-7 md:py-9">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/5 text-primary"
            >
              服务器比价工具
            </Badge>
            <span className="text-xs text-muted-foreground">
              数据来自推广文章与测评内容的结构化提取
            </span>
          </div>
          <h1 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
            用一张可筛选列表比较服务器套餐
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            集中比较价格、地区、线路、配置、库存状态、优惠码和购买入口。下方直接开始筛选，专题入口在页面底部。
          </p>

          <dl className="mt-5 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {summaryStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-md border border-border/70 bg-background px-3 py-2.5 shadow-sm"
              >
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-foreground">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 套餐区：筛选优先 */}
      <section
        id="server-offer-table"
        className="container mx-auto px-4 py-8 md:py-10"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              全部可购买套餐
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              按价格、地区、线路、状态和优惠码筛选，价格默认从低到高。
            </p>
          </div>
          <Badge variant="secondary" className="rounded-md px-3 py-1.5">
            显示最近 {formatCount(offers.length)} 条
          </Badge>
        </div>
        <ServerOfferTable offers={offers} />
      </section>

      {/* SEO 专题入口后置 */}
      <section className="container mx-auto px-4 pb-12">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            按需求继续缩小范围
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            专题页承接具体搜索意图并保留独立 SEO 入口，与工具页互相链接。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {offerTopics.map((topic) => {
            const count =
              counts.find((item) => item.slug === topic.slug)?.count ?? 0;
            const Icon =
              topic.slug === "hong-kong"
                ? MapPin
                : topic.slug === "cheap-vps"
                  ? ShieldCheck
                  : Server;

            return (
              <Link
                key={topic.slug}
                href={`/servers/${encodeURIComponent(topic.slug)}`}
                prefetch
                className="group rounded-lg border border-border/70 bg-background p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatCount(count)} 个套餐
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-foreground group-hover:text-primary">
                  {topic.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {topic.description}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  查看专题
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>

        <p className="mt-6 text-sm leading-7 text-muted-foreground">
          比价工具负责高效比较和购买转化，来源文章和测评继续负责背景说明、商家活动细节和使用场景。
          <Link
            href="/fwq/vps/page/1"
            prefetch
            className="ml-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            继续查看文章分类
          </Link>
          。
        </p>
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
          <main className="flex-1 px-4 py-10 text-center text-sm text-muted-foreground">
            正在加载服务器比价工具...
          </main>
        }
      >
        <ServersContent />
      </Suspense>
      <Footer />
    </div>
  );
}
