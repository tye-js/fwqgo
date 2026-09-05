import { PublicTaxonomyLink } from "@/features/public/components/public-taxonomy-link";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Clock, Languages, Tags } from "lucide-react";

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
import { isRenderableImageSrc } from "@fwqgo/core/image-src";
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
import { getEnglishArticlePresentation } from "@/features/public/lib/article-presentation";
import {
  getPublicArticleStaticParams,
  isPublicArticleStaticParamsPlaceholder,
} from "@/features/public/lib/article-static-params";

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
    limit: 6,
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
        availability:
          offer.status === "in_stock"
            ? "https://schema.org/InStock"
            : offer.status === "preorder"
              ? "https://schema.org/PreOrder"
              : "https://schema.org/OutOfStock",
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
            title="Offers from this article"
            description="Extracted from this article. Confirm stock and renewal terms before purchase."
            offers={directOffers}
            language="en"
            compact
          />
        ) : null}
        {inferredOffers.length > 0 ? (
          <RelatedServerOfferCards
            title="Related server offers"
            description="Other purchasable offers matched by provider, region, and network."
            offers={inferredOffers}
            language="en"
          />
        ) : null}
      </div>
    </>
  );
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
  if (isPublicArticleStaticParamsPlaceholder(decodedSlug)) notFound();

  const presentation = await getEnglishArticlePresentation(decodedSlug);
  if (!presentation) notFound();
  const post = presentation.post;
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
    robots: post
      ? { index: true, follow: true }
      : { index: false, follow: true },
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

export async function generateStaticParams() {
  return getPublicArticleStaticParams("en");
}

async function EnglishPostContent({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = normalizeDecodedSlug(slug);
  if (!decodedSlug) {
    notFound();
  }

  if (isPublicArticleStaticParamsPlaceholder(decodedSlug)) notFound();
  const presentation = await getEnglishArticlePresentation(decodedSlug);
  if (!presentation) notFound();
  const { post, contentHtml, tocItems, internalLinks, relatedPostLinks } =
    presentation;
  const canonicalSlug = post.enSlug ?? decodedSlug;
  const articleUrl = `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(canonicalSlug)}`;
  const absoluteImageUrl = toAbsoluteImageUrl(post.imgUrl);
  const relatedPostId = post.translationSourcePostId ?? post.id;
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
      ...(post.categoryPubliclyIndexable
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: categoryName,
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
    <main className="flex-1">
      <div className="container mx-auto grid items-start gap-6 px-4 py-4 sm:px-6 md:py-6 xl:grid-cols-[minmax(0,800px)_280px] xl:justify-center 2xl:grid-cols-[180px_minmax(0,760px)_260px] 2xl:gap-5">
        <ArticleTocSidebar items={tocItems} label="Contents" />

        <article className="mx-auto w-full min-w-0 max-w-[820px] xl:mx-0 xl:max-w-none">
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
                aria-label="Breadcrumb"
                className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
              >
                <Link
                  href="/en"
                  className="inline-flex min-h-11 items-center hover:text-primary"
                >
                  Home
                </Link>
                <ChevronRight className="size-3.5 shrink-0" aria-hidden />
                <PublicTaxonomyLink
                  indexable={post.categoryPubliclyIndexable}
                  href={categoryUrl}
                  className="inline-flex min-h-11 min-w-0 max-w-full items-center break-words hover:text-primary"
                >
                  {categoryName}
                </PublicTaxonomyLink>
              </nav>
            }
            title={post.title}
            description={
              post.description ??
              "Server deal details, network information, pricing, and buying notes."
            }
            meta={
              <>
                <span className="inline-flex min-h-11 shrink-0 items-center gap-2 tabular-nums">
                  <Clock className="size-4" aria-hidden="true" />
                  {formatDate(post.createdAt, "en-US")}
                </span>
                {post.chineseSlug ? (
                  <Link
                    href={`/fwq/posts/${encodeURIComponent(post.chineseSlug)}`}
                    prefetch={false}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

          <div
            className={`${ARTICLE_PROSE_CLASS_NAME} mt-8`}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          <div className="mt-10">
            <Suspense fallback={null}>
              <RelatedOffersSection
                postId={relatedPostId}
                tagNames={post.tags.map((tag) => tag.tag.name)}
              />
            </Suspense>
          </div>

          {post.tags.length > 0 ? (
            <section className="mt-10 border-t border-border/70 pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Tags className="size-4 text-primary" aria-hidden="true" />
                Tags
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {post.tags.map((tag) =>
                  tag.tag.publiclyIndexable ? (
                    <Link
                      key={tag.tag.id}
                      href={`/en/fwq/tags/${encodeURIComponent(tag.tag.slug)}/page/1`}
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

          <div className="mt-10">
            <ArticleRelatedKnowledge
              links={internalLinks.relatedKnowledge}
              language="en"
            />
          </div>
        </article>

        <ArticleRelatedSidebar links={relatedPostLinks} language="en" />
      </div>
    </main>
  );
}

export default function EnglishPostPage({ params }: PageProps) {
  return <EnglishPostContent params={params} />;
}
