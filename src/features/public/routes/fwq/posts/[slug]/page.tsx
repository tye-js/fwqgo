import {
  getPostWithTagsBySlug,
  getPostBySlug,
  getLatestPostsForSidebar,
  getPostsByPostId,
} from "@/features/public/data/post";

import { getOptimizedImageSrc } from "@fwqgo/core/image-src";
import { decodeSlug, formatDate, isInternalHref } from "@fwqgo/core/utils";
import Link from "next/link";
import type { Metadata } from "next";
import { TableOfContents } from "@/components/toc/table-of-contents";
import {
  BookOpenText,
  ArrowLeftToLine,
  ArrowRightToLine,
  Clock,
  SquareLibrary,
  Tags,
} from "lucide-react";
import Image from "next/image";
import { Suspense } from "react";
import { PostViewCount } from "@/features/public/components/post-view-count";
import { RecommendedPostCard } from "@/features/public/components/recommended-post-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import { WebmasterStatement } from "@/features/public/components/webmaster-statement";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import { Card, CardContent } from "@/components/ui/card";
import { notFound } from "next/navigation";
import {
  getRelatedServerOffersForPost,
  offerTopics,
} from "@/server/offers/server-offers";
import { Badge } from "@/components/ui/badge";

function formatOfferPrice(offer: Awaited<ReturnType<typeof getRelatedServerOffersForPost>>[number]) {
  if (!offer.priceAmount) return "价格待补充";
  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) return "价格待确认";
  return `${offer.currency === "CNY" ? "¥" : "$"}${amount.toFixed(2)}`;
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

function toAbsoluteUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value, getSiteUrl()).toString();
  } catch {
    return undefined;
  }
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const decodedSlug = decodeSlug(params.slug);
  const { data: post, error } = await postInfo(decodedSlug);
  if (error || !post)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  const canonicalUrl = `${getSiteUrl()}/fwq/posts/${encodeURIComponent(decodedSlug)}`;
  const englishUrl = post.enSlug
    ? `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(post.enSlug)}`
    : undefined;
  const description = post.description ?? `${post.title}`;
  const imageUrl = toAbsoluteUrl(post.imgUrl);

  return {
    title: post.title,
    description,
    keywords: post.keywords ?? `${post.title}`,
    alternates: {
      canonical: canonicalUrl,
      languages: englishUrl
        ? {
            "zh-CN": canonicalUrl,
            en: englishUrl,
          }
        : undefined,
    },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: canonicalUrl,
      siteName: "服务器go",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: post.title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

async function PostPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>;
}) {
  const params = await paramsPromise;
  const decodedSlug = decodeSlug(params.slug);
  const { data, error } = await getPostWithTagsBySlug(decodedSlug);
  if (error) return <div>加载失败: {error}</div>;
  if (!data) notFound();
  const { post, recommendedPosts } = data;

  if (!post) notFound();
  const contentWithIds = post.content;

  const { data: posts } = await getPostsByPostId(post.id);
  const [prevPost, nextPost] = posts ?? [null, null];
  const [{ data: latestPosts }, relatedOffers] = await Promise.all([
    getLatestPostsForSidebar(),
    getRelatedServerOffersForPost({
      postId: post.id,
      tagNames: post.tags.map((tag) => tag.tag.name),
    }),
  ]);
  const matchedTopics = offerTopics.filter((topic) => {
    const text = `${post.title} ${post.description ?? ""} ${post.tags
      .map((tag) => tag.tag.name)
      .join(" ")}`;
    return topic.keywords.some((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    );
  });
  const articleUrl = `${getSiteUrl()}/fwq/posts/${decodedSlug}`;
  const absoluteImageUrl = toAbsoluteUrl(post.imgUrl);

  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    image: absoluteImageUrl,
    description: post.description,
    datePublished: post.createdAt,
    dateModified: post.updatedAt ?? post.createdAt,
    author: {
      "@type": "Person",
      name: "服务器go",
    },
    publisher: {
      "@type": "Organization",
      name: "服务器go",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "首页",
        item: getSiteUrl(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "文章",
        item: `${getSiteUrl()}/fwq/posts/${decodedSlug}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: articleUrl,
      },
    ],
  };
  return (
    <div className="py-4 md:py-6">
      <div className="grid items-start gap-8 xl:grid-cols-[260px_minmax(0,1fr)_300px] 2xl:grid-cols-[280px_minmax(0,920px)_320px]">
        <aside className="sticky top-20 hidden max-h-[calc(100dvh-96px)] self-start xl:block">
          <div>
            <Card className="rounded-lg border-border/70 bg-background shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <BookOpenText className="size-4 text-accent" />
                  本文目录
                </div>
                <div className="mt-3">
                  <TableOfContents content={contentWithIds} />
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <article className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify([blogPostingJsonLd, breadcrumbJsonLd]),
              }}
            />
            <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),rgba(255,255,255,0.92))] px-5 py-5 sm:px-6 md:px-8 md:py-6">
              <h1 className="font-editorial max-w-4xl text-3xl font-semibold leading-tight text-foreground md:text-4xl">
                {post.title}
              </h1>
              <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                {post.description ??
                  "这篇文章包含线路、机房、价格与使用场景的完整信息，适合继续深入阅读。"}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <div className="inline-flex items-center gap-2">
                  <Clock className="size-4" />
                  {formatDate(post.createdAt)}
                </div>
                <PostViewCount slug={decodedSlug} initialViews={post.views} />
                {post.recommendedTagName ? (
                  <Link
                    href={`/fwq/tags/${post.recommendedTagSlug ?? post.recommendedTagName}/page/1`}
                    prefetch
                    className="inline-flex min-h-8 items-center gap-2 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Tags className="size-4" />
                    {post.recommendedTagName}
                  </Link>
                ) : null}
                <ArticleShareActions title={post.title} url={articleUrl} />
              </div>
            </div>

            <div className="px-5 pb-8 pt-4 sm:px-6 md:px-8 md:pb-10 md:pt-5">
              <div className="relative aspect-[16/9] max-h-[360px] overflow-hidden rounded-lg border border-border/70 bg-muted/20 md:aspect-[21/9]">
                {post.imgUrl ? (
                  <Image
                    src={getOptimizedImageSrc(post.imgUrl)}
                    alt={post.title}
                    width={1440}
                    height={840}
                    sizes="(max-width: 768px) 100vw, 960px"
                    className="h-full w-full object-cover"
                    priority
                  />
                ) : (
                  <div className="h-full w-full bg-[linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))]" />
                )}
              </div>

              <div className="mt-6 space-y-10">
                <div
                  className="article-prose font-ui prose prose-zinc max-w-none prose-headings:font-editorial prose-p:text-[17px] prose-p:leading-8 prose-p:text-foreground/90 prose-a:text-accent prose-strong:text-foreground prose-img:rounded-lg prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:bg-accent/5 prose-blockquote:px-6 prose-blockquote:py-3 prose-blockquote:font-ui prose-blockquote:text-base prose-li:my-2 prose-li:text-foreground/90 prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-ui prose-code:text-sm"
                  dangerouslySetInnerHTML={{ __html: contentWithIds }}
                />

                <WebmasterStatement />

                {post.tags && post.tags.length > 0 ? (
                  <section className="border-t border-border/70 pt-6">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Tags className="size-4 text-accent" />
                      本文标签
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Link
                          key={tag.tag.id}
                          href={`/fwq/tags/${tag.tag.slug}/page/1`}
                          prefetch
                          className="inline-flex min-h-9 items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          #{tag.tag.name}
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                {prevPost || nextPost ? (
                  <nav
                    aria-label="上下篇文章"
                    className="grid gap-3 border-t border-border/70 pt-6 md:grid-cols-2"
                  >
                    {prevPost ? (
                      <Link
                        href={`/fwq/posts/${prevPost.slug}`}
                        prefetch
                        className="group flex min-h-24 items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-4 transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <ArrowLeftToLine className="mt-1 size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            上一篇
                          </p>
                          <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-accent">
                            {prevPost.title}
                          </p>
                        </div>
                      </Link>
                    ) : (
                      <div className="hidden md:block" />
                    )}
                    {nextPost ? (
                      <Link
                        href={`/fwq/posts/${nextPost.slug}`}
                        prefetch
                        className="group flex min-h-24 items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-4 text-left transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-right"
                      >
                        <div>
                          <p className="text-xs text-muted-foreground">
                            下一篇
                          </p>
                          <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-accent">
                            {nextPost.title}
                          </p>
                        </div>
                        <ArrowRightToLine className="mt-1 size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    ) : null}
                  </nav>
                ) : null}

                {(matchedTopics.length > 0 || relatedOffers.length > 0) ? (
                  <section className="space-y-4 border-t border-border/70 pt-6">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <SquareLibrary className="size-4 text-accent" />
                      相关专题与套餐
                    </div>
                    {matchedTopics.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {matchedTopics.map((topic) => (
                          <Link
                            key={topic.slug}
                            href={`/servers/${topic.slug}`}
                            prefetch
                            className="inline-flex min-h-9 items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {topic.title}
                          </Link>
                        ))}
                        <Link
                          href="/servers"
                          prefetch
                          className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          全部服务器比价
                        </Link>
                      </div>
                    ) : null}
                    {relatedOffers.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {relatedOffers.slice(0, 4).map((offer) => (
                          <div
                            key={offer.id}
                            className="rounded-lg border border-border/70 bg-muted/20 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-medium leading-6">
                                  {offer.title}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {offer.providerName ?? "商家待补充"} ·{" "}
                                  {offer.region ?? "地区待补充"} ·{" "}
                                  {offer.lineType ?? "线路待补充"}
                                </p>
                              </div>
                              <Badge>{formatOfferPrice(offer)}</Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {offer.purchaseUrl ? (
                                <a
                                  href={offer.purchaseUrl}
                                  target="_blank"
                                  rel="nofollow noopener noreferrer"
                                  className="text-xs font-medium text-primary hover:underline"
                                >
                                  购买链接
                                </a>
                              ) : null}
                              {offer.articleUrl && isInternalHref(offer.articleUrl) ? (
                                <Link
                                  href={offer.articleUrl}
                                  prefetch
                                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                  推广文章
                                </Link>
                              ) : offer.articleUrl ? (
                                <a
                                  href={offer.articleUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                  推广文章
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </div>
          </article>

          {recommendedPosts && recommendedPosts.length > 0 && (
            <section className="space-y-4 rounded-lg border border-border/70 bg-background px-5 py-6 shadow-sm sm:px-6 md:px-8">
              <div className="flex flex-wrap items-center gap-2">
                <SquareLibrary className="size-5 text-accent" />
                <h3 className="font-editorial text-2xl font-semibold">
                  {post.recommendedTagName
                    ? `推荐阅读 · ${post.recommendedTagName}`
                    : "推荐阅读"}
                </h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {recommendedPosts.map((post) => (
                  <RecommendedPostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-4">
            <LatestPostsSidebar posts={latestPosts ?? []} />
          </div>
        </aside>
      </div>
    </div>
  );
}

async function postInfo(slug: string) {
  return await getPostBySlug(slug);
}

export default function PostPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PostPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
