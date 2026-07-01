import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ServerOfferTable } from "@/features/public/components/server-offer-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { decodeSlug } from "@fwqgo/core/utils";
import { getServerOfferCollection } from "@/server/offers/server-offers";

type PageProps = {
  params: Promise<{ region: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { region } = await params;
  const value = decodeSlug(region);

  return {
    title: `${value}服务器优惠套餐 - 服务器go`,
    description: `集中查看 ${value} VPS、云服务器和独立服务器套餐，比较价格、线路、优惠码和购买入口。`,
  };
}

async function RegionContent({ params }: PageProps) {
  const { region } = await params;
  const value = decodeSlug(region);
  const data = await getServerOfferCollection({ kind: "region", value });

  if (!data || data.offers.length === 0) {
    notFound();
  }

  return (
    <main className="flex-1">
      <section className="border-b border-border/60 bg-muted/20">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <Button asChild variant="ghost" className="mb-5 px-0">
            <Link href="/servers">
              <ArrowLeft className="size-4" />
              服务器比价
            </Link>
          </Button>
          <div className="space-y-4">
            <Badge className="bg-primary text-primary-foreground">地区套餐</Badge>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {value}服务器优惠套餐
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              {data.description}
            </p>
          </div>
        </div>
      </section>
      <section className="container mx-auto px-4 py-8 md:py-10">
        <ServerOfferTable offers={data.offers} />
      </section>
    </main>
  );
}

export default function ServerRegionPage({ params }: PageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="flex-1">
            <section className="container mx-auto px-4 py-10">
              <Card className="border-border/70 bg-background shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  正在加载地区套餐...
                </CardContent>
              </Card>
            </section>
          </main>
        }
      >
        <RegionContent params={params} />
      </Suspense>
      <Footer />
    </div>
  );
}
