import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowLeft, ArrowUpDown, Filter, MapPin } from "lucide-react";

import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import { ServerOfferTable } from "@/features/public/components/server-offer-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getServerOfferTopic,
  offerTopics,
} from "@/server/offers/server-offers";
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
  const pageUrl = `${getSiteUrl()}/servers/${topicInfo.slug}`;
  const siteUrl = getSiteUrl();
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: topicInfo.seoTitle,
    description: topicInfo.description,
    url: pageUrl,
    numberOfItems: offers.length,
    itemListElement: offers.slice(0, 30).map((offer, index) => ({
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
        offers: {
          "@type": "Offer",
          url: toAbsoluteHttpUrl(offer.purchaseUrl, siteUrl) ?? pageUrl,
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
      <section className="border-b border-border/60 bg-muted/20">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <Button asChild variant="ghost" className="mb-5 px-0">
            <Link href="/servers" prefetch>
              <ArrowLeft className="size-4" />
              服务器比价
            </Link>
          </Button>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-primary text-primary-foreground">
                  结构化套餐
                </Badge>
                <Badge variant="secondary">按价格排序</Badge>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {topicInfo.h1}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                {topicInfo.intro}
              </p>
            </div>
            <div className="grid gap-3 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="size-4" />
                已筛选 {offers.length} 个可见套餐
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowUpDown className="size-4" />
                默认优先展示推荐和低价套餐
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                购买链接、来源文章、测评文章集中展示
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <ServerOfferTable offers={offers} />
      </section>

      <section className="container mx-auto px-4 pb-12">
        <div className="rounded-lg border border-border/70 bg-background p-5 shadow-sm">
          <h2 className="text-xl font-semibold">常见问题</h2>
          <div className="mt-4 grid gap-4 text-sm leading-7 text-muted-foreground md:grid-cols-2">
            {topicInfo.faq.map((item) => (
              <div key={item.question} className="rounded-lg bg-muted/30 p-4">
                <h3 className="font-medium text-foreground">{item.question}</h3>
                <p className="mt-2">{item.answer}</p>
              </div>
            ))}
          </div>
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
          <main className="flex-1">
            <section className="container mx-auto px-4 py-10">
              <Card className="border-border/70 bg-background shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  正在加载专题套餐...
                </CardContent>
              </Card>
            </section>
          </main>
        }
      >
        <ServerTopicContent params={params} />
      </Suspense>
      <Footer />
    </div>
  );
}
