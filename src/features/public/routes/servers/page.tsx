import Link from "next/link";
import { ArrowRight, Server } from "lucide-react";
import { Suspense } from "react";
import { connection } from "next/server";

import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getServerOfferTopicCounts, offerTopics } from "@/server/offers/server-offers";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

export const metadata = {
  title: "服务器比价 - 服务器go",
  description:
    "按香港服务器、美国服务器、便宜 VPS 等专题集中查看结构化服务器套餐、价格、线路、购买链接和推广文章。",
  alternates: {
    canonical: `${getSiteUrl()}/servers`,
  },
  openGraph: {
    title: "服务器比价 - 服务器go",
    description:
      "按香港服务器、美国服务器、便宜 VPS 等专题集中查看结构化服务器套餐、价格、线路、购买链接和推广文章。",
    url: `${getSiteUrl()}/servers`,
    siteName: "服务器go",
  },
};

async function ServersContent() {
  await connection();

  const counts = await getServerOfferTopicCounts();
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "服务器比价专题",
    description: metadata.description,
    url: `${getSiteUrl()}/servers`,
    itemListElement: offerTopics.map((topic, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${getSiteUrl()}/servers/${topic.slug}`,
      name: topic.title,
      description: topic.description,
    })),
  };

  return (
    <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
        <section className="border-b border-border/60 bg-muted/20">
          <div className="container mx-auto px-4 py-10 md:py-14">
            <div className="max-w-3xl space-y-4">
              <Badge className="bg-primary text-primary-foreground">
                服务器比价
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                用结构化列表筛选服务器套餐
              </h1>
              <p className="text-sm leading-7 text-muted-foreground md:text-base">
                从推广文章中提取价格、地区、线路、配置、购买链接和相关文章，把文章流量转成更直接的选购入口。
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-8 md:py-10">
          <div className="grid gap-4 md:grid-cols-3">
            {offerTopics.map((topic) => {
              const count =
                counts.find((item) => item.slug === topic.slug)?.count ?? 0;

              return (
                <Link
                  key={topic.slug}
                  href={`/servers/${topic.slug}`}
                  prefetch
                  className="group rounded-lg border border-border/70 bg-background p-5 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Server className="size-5" />
                    </div>
                    <Badge variant="secondary">{count} 个套餐</Badge>
                  </div>
                  <h2 className="mt-5 text-xl font-semibold">{topic.title}</h2>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {topic.description}
                  </p>
                  <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
                    查看专题
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="container mx-auto px-4 pb-12">
          <div className="rounded-lg border border-border/70 bg-background p-5 shadow-sm">
            <h2 className="text-xl font-semibold">为什么保留文章入口</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              比价列表负责高效率比较和购买转化，推广文章和测评文章继续负责 SEO、背景说明、商家活动细节和使用场景。两个入口互相链接，避免原有文章导航权重被破坏。
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/fwq/vps/page/1" prefetch>
                继续查看文章分类
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
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
          <main className="flex-1">
            <section className="container mx-auto px-4 py-10">
              <Card className="border-border/70 bg-background shadow-sm">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  正在加载服务器专题...
                </CardContent>
              </Card>
            </section>
          </main>
        }
      >
        <ServersContent />
      </Suspense>
      <Footer />
    </div>
  );
}
