import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, Database, MapPin, Server, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  ServerInventoryProviderNav,
  ServerInventoryToolbar,
} from "@/features/public/components/server-inventory-filters";
import { ServerInventoryResults } from "@/features/public/components/server-inventory-results";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import {
  getPublicInventoryFacets,
  getPublicInventoryPage,
  parsePublicInventoryFilters,
  type PublicInventorySearchParams,
} from "@/server/offers/public-inventory-query";
import { jsonLdScriptContent } from "@fwqgo/core/utils";
import { offerTopics } from "@/server/offers/server-offers";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

const baseMetadata: Metadata = {
  title: "VPS 库存与服务器比价工具 - 服务器go",
  description:
    "按厂商、库存、地区、线路、产品组、配置和标准月价筛选 VPS、云服务器与独立服务器，查看优惠码、探测时间、推广文章和购买入口。",
  alternates: {
    canonical: `${getSiteUrl()}/servers`,
  },
  openGraph: {
    title: "VPS 库存与服务器比价工具 - 服务器go",
    description:
      "集中查询服务器库存、价格、地区、线路、配置、优惠码和购买入口。",
    url: `${getSiteUrl()}/servers`,
    siteName: "服务器go",
  },
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PublicInventorySearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const hasInventoryFilters = [
    "q",
    "kind",
    "provider",
    "group",
    "stock",
    "check",
    "region",
    "line",
    "feature",
    "promo",
    "minPrice",
    "maxPrice",
    "sort",
    "cursor",
  ].some((key) => firstSearchParam(params[key]));

  return {
    ...baseMetadata,
    robots: hasInventoryFilters
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadInventoryData(
  filters: ReturnType<typeof parsePublicInventoryFilters>,
) {
  try {
    const [facets, page] = await Promise.all([
      getPublicInventoryFacets(filters.kind),
      getPublicInventoryPage(filters),
    ]);
    return { ok: true as const, facets, page };
  } catch (error) {
    console.error("Failed to load server inventory panel:", error);
    return { ok: false as const };
  }
}

async function InventoryRuntime({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<PublicInventorySearchParams>;
}) {
  await connection();

  const filters = parsePublicInventoryFilters(await searchParamsPromise);
  const result = await loadInventoryData(filters);
  if (!result.ok) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-8">
        <p className="font-medium text-destructive">库存数据暂时无法读取</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          页面框架和专题入口仍可使用。请稍后重试；持续失败时需要检查数据库连接和最新迁移状态。
        </p>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <ServerInventoryProviderNav facets={result.facets} filters={filters} />
      <div className="min-w-0 space-y-4">
        <ServerInventoryToolbar
          key={JSON.stringify(filters)}
          facets={result.facets}
          filters={filters}
        />
        <ServerInventoryResults page={result.page} filters={filters} />
      </div>
    </div>
  );
}

function InventoryFallback() {
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="hidden h-[620px] animate-pulse rounded-lg border border-border/70 bg-muted/30 lg:block" />
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-lg border border-border/70 bg-muted/30" />
        <div className="h-12 animate-pulse rounded-lg bg-muted/25" />
        <div className="h-80 animate-pulse rounded-lg border border-border/70 bg-muted/25" />
      </div>
    </div>
  );
}

export default function ServersPage({
  searchParams,
}: {
  searchParams: Promise<PublicInventorySearchParams>;
}) {
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "服务器库存与比价工具",
    description: baseMetadata.description,
    url: `${getSiteUrl()}/servers`,
    itemListElement: offerTopics.map((topic, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${getSiteUrl()}/servers/${topic.slug}`,
      name: topic.title,
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScriptContent(itemListJsonLd),
          }}
        />

        <section className="home-grid-surface border-b border-border/60">
          <div className="container mx-auto px-4 py-6 md:py-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 text-primary"
              >
                VPS 库存工具
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Database className="size-3.5" />
                常规套餐与限时活动分开查询
              </span>
            </div>
            <h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-tight text-foreground md:text-3xl">
              按厂商、库存、地区、线路和月价查找服务器
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-muted-foreground">
              常规款由后台人工维护，活动款单独进行库存探测。价格统一折算为美元月价用于排序，下单前仍应在商家结算页核对价格、续费和退款政策。
            </p>
          </div>
        </section>

        <section className="container mx-auto px-4 py-6 md:py-8">
          <Suspense fallback={<InventoryFallback />}>
            <InventoryRuntime searchParamsPromise={searchParams} />
          </Suspense>
        </section>

        <section className="border-t border-border/60 bg-muted/15">
          <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-foreground">
                服务器选购专题
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                工具负责实时筛选，专题页提供选购说明、FAQ、相关文章和精选套餐。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {offerTopics.map((topic) => {
                const Icon =
                  topic.slug === "hong-kong"
                    ? MapPin
                    : topic.slug === "cheap-vps"
                      ? ShieldCheck
                      : Server;
                return (
                  <Link
                    key={topic.slug}
                    href={`/servers/${topic.slug}`}
                    className="group rounded-lg border border-border/70 bg-background p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <h3 className="mt-3 font-semibold text-foreground group-hover:text-primary">
                      {topic.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {topic.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
