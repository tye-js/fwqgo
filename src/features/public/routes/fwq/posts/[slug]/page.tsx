import {
  getPostWithTagsBySlug,
  getLatestPostsForSidebar,
  getPostsByPostId,
} from "@/features/public/data/post";

import { isRenderableImageSrc } from "@fwqgo/core/image-src";
import {
  formatDate,
  jsonLdScriptContent,
  normalizeDecodedSlug,
  toAbsoluteHttpUrl,
} from "@fwqgo/core/utils";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  Clock,
  Languages,
  SquareLibrary,
  Tags,
} from "lucide-react";
import { Suspense } from "react";
import {
  ARTICLE_PROSE_CLASS_NAME,
  ArticleCover,
  ArticleDetailHeader,
  ArticleTocSidebar,
} from "@/features/public/components/article-detail";
import { PostViewCount } from "@/features/public/components/post-view-count";
import { RecommendedPostCard } from "@/features/public/components/recommended-post-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import { WebmasterStatement } from "@/features/public/components/webmaster-statement";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import { notFound } from "next/navigation";
import {
  getRelatedServerOffersForPost,
  offerTopics,
} from "@/server/offers/server-offers";
import { addIdsToHeadings } from "@fwqgo/core/toc";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import {
  isSupportedServerOfferCurrency,
  parseServerOfferAmount,
} from "@fwqgo/core/server-offer-price";

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
  const params = await props.params;
  const decodedSlug = normalizeDecodedSlug(params.slug);
  if (!decodedSlug) return {};

  const canonicalUrl = `${getSiteUrl()}/fwq/posts/${encodeURIComponent(decodedSlug)}`;
  const readableTitle = decodedSlug.replace(/[-_]+/g, " ");
  const { data } = await getPostWithTagsBySlug(decodedSlug);
  const post = data?.post;
  const title = post?.title ?? readableTitle;
  const description =
    post?.description ??
    `${readableTitle}相关的服务器优惠、VPS 活动、线路和购买建议。`;
  const image = toAbsoluteUrl(post?.imgUrl);
  const englishUrl = post?.enSlug
    ? `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(post.enSlug)}`
    : undefined;

  return {
    title: `${title} - 服务器go`,
    description,
    keywords: post?.keywords ?? readableTitle,
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
      card: "summary_large_image",
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
  const params = await paramsPromise;
  const decodedSlug = normalizeDecodedSlug(params.slug);
  if (!decodedSlug) {
    notFound();
  }

  const { data, error } = await getPostWithTagsBySlug(decodedSlug);
  if (error) {
    return (
      <div
        role="alert"
        className="mx-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive sm:mx-6"
      >
        文章暂时加载失败，请稍后刷新页面。
      </div>
    );
  }
  if (!data) notFound();
  const { post, recommendedPosts } = data;

  if (!post) notFound();
  const contentWithIds = addIdsToHeadings(
    renderArticleContentHtml(post.content),
  );

  const [{ data: posts }, { data: latestPosts }, relatedOffers] =
    await Promise.all([
      getPostsByPostId(post.id),
      getLatestPostsForSidebar(),
      getRelatedServerOffersForPost({
        postId: post.id,
        tagNames: post.tags.map((tag) => tag.tag.name),
      }),
    ]);
  const [prevPost, nextPost] = posts ?? [null, null];
  const directOffers = relatedOffers.filter(
    (offer) => offer.sourcePostId === post.id,
  );
  const inferredOffers = relatedOffers.filter(
    (offer) => offer.sourcePostId !== post.id,
  );
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
        name: post.title,
        item: articleUrl,
      },
    ],
  };
  const offerJsonLd = relatedOffers.slice(0, 6).flatMap((offer) => {
    const purchaseUrl = toAbsoluteHttpUrl(offer.purchaseUrl, getSiteUrl());
    const price = parseServerOfferAmount(offer.priceAmount);
    const currency = offer.currency?.trim().toUpperCase();
    if (
      !purchaseUrl ||
      price === null ||
      price <= 0 ||
      !isSupportedServerOfferCurrency(currency)
    ) {
      return [];
    }

    return {
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
        url: purchaseUrl,
        price: String(price),
        priceCurrency: currency,
        availability:
          offer.status === "in_stock"
            ? "https://schema.org/InStock"
            : offer.status === "preorder"
              ? "https://schema.org/PreOrder"
              : "https://schema.org/OutOfStock",
      },
    };
  });
  return (
    <div className="px-4 pb-10 pt-2 sm:px-6 md:pt-4">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,800px)_280px] xl:justify-center 2xl:grid-cols-[180px_minmax(0,760px)_260px] 2xl:gap-5">
        <ArticleTocSidebar content={contentWithIds} label="本文目录" />

        <div className="mx-auto w-full min-w-0 max-w-[820px] space-y-10 xl:mx-0 xl:max-w-none">
          <article className="min-w-0">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: jsonLdScriptContent([
                  blogPostingJsonLd,
                  breadcrumbJsonLd,
                  ...offerJsonLd,
                ]),
              }}
            />
            <ArticleDetailHeader
              title={post.title}
              description={
                post.description ??
                "这篇文章包含线路、机房、价格与使用场景的完整信息，适合继续深入阅读。"
              }
              meta={
                <>
                  <span className="inline-flex min-h-8 shrink-0 items-center gap-2 tabular-nums">
                    <Clock className="size-4" aria-hidden="true" />
                    {formatDate(post.createdAt)}
                  </span>
                  <PostViewCount slug={decodedSlug} initialViews={post.views} />
                  {post.enSlug ? (
                    <Link
                      href={`/en/fwq/posts/${encodeURIComponent(post.enSlug)}`}
                      prefetch
                      className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Languages className="size-4" aria-hidden="true" />
                      English
                    </Link>
                  ) : null}
                </>
              }
              actions={
                <ArticleShareActions title={post.title} url={articleUrl} />
              }
            />

            <div className="mt-5">
              <ArticleCover src={post.imgUrl} alt={post.title} />
            </div>

            {directOffers.length > 0 ? (
              <div className="mt-5">
                <RelatedServerOfferCards
                  title="本文套餐速览"
                  description="正文中提取的套餐，购买前请再次核对库存和续费价格。"
                  offers={directOffers}
                  compact
                />
              </div>
            ) : null}

            <div
              className={`${ARTICLE_PROSE_CLASS_NAME} mt-8`}
              dangerouslySetInnerHTML={{ __html: contentWithIds }}
            />

            <div className="mt-10 space-y-8">
              {inferredOffers.length > 0 ? (
                <RelatedServerOfferCards
                  title="同主题服务器套餐"
                  description="根据本文标签、地区和线路匹配的其他可购买套餐。"
                  offers={inferredOffers}
                />
              ) : null}

              <WebmasterStatement />

              {post.tags.length > 0 ? (
                <section className="border-t border-border/70 pt-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Tags className="size-4 text-primary" aria-hidden="true" />
                    本文标签
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {post.tags.map((tag) => (
                      <Link
                        key={tag.tag.id}
                        href={`/fwq/tags/${encodeURIComponent(tag.tag.slug)}/page/1`}
                        prefetch
                        className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8"
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
                      className="group flex min-h-24 items-start gap-3 rounded-md border border-border/70 px-4 py-3.5 transition-colors hover:border-primary/35 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <ArrowLeftToLine
                        className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">上一篇</p>
                        <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-6 text-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline">
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
                      className="group flex min-h-24 items-start justify-between gap-3 rounded-md border border-border/70 px-4 py-3.5 text-left transition-colors hover:border-primary/35 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-right"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">下一篇</p>
                        <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-6 text-foreground underline-offset-4 transition-colors group-hover:text-primary group-hover:underline">
                          {nextPost.title}
                        </p>
                      </div>
                      <ArrowRightToLine
                        className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </Link>
                  ) : null}
                </nav>
              ) : null}

              {matchedTopics.length > 0 ? (
                <section className="border-t border-border/70 pt-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <SquareLibrary
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                    继续浏览服务器专题
                  </div>
                  <div className="mt-2 grid sm:grid-cols-2 sm:gap-x-5">
                    {matchedTopics.map((topic) => (
                      <Link
                        key={topic.slug}
                        href={`/servers/${encodeURIComponent(topic.slug)}`}
                        prefetch
                        className="group flex min-h-11 items-center justify-between gap-3 border-b border-border/60 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {topic.title}
                        <ArrowRight
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                          aria-hidden="true"
                        />
                      </Link>
                    ))}
                    <Link
                      href="/servers"
                      prefetch
                      className="group flex min-h-11 items-center justify-between gap-3 border-b border-border/60 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      全部服务器比价
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </section>
              ) : null}
            </div>
          </article>

          {recommendedPosts && recommendedPosts.length > 0 && (
            <section className="space-y-4 border-t border-border/70 pt-7">
              <div className="flex flex-wrap items-center gap-2">
                <SquareLibrary
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
                <h2 className="font-editorial text-xl font-semibold md:text-2xl">
                  {post.recommendedTagName
                    ? `推荐阅读 · ${post.recommendedTagName}`
                    : "推荐阅读"}
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {recommendedPosts.map((post) => (
                  <RecommendedPostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-4">
            <LatestPostsSidebar posts={latestPosts ?? []} variant="compact" />
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
