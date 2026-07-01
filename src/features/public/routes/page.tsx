import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  ShoppingCart,
} from "lucide-react";

import {
  getHomepagePostsWithTags,
  getHomepageSidebarData,
} from "@/app/_actions/post";
import { HeroTagSearch } from "@/app/_components/hero-tag-search";
import ArticleCard from "@/app/_components/article-card";
import Footer from "@/app/_components/footer";
import Header from "@/app/_components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Suspense } from "react";
import { connection } from "next/server";
import { Separator } from "@/components/ui/separator";
import { getOptimizedImageSrc } from "@/lib/image-src";
import { formatDate, isWithin24Hours } from "@/lib/utils";
import {
  getLatestServerOffers,
  getServerOfferTopicCounts,
  offerTopics,
} from "@/server/offers/server-offers";

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatOfferPrice(offer: Awaited<ReturnType<typeof getLatestServerOffers>>[number]) {
  if (!offer.priceAmount) return "价格待补充";

  const currency = offer.currency === "CNY" ? "¥" : "$";
  const cycleMap: Record<string, string> = {
    monthly: "月付",
    quarterly: "季付",
    semiannual: "半年",
    yearly: "年付",
  };
  const cycle = offer.billingCycle
    ? cycleMap[offer.billingCycle] ?? offer.billingCycle
    : "周期待确认";

  return `${currency}${Number(offer.priceAmount).toFixed(2)} / ${cycle}`;
}

