import Link from "next/link";
import type { ComponentProps } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ServerOfferTable } from "@/features/public/components/server-offer-table";
import { offerTopics } from "@/server/offers/server-offers";
import { jsonLdScriptContent, toAbsoluteHttpUrl } from "@fwqgo/core/utils";

type CollectionKind = "provider" | "region" | "line";

type Offer = ComponentProps<typeof ServerOfferTable>["offers"][number];

const kindCopy: Record<
  CollectionKind,
  {
    badge: string;
    label: string;
    titleSuffix: string;
    backText: string;
    faq: Array<{ question: string; answer: string }>;
  }
> = {
  provider: {
    badge: "商家套餐",
    label: "商家",
    titleSuffix: "服务器优惠套餐",
    backText: "返回服务器比价",
    faq: [
      {
        question: "商家套餐页里的购买链接可靠吗？",
        answer:
          "购买入口来自文章提取和后台人工修正数据。下单前仍建议打开商家页面核对价格、库存、续费和退款政策。",
      },
      {
        question: "为什么同一商家会有多个套餐？",
        answer:
          "同一商家可能同时提供 VPS、云服务器、独立服务器、不同地区和不同线路套餐，因此会拆成多行便于比较。",
      },
    ],
  },
  region: {
    badge: "地区套餐",
    label: "地区",
    titleSuffix: "服务器优惠套餐",
    backText: "返回服务器比价",
    faq: [
      {
        question: "地区筛选主要看什么？",
        answer:
          "地区筛选适合先确定目标用户位置，再比较线路、延迟、带宽、价格和库存状态。",
      },
      {
        question: "同一地区不同线路差别大吗？",
        answer:
          "差别通常比较大。香港、美国、日本等地区都可能有普通线路、CN2、CMI、BGP 等不同网络，适合不同访问场景。",
      },
    ],
  },
  line: {
    badge: "线路套餐",
    label: "线路",
    titleSuffix: "线路服务器优惠套餐",
    backText: "返回服务器比价",
    faq: [
      {
        question: "线路页适合怎么用？",
        answer:
          "线路页适合已经明确需要 CN2、CMI、BGP、AS9929 等网络类型的用户，直接比较不同商家和地区的价格。",
      },
      {
        question: "只看线路就够了吗？",
        answer:
          "不够。还要结合地区、带宽、流量、CPU 限制、库存和续费价格一起判断。",
      },
    ],
  },
};

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "未记录";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatMinPrice(offers: Offer[]) {
  const prices = offers
    .map((offer) => {
      if (!offer.priceAmount) return null;
      const value = Number(offer.priceAmount);
      if (!Number.isFinite(value)) return null;
      return {
        value,
        currency: offer.currency === "CNY" ? "¥" : "$",
        monthlySortValue: Number.isFinite(Number(offer.monthlyPriceUsd))
          ? Number(offer.monthlyPriceUsd)
          : (offer.currency === "CNY" ? value / 7.2 : value) /
            (offer.billingCycle === "yearly"
              ? 12
              : offer.billingCycle === "semiannual"
                ? 6
                : offer.billingCycle === "quarterly"
                  ? 3
                  : 1),
      };
    })
    .filter((price): price is NonNullable<typeof price> => Boolean(price))
    .sort((left, right) => left.monthlySortValue - right.monthlySortValue);

  const minPrice = prices[0];
  if (!minPrice) return "待补充";
  return `${minPrice.currency}${minPrice.value.toFixed(2)} 起`;
}

