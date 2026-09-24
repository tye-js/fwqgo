import { PublicTaxonomyLink } from "@/features/public/components/public-taxonomy-link";
import {
  getAdjacentPublishedPosts,
  getLatestPostsForSidebar,
  getPostsWithTagsByCategoryId,
  getRecommendedPosts,
} from "@/features/public/data/post";

import { isRenderableImageSrc } from "@fwqgo/core/image-src";
import { resolveServerOfferAvailability } from "@fwqgo/core/server-offer-status";
import {
  formatDate,
  jsonLdScriptContent,
  normalizeDecodedSlug,
  toAbsoluteHttpUrl,
} from "@fwqgo/core/utils";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Languages,
  RefreshCw,
  SquareLibrary,
  Tags,
  Timer,
} from "lucide-react";
import {
  ARTICLE_PROSE_CLASS_NAME,
  ArticleCover,
  ArticleDetailHeader,
  ArticleMobileToc,
  ArticleRail,
  ArticleTocSidebar,
} from "@/features/public/components/article-detail";
import { PostViewCount } from "@/features/public/components/post-view-count";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import {
  ArticleRelatedKnowledge,
  ArticleRelatedSidebar,
} from "@/features/public/components/article-related-links";
import { ArticleCategoryPosts } from "@/features/public/components/article-category-posts";
import { ArticlePrevNext } from "@/features/public/components/article-prev-next";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import { WebmasterStatement } from "@/features/public/components/webmaster-statement";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import { notFound } from "next/navigation";
import {
  getRelatedServerOffersForPost,
  offerTopics,
} from "@/server/offers/server-offers";
import {
  isSupportedServerOfferCurrency,
  parseServerOfferAmount,
} from "@fwqgo/core/server-offer-price";
import { getChineseArticlePresentation } from "@/features/public/lib/article-presentation";
import { buildPublisherJsonLd } from "@/features/public/lib/site-structured-data";
import {
  getPublicArticleStaticParams,
  isPublicArticleStaticParamsPlaceholder,
} from "@/features/public/lib/article-static-params";
import type { PublicArticleInternalLink } from "@/server/posts/internal-links";

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

async function RelatedOffersSection({
  postId,
  tagNames,
}: {
  postId: number;
  tagNames: string[];
}) {
  const relatedOffers = await getRelatedServerOffersForPost({
    postId,
    tagNames,
  });
  const directOffers = relatedOffers.filter(
    (offer) => offer.sourcePostId === postId,
  );
  const inferredOffers = relatedOffers.filter(
    (offer) => offer.sourcePostId !== postId,
  );
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
        availability: resolveServerOfferAvailability(offer.status),
      },
    };
  });

  if (relatedOffers.length === 0) return null;

  return (
    <>
      {offerJsonLd.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScriptContent(offerJsonLd),
          }}
        />
      ) : null}
      <div className="space-y-8">
        {directOffers.length > 0 ? (
          <RelatedServerOfferCards
            title="本文套餐速览"
            description="正文中提取的套餐，购买前请再次核对库存和续费价格。"
            offers={directOffers}
            compact
          />
        ) : null}
        {inferredOffers.length > 0 ? (
          <RelatedServerOfferCards
            title="同主题服务器套餐"
            description="根据本文标签、地区和线路匹配的其他可购买套餐。"
            offers={inferredOffers}
          />
        ) : null}
      </div>
    </>
  );
}

function toFallbackRelatedPostLinks(
  posts: Array<{ id: number; title: string; slug: string }>,
) {
  return posts.map((post, index): PublicArticleInternalLink => ({
    id: -post.id,
    targetKey: `legacy-post:${post.id}`,
    targetType: "post",
    placement: "related_post",
    title: post.title,
    description: null,
    href: `/fwq/posts/${encodeURIComponent(post.slug)}`,
    anchorText: null,
    occurrenceIndex: 0,
    score: Math.max(1, 10 - index),
    reason: "推荐标签匹配",
  }));
}

