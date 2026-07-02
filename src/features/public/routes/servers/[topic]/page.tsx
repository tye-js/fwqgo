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
import { getServerOfferTopic, offerTopics } from "@/server/offers/server-offers";

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

  return {
    title: `${topicInfo.title}优惠套餐对比 - 服务器go`,
    description: topicInfo.description,
    keywords: topicInfo.keywords.join(","),
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

  return (
    <main className="flex-1">
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
                  {topicInfo.title}优惠套餐
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                  {topicInfo.description}
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
                  购买链接、推广文章、测评文章集中展示
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
            <h2 className="text-xl font-semibold">怎么使用这个列表</h2>
            <div className="mt-4 grid gap-4 text-sm leading-7 text-muted-foreground md:grid-cols-3">
              <p>
                价格字段优先使用文章里提取到的标准化金额，部分套餐可能需要人工确认周期和币种。
              </p>
              <p>
                地区和线路来自文章原文，适合先做初筛，最终购买前仍建议查看推广文章和商家页面。
              </p>
              <p>
                状态支持有货、没货、补货、停售、预售，后续可以接入手工维护和定期复查。
              </p>
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
