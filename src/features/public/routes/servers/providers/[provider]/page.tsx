import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ServerOfferCollectionPage } from "@/features/public/components/server-offer-collection-page";
import { Card, CardContent } from "@/components/ui/card";
import { decodeSlug } from "@fwqgo/core/utils";
import { getServerOfferCollection } from "@/server/offers/server-offers";

type PageProps = {
  params: Promise<{ provider: string }>;
};

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { provider } = await params;
  const value = decodeSlug(provider);
  const canonicalUrl = `${getSiteUrl()}/servers/providers/${encodeURIComponent(value)}`;
  const title = `${value}服务器优惠套餐 - 服务器go`;
  const description = `集中查看 ${value} 相关 VPS、云服务器和独立服务器套餐，比较价格、地区、线路、优惠码和购买入口。`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "服务器go",
    },
  };
}

async function ProviderContent({ params }: PageProps) {
  await connection();

  const { provider } = await params;
  const value = decodeSlug(provider);
  const data = await getServerOfferCollection({ kind: "provider", value });

  if (!data || data.offers.length === 0) {
    notFound();
  }

  return (
    <ServerOfferCollectionPage
      kind="provider"
      value={value}
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