function topValues(values: Array<string | null>, limit = 4) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function HeroArticleTile({
  slug,
  title,
  createdAt,
  description,
  imgUrl,
  tags,
  variant = "small",
}: {
  slug: string;
  title: string;
  createdAt: Date;
  description: string | null;
  imgUrl: string | null;
  tags: Array<{ tag: { id: number; name: string; slug: string } }>;
  variant?: "large" | "small";
}) {
  const isLarge = variant === "large";

  return (
    <Link
      href={`/fwq/posts/${slug}`}
      className={`glass-card group relative flex flex-col justify-end overflow-hidden rounded-2xl ${
        isLarge ? "min-h-[300px] md:min-h-[420px]" : "min-h-[180px]"
      }`}
    >
      {imgUrl ? (
        <Image
          src={getOptimizedImageSrc(imgUrl)}
          alt={title}
          fill
          priority={isLarge}
          sizes={
            isLarge
              ? "(max-width: 1024px) 100vw, 50vw"
              : "(max-width: 1024px) 100vw, 24vw"
          }
          className="z-0 object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 z-0 bg-[linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))]" />
      )}
      <div className="absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.28)_36%,rgba(2,6,23,0.9)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 z-10 h-2/3 bg-[radial-gradient(circle_at_20%_100%,rgba(37,99,235,0.26),transparent_38%)]" />

      <div className="absolute inset-x-0 bottom-0 z-20 p-4 text-white md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {isWithin24Hours(createdAt) ? (
            <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
              新上架
            </Badge>
          ) : null}
          <Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">
            {createdAt.toLocaleDateString("zh-CN")}
          </Badge>
        </div>
        <h2
          className={`font-editorial mt-2 font-semibold leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] ${
            isLarge ? "text-2xl md:text-3xl" : "text-lg md:text-xl"
          }`}
        >
          {title}
        </h2>
        <p
          className={`mt-2 max-w-2xl text-sm text-white/85 drop-shadow ${
            isLarge ? "line-clamp-2 leading-6" : "line-clamp-2 leading-6"
          }`}
        >
          {description ?? "查看线路、优惠与适用场景详情。"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.slice(0, isLarge ? 4 : 2).map((tag) => (
            <span
              key={tag.tag.id}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/90"
            >
              #{tag.tag.name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

async function HomeContent() {
  await connection();

  const [
    { data: posts },
    { data: sidebarData },
    offerCounts,
    latestOffers,
  ] = await Promise.all([
    getHomepagePostsWithTags(),
    getHomepageSidebarData(),
    getServerOfferTopicCounts(),
    getLatestServerOffers(6),
  ]);

  const safePosts = posts ?? [];
  const heroPosts = safePosts.slice(0, 5);
  const listPosts = safePosts.slice(5);
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const popularPosts = sidebarData?.popularPosts ?? [];
  const topProviders = topValues(latestOffers.map((offer) => offer.providerName));
  const topRegions = topValues(latestOffers.map((offer) => offer.region));
  const latestPromoOffers = latestOffers.filter((offer) => offer.promoCode).slice(0, 3);

  return (
    <main className="flex-1">
      <section className="home-grid-surface relative overflow-hidden border-b border-border/60">
        <div className="container relative mx-auto px-4 py-6 md:py-8">
          <div className="grid gap-5 xl:grid-cols-[0.68fr_1.32fr] xl:items-start">
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">
                    服务器优惠聚合
                  </Badge>
                  <Badge variant="secondary">标签直达</Badge>
                </div>
                <h1 className="font-editorial text-gradient max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-5xl">
                  更快找到合适的服务器优惠和选购文章
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                  按地区、线路、用途和品牌快速进入专题内容，集中查看 VPS、云服务器、独立服务器的优惠与测评信息。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild className="h-10 rounded-md px-5">
                  <Link
                    href={
                      heroPosts[0]
                        ? `/fwq/posts/${heroPosts[0].slug}`
                        : "/fwq/vps/page/1"
                    }
                  >
                    开始浏览
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-md px-5"
                >
                  <Link href="/fwq/export-vps/page/1">
                    出海服务器专区
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              </div>

              <HeroTagSearch />
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              {heroPosts[0] ? (
                <div>
                  <HeroArticleTile
                    slug={heroPosts[0].slug}
                    title={heroPosts[0].title}
                    description={heroPosts[0].description}
                    imgUrl={heroPosts[0].imgUrl}
                    createdAt={heroPosts[0].createdAt}
                    tags={heroPosts[0].tags}
                    variant="large"
                  />
                </div>
              ) : null}

              <div className="space-y-3">
                {heroPosts.slice(1, 5).map((post) => (
                  <Link
                    key={post.id}
                    href={`/fwq/posts/${post.slug}`}
                    className="glass-card hover-lift group flex min-h-[98px] items-start gap-3 rounded-xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" />
                        {post.createdAt.toLocaleDateString("zh-CN")}
                      </div>
                      <h2 className="font-editorial mt-2 line-clamp-2 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
                        {post.title}
                      </h2>
                      <p className="mt-1 line-clamp-1 text-sm leading-6 text-muted-foreground">
                        {post.description ?? "查看这篇文章的线路、优惠与适用场景。"}
                      </p>
                    </div>
                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <div className="glass-card mb-8 rounded-2xl p-6 md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Badge className="bg-primary text-primary-foreground">
                服务器比价
              </Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                按套餐直接比较价格、地区和线路
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                推广文章继续保留，结构化列表用于快速筛选香港服务器、美国服务器和便宜 VPS。
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/servers">
                查看全部专题
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {offerTopics.map((topic) => {
              const count =
                offerCounts.find((item) => item.slug === topic.slug)?.count ?? 0;

              return (
                <Link
                  key={topic.slug}
                  href={`/servers/${topic.slug}`}
                  className="glass-card group rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">{topic.title}</p>
                    <Badge variant="secondary">{count} 个</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {topic.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.8fr)_320px] xl:items-start">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  最新优惠与评测
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  按发布时间整理近期内容，适合快速比较线路、价格和使用场景。
                </p>
              </div>
              <Badge variant="secondary">{formatCount(listPosts.length)} 篇</Badge>
            </div>

            <div className="space-y-4">
              {listPosts.length > 0 ? (
                listPosts.map((post) => <ArticleCard key={post.id} post={post} />)
              ) : (
                <Card className="border-dashed border-border/80 bg-muted/20">
                  <CardContent className="p-8 text-center">
                    <p className="text-base font-medium text-foreground">
                      暂时还没有更多文章内容
                    </p>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      稍后刷新看看，或者先通过上方标签搜索进入目标聚合页。
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="glass-card rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShoppingCart className="size-4 text-primary" />
                    最新可购买套餐
                  </div>
                  <Link
                    href="/servers"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    全部
                  </Link>
                </div>
                <div className="mt-4 space-y-3">
                  {latestOffers.slice(0, 3).map((offer) => (
                    <Link
                      key={offer.id}
                      href={offer.articleUrl ?? "/servers"}
                      className="glass-card block rounded-xl p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-medium leading-5">
                            {offer.title}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {offer.providerName ?? "商家待补充"} ·{" "}
                            {offer.region ?? "地区待补充"}
                          </p>
                        </div>
                        <p className="shrink-0 text-right text-xs font-semibold text-primary">
                          {formatOfferPrice(offer)}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {latestOffers.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                      暂无结构化套餐。
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card rounded-2xl">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <MapPin className="size-4 text-primary" />
                  热门筛选
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">热门商家</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {topProviders.map((item) => (
                        <Badge key={item.name} variant="secondary">
                          {item.name} {item.count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">热门地区</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {topRegions.map((item) => (
                        <Badge key={item.name} variant="outline">
                          {item.name} {item.count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {latestPromoOffers.length > 0 ? (
                    <div>
                      <p className="text-xs text-muted-foreground">最新优惠码</p>
                      <div className="mt-2 space-y-2">
                        {latestPromoOffers.map((offer) => (
                          <Link
                            key={offer.id}
                            href={offer.articleUrl ?? "/servers"}
                            className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-xs hover:bg-muted/30"
                          >
                            <span className="line-clamp-1">
                              {offer.providerName ?? offer.title}
                            </span>
                            <Badge>{offer.promoCode}</Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">站长推荐</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      近期值得优先查看的内容
                    </p>
                  </div>
                  <Badge variant="secondary">推广位</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card rounded-2xl">
              <CardContent className="space-y-3 p-5">
                {promotedPosts.length > 0 ? (
                  promotedPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/fwq/posts/${post.slug}`}
                      className="glass-card block rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="line-clamp-2 font-medium">{post.title}</p>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {post.description ?? "查看推广文章详情。"}
                          </p>
                        </div>
                        <ArrowUpRight className="mt-1 size-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    当前还没有推荐文章。
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      高浏览量文章
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      按累计浏览量排序
                    </p>
                  </div>
                  <Badge variant="secondary">热门</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card rounded-2xl">
              <CardContent className="space-y-3 p-5">
                {popularPosts.map((post, index) => (
                  <Link
                    key={post.id}
                    href={`/fwq/posts/${post.slug}`}
                    className="glass-card block rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">TOP {index + 1}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(post.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-2 font-medium">{post.title}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">浏览量</p>
                        <p className="mt-1 text-sm font-semibold">
                          {formatCount(post.views)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Separator />
      <Suspense
        fallback={
          <main className="flex-1">
            <section className="container mx-auto px-4 py-10 md:py-14">
              <Card className="border-border/70 bg-background/85 shadow-sm">
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  正在加载首页内容...
                </CardContent>
              </Card>
            </section>
          </main>
        }
      >
        <HomeContent />
      </Suspense>
      <Separator className="mt-4" />
      <Footer />
    </div>
  );
}
