import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ServerOfferCollectionPage } from "@/features/public/components/server-offer-collection-page";
import { Card, CardContent } from "@/components/ui/card";
import { normalizeServerCollectionSlug } from "@fwqgo/core/public-inventory-filters";
import { getServerOfferCollection } from "@/server/offers/server-offers";

type PageProps = {
  params: Promise<{ line: string }>;
};

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { line } = await params;
  const value = normalizeServerCollectionSlug(line);
  if (!value) return {};

  const data = await getServerOfferCollection({ kind: "line", value });
  const label = data?.value ?? value;
  const slug = data?.slug ?? value;
  const canonicalUrl = `${getSiteUrl()}/servers/lines/${encodeURIComponent(slug)}`;
  const title = `${label}线路服务器优惠套餐 - 服务器go`;
  const description =
    data?.description ??
    `集中查看 ${label} 线路相关 VPS、云服务器和独立服务器套餐，比较价格、地区、优惠码和购买入口。`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: data?.indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "服务器go",
    },
  };
}

async function LineContent({ params }: PageProps) {
  const { line } = await params;
  const value = normalizeServerCollectionSlug(line);
  if (!value) {
    notFound();
  }

  const data = await getServerOfferCollection({ kind: "line", value });

  if (!data || data.offers.length === 0) {
    notFound();
  }

  return (
    <ServerOfferCollectionPage
      kind="line"
      value={data.value}
      slug={data.slug}
      toolHref={data.toolHref}
      title={data.title}
      description={data.description}
      offers={data.offers}
      updatedAt={data.updatedAt}
    />
  );
}

export default function ServerLinePage({ params }: PageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1">
            <section className="container mx-auto px-4 py-10">
              <Card className="border-border/70 bg-background shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  正在加载线路套餐...
                </CardContent>
              </Card>
            </section>
          </main>
        }
      >
        <LineContent params={params} />
      </Suspense>
      <Footer />
    </div>
  );
}
