import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  TrendingUp,
} from "lucide-react";

import {
  getHomepagePostsWithTags,
  getHomepageSidebarData,
} from "@/app/_actions/post";
import { HeroTagSearch } from "@/app/_components/hero-tag-search";
import ArticleCard from "./_components/article-card";
import Footer from "@/app/_components/footer";
import Header from "@/app/_components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Suspense } from "react";
import { connection } from "next/server";
import { Separator } from "@/components/ui/separator";
import { formatDate, isWithin24Hours } from "@/lib/utils";

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
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
      className={`group relative overflow-hidden rounded-[28px] border border-border/70 bg-background/85 shadow-[0_20px_60px_-38px_rgba(15,23,42,0.45)] backdrop-blur ${
        isLarge ? "min-h-[320px] md:min-h-[520px]" : "min-h-[220px]"
      }`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.72))]" />
      {imgUrl ? (
        <Image
          src={`${process.env.NEXT_PUBLIC_URL}${imgUrl}`}
          alt={title}
          fill
          priority={isLarge}
          sizes={
            isLarge
              ? "(max-width: 1024px) 100vw, 42vw"
              : "(max-width: 1024px) 100vw, 22vw"
          }
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.24),transparent_32%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))]" />
      )}

      <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-6">
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
          className={`font-editorial mt-3 font-semibold leading-tight tracking-[-0.04em] ${
            isLarge ? "text-2xl md:text-3xl" : "text-lg md:text-xl"
          }`}
        >
          {title}
        </h2>
        <p
          className={`mt-3 max-w-2xl text-sm text-white/80 ${
            isLarge ? "line-clamp-3 leading-7" : "line-clamp-2 leading-6"
          }`}
        >
          {description ?? "查看线路、优惠与适用场景详情。"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
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

  const [{ data: posts }, { data: sidebarData }] = await Promise.all([
    getHomepagePostsWithTags(),
    getHomepageSidebarData(),
  ]);

  const safePosts = posts ?? [];
  const heroPosts = safePosts.slice(0, 5);
  const listPosts = safePosts.slice(5);
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const popularPosts = sidebarData?.popularPosts ?? [];

  return (
    <main className="flex-1">
      <section className="home-grid-surface relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_26%)]" />
        <div className="container relative mx-auto px-4 py-10 md:py-14">
          <div className="grid gap-8 xl:grid-cols-[0.84fr_1.16fr]">
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">
                    服务器优惠聚合
                  </Badge>
                  <Badge variant="secondary">标签直达</Badge>
                </div>
                <h1 className="font-editorial max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.05em] text-foreground md:text-5xl">
                  先用标签定位方向，再进入最值得先看的服务器内容
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                  搜索现在不会即时筛选页面，而是在你点击搜索后直接去 `tags`
                  表里查询并跳转。Hero 区也集中展示 5 篇文章，让首页像一个真正的内容入口。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full px-6">
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
                  size="lg"
                  className="rounded-full px-6"
                >
                  <Link href="/fwq/export-vps/page/1">看看出海专区</Link>
                  </Button>
                </div>

              <HeroTagSearch />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                    className="group flex items-start gap-4 rounded-[24px] border border-border/70 bg-background/90 p-4 shadow-sm transition-colors hover:border-accent/30 hover:bg-accent/5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" />
                        {post.createdAt.toLocaleDateString("zh-CN")}
                      </div>
                      <h2 className="font-editorial mt-3 line-clamp-2 text-xl font-semibold leading-tight tracking-[-0.04em] text-foreground transition-colors group-hover:text-accent">
                        {post.title}
                      </h2>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
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
        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.8fr)_320px] xl:items-start">
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  最新优惠与评测
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  正文区宽度收窄了一些，阅读会更集中，右边留给推广内容和高浏览文章。
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
                      稍后刷新看看，或者先从 hero 的标签搜索进入目标聚合页。
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="border-border/70 bg-[linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)/0.45))] shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <TrendingUp className="size-4 text-primary" />
                  侧栏内容位
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  右侧现在展示站长选中的推广文章和高浏览量文章，便于你在首页做更明确的内容引导。
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">站长推荐</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      从独立表 `homepage_promoted_posts` 读取
                    </p>
                  </div>
                  <Badge variant="secondary">推广位</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="space-y-3 p-5">
                {promotedPosts.length > 0 ? (
                  promotedPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/fwq/posts/${post.slug}`}
                      className="block rounded-2xl border border-border/70 bg-background/80 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
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
                    当前还没有配置推广文章。把文章 ID 写入
                    `homepage_promoted_posts` 表后，这里就会自动展示。
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
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

            <Card className="border-border/70 shadow-sm">
              <CardContent className="space-y-3 p-5">
                {popularPosts.map((post, index) => (
                  <Link
                    key={post.id}
                    href={`/fwq/posts/${post.slug}`}
                    className="block rounded-2xl border border-border/70 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
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
