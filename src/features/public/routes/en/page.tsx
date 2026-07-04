import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import {
  getHomepagePostsWithTags,
  getHomepageSidebarData,
} from "@/features/public/data/post";
import { getSiteSeoConfig } from "@/features/shared/data/site-seo";
import ArticleCard from "@/features/public/components/article-card";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { SafePostImage } from "@/features/public/components/safe-post-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@fwqgo/core/utils";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { data } = await getSiteSeoConfig("en");

  return {
    title: data.title,
    description: data.description,
    keywords: data.keywords,
    alternates: {
      canonical: `${getSiteUrl()}/en`,
      languages: {
        "zh-CN": getSiteUrl(),
        en: `${getSiteUrl()}/en`,
        "x-default": getSiteUrl(),
      },
    },
    openGraph: {
      title: data.title,
      description: data.description,
      url: `${getSiteUrl()}/en`,
      siteName: data.siteName,
    },
  };
}

async function EnglishHomeContent() {
  await connection();

  const [{ data: posts }, { data: sidebarData }] = await Promise.all([
    getHomepagePostsWithTags("en"),
    getHomepageSidebarData("en"),
  ]);

  const safePosts = posts ?? [];
  const heroPost = safePosts[0];
  const listPosts = safePosts.slice(1);
  const promotedPosts = sidebarData?.promotedPosts ?? [];
  const popularPosts = sidebarData?.popularPosts ?? [];

  return (
    <main className="flex-1">
      <section className="home-grid-surface border-b border-border/60">
        <div className="container mx-auto grid gap-6 px-4 py-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-primary text-primary-foreground">
                VPS deals
              </Badge>
              <Badge variant="secondary">English articles</Badge>
            </div>
            <h1 className="font-editorial max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
              Find practical server deals, VPS reviews, and buying guides
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              Browse English hosting articles by provider, region, line type,
              use case, and current promotions.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link
                  href={
                    heroPost
                      ? `/en/fwq/posts/${heroPost.slug}`
                      : "#latest-english-articles"
                  }
                  prefetch
                >
                  Start reading
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/" prefetch>
                  中文首页
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          {heroPost ? (
            <Link
              href={`/en/fwq/posts/${heroPost.slug}`}
              prefetch
              className="group grid gap-4 overflow-hidden rounded-lg border border-border/70 bg-background p-3 shadow-sm md:grid-cols-[280px_minmax(0,1fr)]"
            >
              <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-muted md:aspect-square">
                <SafePostImage
                  src={heroPost.imgUrl}
                  alt={heroPost.title}
                  sizes="(max-width: 768px) 100vw, 280px"
                />
              </div>
              <div className="flex min-w-0 flex-col justify-center p-2 md:p-4">
                <p className="text-xs text-muted-foreground">
                  {formatDate(heroPost.createdAt)}
                </p>
                <h2 className="font-editorial mt-2 line-clamp-3 text-2xl font-semibold leading-tight group-hover:text-accent">
                  {heroPost.title}
                </h2>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {heroPost.description ?? "Read the full server deal article."}
                </p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <section
        id="latest-english-articles"
        className="container mx-auto grid gap-8 px-4 py-8 xl:grid-cols-[minmax(0,0.82fr)_320px]"
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Latest English articles
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Recently published English server deals and reviews.
            </p>
          </div>
          {listPosts.length > 0 ? (
            listPosts.map((post) => (
              <ArticleCard key={post.id} post={post} language="en" />
            ))
          ) : (
            <Card className="border-dashed border-border/80 bg-muted/20">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {safePosts.length > 0
                  ? "No more English articles yet."
                  : "No English articles have been published yet. Check the Chinese homepage or come back later."}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-foreground">
                Editor picks
              </p>
              <div className="mt-4 space-y-3">
                {promotedPosts.length > 0 ? (
                  promotedPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/en/fwq/posts/${post.slug}`}
                      prefetch
                      className="block rounded-md border border-border/70 p-3 text-sm hover:bg-muted/30"
                    >
                      <p className="line-clamp-2 font-medium">{post.title}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {post.description ?? "Read the article."}
                      </p>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No English picks configured yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-foreground">
                Popular articles
              </p>
              <div className="mt-4 space-y-3">
                {popularPosts.length > 0 ? (
                  popularPosts.map((post, index) => (
                    <Link
                      key={post.id}
                      href={`/en/fwq/posts/${post.slug}`}
                      prefetch
                      className="flex min-h-11 gap-3 rounded-md border border-border/70 p-3 text-sm hover:bg-muted/30"
                    >
                      <Badge variant="secondary">TOP {index + 1}</Badge>
                      <span className="line-clamp-2">{post.title}</span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No English popularity data yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}

export default function EnglishHomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="en" />
      <Separator />
      <Suspense
        fallback={
          <main className="flex-1 px-4 py-10 text-sm text-muted-foreground">
            Loading English homepage...
          </main>
        }
      >
        <EnglishHomeContent />
      </Suspense>
      <Separator className="mt-4" />
      <Footer language="en" />
    </div>
  );
}
