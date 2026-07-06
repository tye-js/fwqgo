import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  ArrowLeft,
  BookOpenText,
  Clock,
  ShoppingCart,
  SquareLibrary,
  Tags,
} from "lucide-react";

import {
  getEnglishPostWithTagsBySlug,
  getLatestPostsForSidebar,
} from "@/features/public/data/post";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import {
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { addIdsToHeadings } from "@fwqgo/core/toc";
import {
  formatDate,
  isHttpHref,
  isInternalHref,
  jsonLdScriptContent,
  normalizeDecodedSlug,
  toAbsoluteHttpUrl,
} from "@fwqgo/core/utils";
import { TableOfContents } from "@/components/toc/table-of-contents";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getRelatedServerOffersForPost } from "@/server/offers/server-offers";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

function formatOfferPrice(
  offer: Awaited<ReturnType<typeof getRelatedServerOffersForPost>>[number],
) {
  if (!offer.priceAmount) return "Price pending";
  const amount = Number(offer.priceAmount);
  if (!Number.isFinite(amount)) return "Price to confirm";
  return `${offer.currency === "CNY" ? "¥" : "$"}${amount.toFixed(2)}`;
}

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
  const image = post?.imgUrl
    ? new URL(post.imgUrl, getSiteUrl()).toString()
    : undefined;

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
    image: post.imgUrl
      ? new URL(post.imgUrl, getSiteUrl()).toString()
      : undefined,
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
      <div className="container mx-auto grid items-start gap-6 px-4 py-6 xl:grid-cols-[250px_minmax(0,1fr)_300px] 2xl:grid-cols-[270px_minmax(0,900px)_320px]">
        <aside className="sticky top-20 hidden max-h-[calc(100dvh-96px)] self-start xl:block">
          <Card className="rounded-lg border-border/70 bg-background shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BookOpenText className="size-4 text-accent" />
                Contents
              </div>
              <div className="mt-3">
                <TableOfContents
                  content={contentWithIds}
                  label="Article contents"
                />
              </div>
            </CardContent>
          </Card>
        </aside>

        <article className="min-w-0">
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
          {post.chineseSlug ? (
            <Link
              href={`/fwq/posts/${post.chineseSlug}`}
              prefetch
              className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              <ArrowLeft className="size-4" />
              Chinese version
            </Link>
          ) : null}

          <header className="mt-6 border-b border-border/70 pb-6">
            <h1 className="font-editorial text-3xl font-semibold leading-tight text-foreground md:text-5xl">
              {post.title}
            </h1>
            {post.description ? (
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                {post.description}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Clock className="size-4" />
                {formatDate(post.createdAt, "en-US")}
              </span>
              <ArticleShareActions
                title={post.title}
                url={articleUrl}
                language="en"
              />
            </div>
          </header>

          {isRenderableImageSrc(post.imgUrl) ? (
            <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-lg border border-border/70 bg-muted/20 md:aspect-[21/9]">
              <Image
                src={getOptimizedImageSrc(post.imgUrl)}
                alt={post.title}
                width={1440}
                height={840}
                sizes="(max-width: 768px) 100vw, 960px"
                className="h-full w-full object-cover"
                priority
              />
            </div>
          ) : null}

          <div className="mt-6 xl:hidden">
            <Card className="rounded-lg border-border/70 bg-background shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <BookOpenText className="size-4 text-accent" />
                  Contents
                </div>
                <div className="mt-3">
                  <TableOfContents
                    content={contentWithIds}
                    label="Article contents"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {relatedOffers.length > 0 ? (
            <section className="mt-6 rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ShoppingCart className="size-4 text-accent" />
                  Related server offers
                </div>
                <Badge variant="secondary">{relatedOffers.length} offers</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {relatedOffers.slice(0, 4).map((offer) => (
                  <div
                    key={offer.id}
                    className="rounded-lg border border-border/70 bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium leading-6">
                          {offer.title}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {offer.providerName ?? "Provider pending"} ·{" "}
                          {offer.region ?? "Region pending"} ·{" "}
                          {offer.lineType ?? "Line pending"}
                        </p>
                      </div>
                      <Badge>{formatOfferPrice(offer)}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isHttpHref(offer.purchaseUrl) ? (
                        <a
                          href={offer.purchaseUrl}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Buy
                        </a>
                      ) : isInternalHref(offer.purchaseUrl) ? (
                        <Link
                          href={offer.purchaseUrl}
                          prefetch={false}
                          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                        >
                          Buy
                        </Link>
                      ) : null}
                      {offer.articleUrl && isInternalHref(offer.articleUrl) ? (
                        <Link
                          href={offer.articleUrl}
                          prefetch
                          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Source
                        </Link>
                      ) : isHttpHref(offer.articleUrl) ? (
                        <a
                          href={offer.articleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Source
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div
            className="article-prose font-ui prose-headings:font-editorial prose prose-zinc mt-8 max-w-none prose-p:text-[17px] prose-p:leading-8 prose-p:text-foreground/90 prose-a:text-accent prose-a:underline prose-a:decoration-accent/55 prose-a:underline-offset-4 prose-a:transition-colors hover:prose-a:text-primary hover:prose-a:decoration-primary prose-strong:text-foreground"
            dangerouslySetInnerHTML={{
              __html: contentWithIds,
            }}
          />

          {post.tags.length > 0 ? (
            <section className="mt-10 border-t border-border/70 pt-6">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Tags className="size-4 text-accent" />
                Tags
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Link
                    key={tag.tag.id}
                    href={`/en/fwq/tags/${tag.tag.slug}/page/1`}
                    prefetch
                    className="inline-flex min-h-10 items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    #{tag.tag.name}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-4">
            <LatestPostsSidebar posts={latestPosts ?? []} language="en" />
            {relatedOffers.length > 0 ? (
              <Card className="rounded-lg border-border/70 bg-background shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <SquareLibrary className="size-4 text-accent" />
                    Server offer links
                  </div>
                  <div className="mt-4 space-y-3">
                    {relatedOffers.slice(0, 4).map((offer) => {
                      const href = isHttpHref(offer.purchaseUrl)
                        ? offer.purchaseUrl
                        : isInternalHref(offer.purchaseUrl)
                          ? offer.purchaseUrl
                          : isHttpHref(offer.articleUrl)
                            ? offer.articleUrl
                            : isInternalHref(offer.articleUrl)
                              ? offer.articleUrl
                              : "/servers";
                      const className =
                        "block rounded-md border border-border/70 p-3 text-sm transition-colors hover:border-accent/30 hover:bg-accent/5";
                      const content = (
                        <>
                          <p className="line-clamp-2 font-medium">
                            {offer.title}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatOfferPrice(offer)}
                          </p>
                        </>
                      );

                      return isHttpHref(href) ? (
                        <a
                          key={offer.id}
                          href={href}
                          target="_blank"
                          rel="nofollow sponsored noopener noreferrer"
                          className={className}
                        >
                          {content}
                        </a>
                      ) : (
                        <Link
                          key={offer.id}
                          href={href}
                          prefetch={href !== "/servers" ? false : undefined}
                          className={className}
                        >
                          {content}
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : null}
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