function uniqueValues(values: Array<string | null>) {
  return [
    ...new Set(values.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
}

function getCollectionPath(kind: CollectionKind, value: string) {
  const segment =
    kind === "provider" ? "providers" : kind === "region" ? "regions" : "lines";
  return `/servers/${segment}/${encodeURIComponent(value)}`;
}

function buildJsonLd(input: {
  kind: CollectionKind;
  value: string;
  title: string;
  description: string;
  offers: Offer[];
  canonicalUrl: string;
}) {
  const copy = kindCopy[input.kind];
  const baseUrl = getSiteUrl();
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: input.title,
    description: input.description,
    url: input.canonicalUrl,
    numberOfItems: input.offers.length,
    itemListElement: input.offers.slice(0, 50).map((offer, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: toAbsoluteHttpUrl(offer.articleUrl, baseUrl) ?? input.canonicalUrl,
      item: {
        "@type": "Product",
        name: offer.title,
        brand: offer.providerName
          ? {
              "@type": "Brand",
              name: offer.providerName,
            }
          : undefined,
        category: "VPS and Server Hosting",
        offers: {
          "@type": "Offer",
          url:
            toAbsoluteHttpUrl(offer.purchaseUrl, baseUrl) ?? input.canonicalUrl,
          price: offer.priceAmount ? String(offer.priceAmount) : undefined,
          priceCurrency: offer.currency ?? undefined,
          availability:
            offer.status === "in_stock"
              ? "https://schema.org/InStock"
              : offer.status === "preorder"
                ? "https://schema.org/PreOrder"
                : "https://schema.org/OutOfStock",
        },
      },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "首页",
        item: getSiteUrl(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "服务器比价",
        item: `${getSiteUrl()}/servers`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: `${input.value}${copy.label}`,
        item: input.canonicalUrl,
      },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return [itemListJsonLd, breadcrumbJsonLd, faqJsonLd];
}

export function ServerOfferCollectionPage({
  kind,
  value,
  slug,
  toolHref,
  title,
  description,
  offers,
  updatedAt,
}: {
  kind: CollectionKind;
  value: string;
  slug: string;
  toolHref: string;
  title: string;
  description: string;
  offers: Offer[];
  updatedAt?: Date | string | null;
}) {
  const copy = kindCopy[kind];
  const canonicalUrl = `${getSiteUrl()}${getCollectionPath(kind, slug)}`;
  const inStockCount = offers.filter(
    (offer) => offer.status === "in_stock",
  ).length;
  const providers = uniqueValues(offers.map((offer) => offer.providerName));
  const regions = uniqueValues(offers.map((offer) => offer.region));
  const lines = uniqueValues(offers.map((offer) => offer.lineType));
  const topicLinks = offerTopics.filter((topic) =>
    topic.keywords.some((keyword) =>
      `${value} ${description}`.toLowerCase().includes(keyword.toLowerCase()),
    ),
  );

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScriptContent(
            buildJsonLd({
              kind,
              value,
              title,
              description,
              offers,
              canonicalUrl,
            }),
          ),
        }}
      />
      <section className="home-grid-surface border-b border-border/60">
        <div className="container mx-auto px-4 py-7 md:py-9">
          <Link
            href="/servers"
            prefetch
            className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            {copy.backText}
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/5 text-primary"
            >
              {copy.badge}
            </Badge>
            <span className="text-xs text-muted-foreground">
              预筛选套餐 · 价格默认从低到高
            </span>
          </div>
          <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {title || `${value}${copy.titleSuffix}`}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            {description}
          </p>

          <dl className="mt-5 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "套餐数", value: String(offers.length) },
              { label: "有货", value: String(inStockCount) },
              { label: "起价", value: formatMinPrice(offers) },
              { label: "数据更新", value: formatDate(updatedAt) },
            ].map((stat) => (
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
          <Link
            href={toolHref}
            prefetch
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            在库存工具中继续筛选
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <ServerOfferTable offers={offers} />
      </section>

      <section className="container mx-auto px-4 pb-12">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-border/70 bg-background p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              筛选建议
            </h2>
            <div className="mt-4 grid gap-4 text-sm leading-7 text-muted-foreground md:grid-cols-3">
              <div>
                <p className="font-medium text-foreground">商家</p>
                <p>{providers.slice(0, 5).join("、") || "暂无商家信息"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">地区</p>
                <p>{regions.slice(0, 5).join("、") || "暂无地区信息"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">线路</p>
                <p>{lines.slice(0, 5).join("、") || "暂无线路信息"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              相关入口
            </h2>
            <div className="mt-4 grid gap-2">
              <Link
                href={toolHref}
                prefetch
                className="flex min-h-11 items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                打开当前条件筛选
                <ArrowRight className="size-4" />
              </Link>
              {topicLinks.map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/servers/${encodeURIComponent(topic.slug)}`}
                  prefetch
                  className="flex min-h-11 items-center justify-between rounded-md border border-border/70 px-3 text-sm text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
                >
                  {topic.title}
                  <ArrowRight className="size-4" />
                </Link>
              ))}
              <Link
                href="/search"
                prefetch
                className="flex min-h-11 items-center justify-between rounded-md border border-border/70 px-3 text-sm text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
              >
                搜索更多服务器优惠
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            常见问题
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {copy.faq.map((item) => (
              <div
                key={item.question}
                className="rounded-lg border border-border/70 bg-background p-4 shadow-sm"
              >
                <h3 className="font-medium text-foreground">{item.question}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
