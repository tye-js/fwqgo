import {
  getPostBySlug,
  getPostWithTagsBySlug,
  getLatestPostsForSidebar,
  getPostsByPostId,
} from "@/features/public/data/post";

import {
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";
import {
  formatDate,
  isHttpHref,
  isInternalHref,
  jsonLdScriptContent,
  normalizeDecodedSlug,
  toAbsoluteHttpUrl,
} from "@fwqgo/core/utils";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
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
import { addIdsToHeadings } from "@fwqgo/core/toc";

function formatOfferPrice(
  offer: Awaited<ReturnType<typeof getRelatedServerOffersForPost>>[number],
) {
  if (!offer.priceAmount) return "价格待补充";
  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) return "价格待确认";
  return `${offer.currency === "CNY" ? "¥" : "$"}${amount.toFixed(2)}`;
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function toAbsoluteUrl(value: string | null | undefined) {
  if (!isRenderableImageSrc(value)) return undefined;
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
  await connection();

  const params = await props.params;
  const decodedSlug = normalizeDecodedSlug(params.slug);
  if (!decodedSlug) return {};

  const canonicalUrl = `${getSiteUrl()}/fwq/posts/${encodeURIComponent(decodedSlug)}`;
  const readableTitle = decodedSlug.replace(/[-_]+/g, " ");
  const { data } = await getPostBySlug(decodedSlug);
  const title = data?.title ?? readableTitle;
  const description =
    data?.description ??
    `${readableTitle}相关的服务器优惠、VPS 活动、线路和购买建议。`;
  const image = toAbsoluteUrl(data?.imgUrl);
  const englishUrl = data?.enSlug
    ? `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(data.enSlug)}`
    : undefined;

  return {
    title: `${title} - 服务器go`,
    description,
    keywords: data?.keywords ?? readableTitle,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "zh-CN": canonicalUrl,
        ...(englishUrl ? { en: englishUrl } : {}),
        "x-default": canonicalUrl,
      },
    },
    openGraph: {
      type: "article",
      title: `${title} - 服务器go`,
      description,
      url: canonicalUrl,
      siteName: "服务器go",
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${title} - 服务器go`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

async function PostPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>;
}) {
  await connection();

  const params = await paramsPromise;
  const decodedSlug = normalizeDecodedSlug(params.slug);
  if (!decodedSlug) {
    notFound();
  }

  const { data, error } = await getPostWithTagsBySlug(decodedSlug);
  if (error) return <div>加载失败: {error}</div>;
  if (!data) notFound();
  const { post, recommendedPosts } = data;

  if (!post) notFound();
  const contentWithIds = addIdsToHeadings(post.content);

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
  const articleUrl = `${getSiteUrl()}/fwq/posts/${encodeURIComponent(decodedSlug)}`;
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
        item: `${getSiteUrl()}/fwq/posts/${encodeURIComponent(decodedSlug)}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: articleUrl,
      },
    ],
  };
  const offerJsonLd = relatedOffers.slice(0, 6).map((offer) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: offer.title,
    brand: offer.providerName
      ? {
          "@type": "Brand",
          name: offer.providerName,
        }
      : undefined,
    category: "VPS and Server Hosting",
    description: [offer.region, offer.lineType, offer.promoCode]
      .filter(Boolean)
      .join(" / "),
    offers: {
      "@type": "Offer",
      url: toAbsoluteHttpUrl(offer.purchaseUrl, getSiteUrl()) ?? articleUrl,
      price: offer.priceAmount ? String(offer.priceAmount) : undefined,
      priceCurrency: offer.currency ?? undefined,
      availability:
        offer.status === "in_stock"
          ? "https://schema.org/InStock"
          : offer.status === "preorder"
            ? "https://schema.org/PreOrder"
            : "https://schema.org/OutOfStock",
    },
  }));
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "这篇文章里的服务器套餐信息来自哪里？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "套餐信息来自文章正文和商家页面中的价格、配置、地区、线路、优惠码等公开信息，购买前建议再次核对商家页面。",
        },
      },
      {
        "@type": "Question",
        name: "推广链接会影响价格吗？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "推广链接通常不会提高购买价格，部分活动还会包含优惠码或折扣入口，最终价格以商家结算页面为准。",
        },
      },
    ],
  };
  return (
    <div className="py-4 md:py-6">
      <div className="grid items-start gap-6 xl:grid-cols-[250px_minmax(0,1fr)_300px] 2xl:grid-cols-[270px_minmax(0,900px)_320px]">
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
                __html: jsonLdScriptContent([
                  blogPostingJsonLd,
                  breadcrumbJsonLd,
                  faqJsonLd,
                  ...offerJsonLd,
                ]),
              }}
            />
            <div className="border-b border-border/70 bg-muted/20 px-5 py-5 sm:px-6 md:px-8">
              <h1 className="font-editorial max-w-4xl text-2xl font-semibold leading-tight text-foreground md:text-4xl">
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
                    href={`/fwq/tags/${encodeURIComponent(post.recommendedTagSlug ?? post.recommendedTagName)}/page/1`}
                    prefetch
                    className="inline-flex min-h-11 items-center gap-2 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                {isRenderableImageSrc(post.imgUrl) ? (
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

              {relatedOffers.length > 0 ? (
                <section className="mt-5 rounded-lg border border-border/70 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <SquareLibrary className="size-4 text-accent" />
                      本文相关套餐
                    </div>
                    <Link
                      href="/servers"
                      prefetch
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      查看全部比价
                    </Link>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {relatedOffers.slice(0, 2).map((offer) => (
                      <div
                        key={offer.id}
                        className="rounded-lg border border-border/70 bg-background p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-medium leading-6">
                              {offer.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {offer.providerName ?? "商家待补充"} ·{" "}
                              {offer.region ?? "地区待补充"}
                            </p>
                          </div>
                          <Badge>{formatOfferPrice(offer)}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {isHttpHref(offer.purchaseUrl) ? (
                            <a
                              href={offer.purchaseUrl}
                              target="_blank"
                              rel="nofollow sponsored noopener noreferrer"
                              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            >
                              购买链接
                            </a>
                          ) : isInternalHref(offer.purchaseUrl) ? (
                            <Link
                              href={offer.purchaseUrl}
                              prefetch={false}
                              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            >
                              购买链接
                            </Link>
                          ) : null}
                          {offer.articleUrl &&
                          isInternalHref(offer.articleUrl) ? (
                            <Link
                              href={offer.articleUrl}
                              prefetch
                              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                            >
                              来源文章
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="mt-6 space-y-8">
                <div
                  className="article-prose font-ui prose-headings:font-editorial prose-blockquote:font-ui prose-code:font-ui prose prose-zinc max-w-none prose-p:text-base prose-p:leading-8 prose-p:text-foreground/90 prose-a:text-accent prose-a:underline prose-a:decoration-accent/55 prose-a:underline-offset-4 prose-a:transition-colors hover:prose-a:text-primary hover:prose-a:decoration-primary prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:bg-accent/5 prose-blockquote:px-5 prose-blockquote:py-3 prose-blockquote:text-base prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-li:my-2 prose-li:text-foreground/90 prose-img:rounded-lg"
                  dangerouslySetInnerHTML={{ __html: contentWithIds }}
                />

                <WebmasterStatement />

                {post.tags && post.tags.length > 0 ? (
                  <section className="border-t border-border/70 pt-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Tags className="size-4 text-accent" />
                      本文标签
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Link
                          key={tag.tag.id}
                          href={`/fwq/tags/${encodeURIComponent(tag.tag.slug)}/page/1`}
                          prefetch
                          className="inline-flex min-h-10 items-center rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    className="grid gap-3 border-t border-border/70 pt-5 md:grid-cols-2"
                  >
                    {prevPost ? (
                      <Link
                        href={`/fwq/posts/${encodeURIComponent(prevPost.slug)}`}
                        prefetch
                        className="group flex min-h-20 items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3.5 transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                        href={`/fwq/posts/${encodeURIComponent(nextPost.slug)}`}
                        prefetch
                        className="group flex min-h-20 items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3.5 text-left transition-colors hover:border-accent/30 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-right"
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

                {matchedTopics.length > 0 || relatedOffers.length > 0 ? (
                  <section className="space-y-4 border-t border-border/70 pt-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <SquareLibrary className="size-4 text-accent" />
                      相关专题与套餐
                    </div>
                    {matchedTopics.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {matchedTopics.map((topic) => (
                          <Link
                            key={topic.slug}
                            href={`/servers/${encodeURIComponent(topic.slug)}`}
                            prefetch
                            className="inline-flex min-h-10 items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {topic.title}
                          </Link>
                        ))}
                        <Link
                          href="/servers"
                          prefetch
                          className="inline-flex min-h-10 items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                              {isHttpHref(offer.purchaseUrl) ? (
                                <a
                                  href={offer.purchaseUrl}
                                  target="_blank"
                                  rel="nofollow sponsored noopener noreferrer"
                                  className="text-xs font-medium text-primary hover:underline"
                                >
                                  购买链接
                                </a>
                              ) : isInternalHref(offer.purchaseUrl) ? (
                                <Link
                                  href={offer.purchaseUrl}
                                  prefetch={false}
                                  className="text-xs font-medium text-primary hover:underline"
                                >
                                  购买链接
                                </Link>
                              ) : null}
                              {offer.articleUrl &&
                              isInternalHref(offer.articleUrl) ? (
                                <Link
                                  href={offer.articleUrl}
                                  prefetch
                                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                  来源文章
                                </Link>
                              ) : isHttpHref(offer.articleUrl) ? (
                                <a
                                  href={offer.articleUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                                >
                                  来源文章
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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

export default function PostPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
          正在加载文章...
        </div>
      }
    >
      <PostPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