async function FallbackRelatedPosts({
  postId,
  recommendedTagId,
}: {
  postId: number;
  recommendedTagId: number | null;
}) {
  if (!recommendedTagId) return null;
  const result = await getRecommendedPosts(recommendedTagId, postId);
  return (
    <ArticleRelatedSidebar
      links={toFallbackRelatedPostLinks(result.data ?? [])}
    />
  );
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const decodedSlug = normalizeDecodedSlug(params.slug);
  if (!decodedSlug) return {};
  if (isPublicArticleStaticParamsPlaceholder(decodedSlug)) notFound();

  const canonicalUrl = `${getSiteUrl()}/fwq/posts/${encodeURIComponent(decodedSlug)}`;
  const readableTitle = decodedSlug.replace(/[-_]+/g, " ");
  const presentation = await getChineseArticlePresentation(decodedSlug);
  if (!presentation) notFound();
  const post = presentation.post;
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
    robots: post
      ? { index: true, follow: true }
      : { index: false, follow: true },
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

export async function generateStaticParams() {
  return getPublicArticleStaticParams("zh");
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

  if (isPublicArticleStaticParamsPlaceholder(decodedSlug)) notFound();
  const presentation = await getChineseArticlePresentation(decodedSlug);
  if (!presentation) notFound();
  const {
    post,
    contentHtml,
    tocItems,
    internalLinks,
    relatedPostLinks,
    readingMinutes,
  } = presentation;
  const matchedTopics = offerTopics.filter((topic) => {
    const text = `${post.title} ${post.description ?? ""} ${post.tags
      .map((tag) => tag.tag.name)
      .join(" ")}`;
    return topic.keywords.some((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    );
  });
  const articleUrl = `${getSiteUrl()}/fwq/posts/${encodeURIComponent(decodedSlug)}`;
  const categoryUrl = `/fwq/${encodeURIComponent(post.categorySlug)}/page/1`;
  const absoluteImageUrl = toAbsoluteUrl(post.imgUrl);

  // 三个附加模块都是已缓存读，跟着正文一起进 ISR，不额外增加回源次数。
  const [latestPostsResult, adjacentPostsResult, categoryPostsResult] =
    await Promise.all([
      getLatestPostsForSidebar(),
      getAdjacentPublishedPosts(post.id),
      getPostsWithTagsByCategoryId(post.categoryId, 1),
    ]);
  const latestPosts = latestPostsResult.data ?? [];
  const [previousPost, nextPost] = adjacentPostsResult.data;
  const categoryPosts = (categoryPostsResult.data ?? []).filter(
    (item) => item.id !== post.id,
  );
  // 只有真正被改过（超过一分钟）才显示「更新于」，否则两行时间戳几乎一样，是噪音。
  const updatedAt =
    post.updatedAt !== null &&
    post.updatedAt.getTime() - post.createdAt.getTime() > 60_000
      ? post.updatedAt
      : null;
  const showRail = tocItems.length > 0 || latestPosts.length > 0;

  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    image: absoluteImageUrl,
    description: post.description,
    datePublished: post.createdAt,
    dateModified: post.updatedAt ?? post.createdAt,
    // No bylined individual authors exist yet, so authorship is attributed to
    // the publisher. A `Person` whose name is the brand would be a false claim.
    author: {
      "@type": "Organization",
      name: "服务器go",
      url: getSiteUrl(),
    },
    publisher: buildPublisherJsonLd(),
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
      ...(post.categoryPubliclyIndexable
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: post.categoryName,
              item: `${getSiteUrl()}${categoryUrl}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: post.categoryPubliclyIndexable ? 3 : 2,
        name: post.title,
        item: articleUrl,
      },
    ],
  };
  return (
    <div className="px-4 pb-10 pt-2 sm:px-6 md:pt-4">
      <div
        className={`grid items-start gap-6 ${
          showRail
            ? "xl:grid-cols-[minmax(0,820px)_288px] xl:justify-center xl:gap-8"
            : "xl:grid-cols-[minmax(0,820px)] xl:justify-center"
        }`}
      >
        <div className="mx-auto w-full min-w-0 max-w-[820px] space-y-10 xl:mx-0 xl:max-w-none">
          <article className="article-reading-surface">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: jsonLdScriptContent([
                  blogPostingJsonLd,
                  breadcrumbJsonLd,
                ]),
              }}
            />
            <ArticleDetailHeader
              eyebrow={
                <nav
                  aria-label="面包屑"
                  className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
                >
                  <Link
                    href="/"
                    className="inline-flex min-h-11 items-center hover:text-primary"
                  >
                    首页
                  </Link>
                  <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                  <PublicTaxonomyLink
                    indexable={post.categoryPubliclyIndexable}
                    href={categoryUrl}
                    className="inline-flex min-h-11 min-w-0 max-w-full items-center break-words hover:text-primary"
                  >
                    {post.categoryName}
                  </PublicTaxonomyLink>
                </nav>
              }
              title={post.title}
              description={
                post.description ??
                "这篇文章包含线路、机房、价格与使用场景的完整信息，适合继续深入阅读。"
              }
              meta={
                <>
                  <span className="inline-flex min-h-11 shrink-0 items-center gap-2 tabular-nums">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    发布于 {formatDate(post.createdAt)}
                  </span>
                  {updatedAt ? (
                    <span className="inline-flex min-h-11 shrink-0 items-center gap-2 tabular-nums">
                      <RefreshCw className="size-4" aria-hidden="true" />
                      更新于 {formatDate(updatedAt)}
                    </span>
                  ) : null}
                  {readingMinutes > 0 ? (
                    <span className="inline-flex min-h-11 shrink-0 items-center gap-2 tabular-nums">
                      <Timer className="size-4" aria-hidden="true" />
                      约 {readingMinutes} 分钟读完
                    </span>
                  ) : null}
                  <PostViewCount slug={decodedSlug} initialViews={post.views} />
                  {post.enSlug ? (
                    <Link
                      href={`/en/fwq/posts/${encodeURIComponent(post.enSlug)}`}
                      prefetch={false}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

            {/* 窄屏没有右栏，目录改成正文上方的折叠块。 */}
            <div className="mt-6">
              <ArticleMobileToc items={tocItems} label="本文目录" />
            </div>

            <div
              className={`${ARTICLE_PROSE_CLASS_NAME} mt-8`}
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />

            <div className="mt-10 space-y-8">
              <Suspense fallback={null}>
                <RelatedOffersSection
                  postId={post.id}
                  tagNames={post.tags.map((tag) => tag.tag.name)}
                />
              </Suspense>

              {relatedPostLinks.length > 0 ? (
                <ArticleRelatedSidebar links={relatedPostLinks} />
              ) : (
                <Suspense fallback={null}>
                  <FallbackRelatedPosts
                    postId={post.id}
                    recommendedTagId={post.recommendedTagId}
                  />
                </Suspense>
              )}

              <ArticleCategoryPosts
                posts={categoryPosts}
                categoryName={post.categoryName}
                categoryHref={categoryUrl}
              />

              <ArticleRelatedKnowledge links={internalLinks.relatedKnowledge} />

              {post.tags.length > 0 ? (
                <section className="border-t border-border/70 pt-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Tags className="size-4 text-primary" aria-hidden="true" />
                    本文标签
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {post.tags.map((tag) =>
                      tag.tag.publiclyIndexable ? (
                        <Link
                          key={tag.tag.id}
                          href={`/fwq/tags/${encodeURIComponent(tag.tag.slug)}/page/1`}
                          prefetch={false}
                          className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          #{tag.tag.name}
                        </Link>
                      ) : (
                        <span
                          key={tag.tag.id}
                          className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground"
                        >
                          #{tag.tag.name}
                        </span>
                      ),
                    )}
                  </div>
                </section>
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
                        prefetch={false}
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
                      prefetch={false}
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

              <ArticlePrevNext
                previous={previousPost}
                next={nextPost}
                language="zh"
              />

              <WebmasterStatement />
            </div>
          </article>
        </div>

        <ArticleRail>
          <ArticleTocSidebar items={tocItems} label="本文目录" />
          <LatestPostsSidebar posts={latestPosts} variant="compact" />
        </ArticleRail>
      </div>
    </div>
  );
}

export default async function PostPage(props: {
  params: Promise<{ slug: string }>;
}) {
  return <PostPageContent paramsPromise={props.params} />;
}
