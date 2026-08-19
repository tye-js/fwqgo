import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, Languages, Tags } from "lucide-react";

import { getEnglishPostWithTagsBySlug } from "@/features/public/data/post";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import {
  ARTICLE_PROSE_CLASS_NAME,
  ArticleCover,
  ArticleDetailHeader,
  ArticleTocSidebar,
} from "@/features/public/components/article-detail";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import {
  ArticleRelatedKnowledge,
  ArticleRelatedSidebar,
} from "@/features/public/components/article-related-links";
import { getPublicPostInternalLinks } from "@/features/public/data/article-internal-links";
import { isRenderableImageSrc } from "@fwqgo/core/image-src";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { applyInternalLinksToArticleHtml } from "@fwqgo/core/article-internal-links";
import { addIdsToHeadings } from "@fwqgo/core/toc";
import {
  formatDate,
  jsonLdScriptContent,
  normalizeDecodedSlug,
  toAbsoluteHttpUrl,
} from "@fwqgo/core/utils";
import { getRelatedServerOffersForPost } from "@/server/offers/server-offers";
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

function toAbsoluteImageUrl(value: string | null | undefined) {
  if (!isRenderableImageSrc(value)) return undefined;

  try {
    return new URL(value, getSiteUrl()).toString();
  } catch {
    return undefined;
  }
}

