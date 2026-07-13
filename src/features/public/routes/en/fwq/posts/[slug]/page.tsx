import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Clock, Tags } from "lucide-react";

import {
  getEnglishPostWithTagsBySlug,
  getLatestPostsForSidebar,
} from "@/features/public/data/post";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import {
  ARTICLE_PROSE_CLASS_NAME,
  ArticleCover,
  ArticleDetailHeader,
  ArticleTocSidebar,
} from "@/features/public/components/article-detail";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import { isRenderableImageSrc } from "@fwqgo/core/image-src";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { addIdsToHeadings } from "@fwqgo/core/toc";
import {
  formatDate,
  jsonLdScriptContent,
  normalizeDecodedSlug,
  toAbsoluteHttpUrl,
} from "@fwqgo/core/utils";
import { getRelatedServerOffersForPost } from "@/server/offers/server-offers";

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

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

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
  };
}

async function EnglishPostContent({ params }: PageProps) {
  await connection();

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
  const contentWithIds = addIdsToHeadings(
    renderArticleContentHtml(post.content),
  );
  const relatedPostId = post.translationSourcePostId ?? post.id;
  const [{ data: latestPosts }, relatedOffers] = await Promise.all([
    getLatestPostsForSidebar("en"),
    getRelatedServerOffersForPost({
      postId: relatedPostId,
      tagNames: post.tags.map((tag) => tag.tag.name),
      limit: 6,
    }),
  ]);
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
        name: "English articles",
        item: articleUrl,
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
        name: "Where does the server deal information come from?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The deal information is extracted from public provider pages and related articles. Always verify final price, stock and renewal terms on the provider checkout page.",
        },
      },
      {
        "@type": "Question",
        name: "Do affiliate links change the purchase price?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Affiliate links usually do not increase the price. Some campaigns may include coupons or discounted landing pages, but the final price depends on the provider checkout page.",
        },
      },
    ],
  };

  return (
    <main className="flex-1">
      <div className="container mx-auto grid items-start gap-6 px-4 py-4 sm:px-6 md:py-6 xl:grid-cols-[210px_minmax(0,800px)_280px] xl:justify-center">
        <ArticleTocSidebar content={contentWithIds} label="Contents" />

        <article className="mx-auto w-full min-w-0 max-w-[820px] xl:mx-0 xl:max-w-none">
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
          <ArticleDetailHeader
            title={post.title}
            description={
              post.description ??
              "Server deal details, network information, pricing, and buying notes."
            }
            eyebrow={
              post.chineseSlug ? (
                <Link
                  href={`/fwq/posts/${encodeURIComponent(post.chineseSlug)}`}
                  prefetch
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Read in Chinese
                </Link>
              ) : undefined
            }
            meta={
              <span className="inline-flex min-h-8 items-center gap-2 tabular-nums">
                <Clock className="size-4" aria-hidden="true" />
                {formatDate(post.createdAt, "en-US")}
              </span>
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

          {relatedOffers.length > 0 ? (
            <div className="mt-5">
              <RelatedServerOfferCards
                title="Related server offers"
                description="Compare price, region, and network first, then confirm stock and renewal terms on the provider page."
                offers={relatedOffers}
                language="en"
              />
            </div>
          ) : null}

          <div
            className={`${ARTICLE_PROSE_CLASS_NAME} mt-8`}
            dangerouslySetInnerHTML={{ __html: contentWithIds }}
          />

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
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-4">
            <LatestPostsSidebar posts={latestPosts ?? []} language="en" />
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function EnglishPostPage({ params }: PageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
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
