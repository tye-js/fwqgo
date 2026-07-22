import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import { ServerOfferTable } from "@/features/public/components/server-offer-table";
import { Badge } from "@/components/ui/badge";
import {
  getServerOfferTopic,
  offerTopics,
} from "@/server/offers/server-offers";
import {
  formatServerOfferAmount,
  isSupportedServerOfferCurrency,
  parseServerOfferAmount,
  resolveMonthlyPriceUsd,
} from "@fwqgo/core/server-offer-price";
import { jsonLdScriptContent, toAbsoluteHttpUrl } from "@fwqgo/core/utils";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export function generateStaticParams() {
  return offerTopics.map((topic) => ({ topic: topic.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  const topicInfo = offerTopics.find((item) => item.slug === topic);

  if (!topicInfo) {
    return {};
  }

  const canonicalUrl = `${getSiteUrl()}/servers/${topic}`;

  return {
    title: `${topicInfo.seoTitle} - 服务器go`,
    description: topicInfo.description,
    keywords: topicInfo.keywords.join(","),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${topicInfo.seoTitle} - 服务器go`,
      description: topicInfo.description,
      url: canonicalUrl,
      siteName: "服务器go",
    },
  };
}

async function ServerTopicContent({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  await connection();
  const { topic } = await params;
  const data = await getServerOfferTopic(topic);

  if (!data) {
    notFound();
  }

  const { topic: topicInfo, offers } = data;
  const inventoryHref =
    topicInfo.slug === "cheap-vps"
      ? "/servers?maxPrice=8&stock=all"
      : `/servers?region=${topicInfo.slug}&stock=all`;
  const inStockCount = offers.filter(
    (offer) => offer.status === "in_stock",
  ).length;
  const providerCount = new Set(
    offers
      .map((offer) => offer.providerName?.trim())
      .filter((value): value is string => Boolean(value)),
  ).size;
  const minPriceOffer = offers
    .map((offer) => {
      const formattedAmount = formatServerOfferAmount({
        amount: offer.priceAmount,
        currency: offer.currency,
      });
      const monthlyPriceUsd = resolveMonthlyPriceUsd({
        monthlyPriceUsd: offer.monthlyPriceUsd,
        amount: offer.priceAmount,
        currency: offer.currency,
        billingCycle: offer.billingCycle,
      });
      if (!formattedAmount || monthlyPriceUsd === null) {
        return null;
      }
      return {
        formattedAmount,
        monthlyPriceUsd,
      };
    })
    .filter((price): price is NonNullable<typeof price> => Boolean(price))
    .sort((left, right) => left.monthlyPriceUsd - right.monthlyPriceUsd)[0];
  const summaryStats: Array<{ label: string; value: string }> = [
    { label: "套餐数", value: offers.length.toLocaleString("zh-CN") },
    { label: "有货", value: inStockCount.toLocaleString("zh-CN") },
    { label: "商家", value: providerCount.toLocaleString("zh-CN") },
    {
      label: "起价",
      value: minPriceOffer?.formattedAmount ?? "待补充",
    },
  ];
  const pageUrl = `${getSiteUrl()}/servers/${topicInfo.slug}`;
  const siteUrl = getSiteUrl();
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: topicInfo.seoTitle,
    description: topicInfo.description,
    url: pageUrl,
    numberOfItems: offers.length,
    itemListElement: offers.slice(0, 30).map((offer, index) => {
      const purchaseUrl = toAbsoluteHttpUrl(offer.purchaseUrl, siteUrl);
      const price = parseServerOfferAmount(offer.priceAmount);
      const currency = offer.currency?.trim().toUpperCase();
      const structuredOffer =
        purchaseUrl &&
        price !== null &&
        price > 0 &&
        isSupportedServerOfferCurrency(currency)
          ? {
              "@type": "Offer",
              url: purchaseUrl,
              price: String(price),
              priceCurrency: currency,
              availability:
                offer.status === "in_stock"
                  ? "https://schema.org/InStock"
                  : offer.status === "preorder"
                    ? "https://schema.org/PreOrder"
                    : "https://schema.org/OutOfStock",
            }
          : undefined;

      return {
        "@type": "ListItem",
        position: index + 1,
        url: toAbsoluteHttpUrl(offer.articleUrl, siteUrl) ?? pageUrl,
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
          offers: structuredOffer,
        },
      };
    }),
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: topicInfo.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScriptContent([itemListJsonLd, faqJsonLd]),
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
            返回服务器比价
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/5 text-primary"
            >
              {topicInfo.shortTitle}专题
            </Badge>
            <span className="text-xs text-muted-foreground">
              预筛选套餐 · 价格默认从低到高
            </span>
          </div>
          <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {topicInfo.h1}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            {topicInfo.intro}
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
          <Link
            href={inventoryHref}
            prefetch
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            在库存工具中筛选全部套餐
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <ServerOfferTable offers={offers} />
      </section>

      <section className="container mx-auto px-4 pb-12">
        <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          常见问题
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {topicInfo.faq.map((item) => (
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
      </section>
    </main>
  );
}

export default function ServerTopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1 px-4 py-10 text-center text-sm text-muted-foreground">
            正在加载专题套餐...
          </main>
        }
      >
        <ServerTopicContent params={params} />
      </Suspense>
      <Footer />
    </div>
  );
}