function nonEmptyValue(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized;
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = normalizeDecodedSlug(slug);
  if (!decodedSlug) return {};

  const { data } = await getEnglishPostWithTagsBySlug(decodedSlug);
  const post = data?.post;
  const canonicalSlug = post?.enSlug ?? decodedSlug;
  const canonicalUrl = `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(canonicalSlug)}`;
  const chineseUrl = post?.chineseSlug
    ? `${getSiteUrl()}/fwq/posts/${encodeURIComponent(post.chineseSlug)}`
    : undefined;
  const readableTitle = decodedSlug.replace(/[-_]+/g, " ");
  const title = post?.title ?? readableTitle;
  const description =
    post?.description ?? `${readableTitle} server and VPS deal article.`;
  const image = toAbsoluteImageUrl(post?.imgUrl);

  return {
    title: `${title} - fwqgo`,
    description,
    keywords: post?.keywords ?? readableTitle,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ...(chineseUrl ? { "zh-CN": chineseUrl } : {}),
        en: canonicalUrl,
        "x-default": chineseUrl ?? canonicalUrl,
      },
    },
    openGraph: {
      type: "article",
      title: `${title} - fwqgo`,
      description,
      url: canonicalUrl,
      siteName: "fwqgo",
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} - fwqgo`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

async function EnglishPostContent({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = normalizeDecodedSlug(slug);
  if (!decodedSlug) {
    notFound();
  }

  const { data, error } = await getEnglishPostWithTagsBySlug(decodedSlug);

  if (error || !data?.post) {
    notFound();
  }

  const post = data.post;
  if (!post.title || !post.content) {
    notFound();
  }
  const canonicalSlug = post.enSlug ?? decodedSlug;
  const articleUrl = `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(canonicalSlug)}`;
  const absoluteImageUrl = toAbsoluteImageUrl(post.imgUrl);
  const relatedPostId = post.translationSourcePostId ?? post.id;
  const [relatedOffers, internalLinks] = await Promise.all([
    getRelatedServerOffersForPost({
      postId: relatedPostId,
      tagNames: post.tags.map((tag) => tag.tag.name),
      limit: 6,
    }),
    getPublicPostInternalLinks(post.id, "en"),
  ]);
  const renderedContent = renderArticleContentHtml(post.content);
  const linkedContent = applyInternalLinksToArticleHtml(
    renderedContent,
    internalLinks.inline.map((link) => ({
      targetKey: link.targetKey,
      anchorText: link.anchorText ?? "",
      href: link.href,
      occurrenceIndex: link.occurrenceIndex,
    })),
  );
  const contentWithIds = addIdsToHeadings(linkedContent.html);
  const directOffers = relatedOffers.filter(
    (offer) => offer.sourcePostId === relatedPostId,
  );
  const inferredOffers = relatedOffers.filter(
    (offer) => offer.sourcePostId !== relatedPostId,
  );
  const categorySlug = nonEmptyValue(post.categoryEnSlug) ?? post.categorySlug;
  const categoryName = nonEmptyValue(post.categoryEnName) ?? post.categoryName;
  const categoryUrl = `/en/fwq/${encodeURIComponent(categorySlug)}/page/1`;
  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    image: absoluteImageUrl,
    description: post.description,
    inLanguage: "en",
    datePublished: post.createdAt,
    dateModified: post.updatedAt ?? post.createdAt,
    author: {
      "@type": "Organization",
      name: "fwqgo",
    },
    publisher: {
      "@type": "Organization",
      name: "fwqgo",
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
        name: "Home",
        item: `${getSiteUrl()}/en`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: categoryName,
        item: `${getSiteUrl()}${categoryUrl}`,
      },
      {
        "@type": "ListItem",
        position: 3,
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
    <main className="flex-1">
      <div className="container mx-auto grid items-start gap-6 px-4 py-4 sm:px-6 md:py-6 xl:grid-cols-[minmax(0,800px)_280px] xl:justify-center 2xl:grid-cols-[180px_minmax(0,760px)_260px] 2xl:gap-5">
        <ArticleTocSidebar content={contentWithIds} label="Contents" />

        <article className="mx-auto w-full min-w-0 max-w-[820px] xl:mx-0 xl:max-w-none">
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
            eyebrow={
              <nav
                aria-label="Breadcrumb"
                className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Link href="/en" className="hover:text-primary">
                  Home
                </Link>
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                <Link
                  href={categoryUrl}
                  className="truncate hover:text-primary"
                >
                  {categoryName}
                </Link>
              </nav>
            }
            title={post.title}
            description={
              post.description ??
              "Server deal details, network information, pricing, and buying notes."
            }
            meta={
              <>
                <span className="inline-flex min-h-8 shrink-0 items-center gap-2 tabular-nums">
                  <Clock className="size-4" aria-hidden="true" />
                  {formatDate(post.createdAt, "en-US")}
                </span>
                {post.chineseSlug ? (
                  <Link
                    href={`/fwq/posts/${encodeURIComponent(post.chineseSlug)}`}
                    prefetch
                    className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Languages className="size-4" aria-hidden="true" />
                    中文
                  </Link>
                ) : null}
              </>
            }
            actions={
              <ArticleShareActions
                title={post.title}
                url={articleUrl}
                language="en"
              />
            }
          />

          <div className="mt-5">
            <ArticleCover src={post.imgUrl} alt={post.title} />
          </div>

          {directOffers.length > 0 ? (
            <div className="mt-5">
              <RelatedServerOfferCards
                title="Offers from this article"
                description="Extracted from this article. Confirm stock and renewal terms before purchase."
                offers={directOffers}
                language="en"
                compact
              />
            </div>
          ) : null}

          <div
            className={`${ARTICLE_PROSE_CLASS_NAME} mt-8`}
            dangerouslySetInnerHTML={{ __html: contentWithIds }}
          />

          {inferredOffers.length > 0 ? (
            <div className="mt-10">
              <RelatedServerOfferCards
                title="Related server offers"
                description="Other purchasable offers matched by provider, region, and network."
                offers={inferredOffers}
                language="en"
              />
            </div>
          ) : null}

          {post.tags.length > 0 ? (
            <section className="mt-10 border-t border-border/70 pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Tags className="size-4 text-primary" aria-hidden="true" />
                Tags
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {post.tags.map((tag) => (
                  <Link
                    key={tag.tag.id}
                    href={`/en/fwq/tags/${encodeURIComponent(tag.tag.slug)}/page/1`}
                    prefetch
                    className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8"
                  >
                    #{tag.tag.name}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-10">
            <ArticleRelatedKnowledge
              links={internalLinks.relatedKnowledge}
              language="en"
            />
          </div>
        </article>

        <ArticleRelatedSidebar
          links={internalLinks.relatedPosts}
          language="en"
        />
      </div>
    </main>
  );
}

export default function EnglishPostPage({ params }: PageProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header language="en" />
      <Suspense
        fallback={
          <main className="flex-1 px-4 py-10 text-sm text-muted-foreground">
            Loading article...
          </main>
        }
      >
        <EnglishPostContent params={params} />
      </Suspense>
      <Footer language="en" />
    </div>
  );
}
