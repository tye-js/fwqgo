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
  params: Promise<{ provider: string }>;
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
  const { provider } = await params;
  const value = normalizeServerCollectionSlug(provider);
  if (!value) return {};

  const data = await getServerOfferCollection({ kind: "provider", value });
  const label = data?.value ?? value;
  const slug = data?.slug ?? value;
  const canonicalUrl = `${getSiteUrl()}/servers/providers/${encodeURIComponent(slug)}`;
  const title = `${label}服务器优惠套餐 - 服务器go`;
  const description =
    data?.description ??
    `集中查看 ${label} 相关 VPS、云服务器和独立服务器套餐，比较价格、地区、线路、优惠码和购买入口。`;

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

async function ProviderContent({ params }: PageProps) {
  const { provider } = await params;
  const value = normalizeServerCollectionSlug(provider);
  if (!value) {
    notFound();
  }

  const data = await getServerOfferCollection({ kind: "provider", value });

  if (!data || data.offers.length === 0) {
    notFound();
  }

  return (
    <ServerOfferCollectionPage
      kind="provider"
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

export default function ServerProviderPage({ params }: PageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1">
            <section className="container mx-auto px-4 py-10">
              <Card className="border-border/70 bg-background shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  正在加载商家套餐...
                </CardContent>
              </Card>
            </section>
          </main>
        }
      >
        <ProviderContent params={params} />
      </Suspense>
      <Footer />
    </div>
  );
}
