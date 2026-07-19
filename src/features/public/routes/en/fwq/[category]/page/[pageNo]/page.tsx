import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Compass } from "lucide-react";

import { getCategoryBySlug } from "@/features/shared/data/category";
import {
  getLatestPostsForSidebar,
  getPostsWithTagsByCategoryId,
  getPublishedPostCountByCategoryId,
} from "@/features/public/data/post";
import ArticleCard from "@/features/public/components/article-card";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import PageCard from "@/features/public/components/page-card";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  decodeSlug,
  jsonLdScriptContent,
  parsePositiveInt,
} from "@fwqgo/core/utils";
import { getServerOffersByKeywords } from "@/server/offers/server-offers";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function splitKeywords(value: string | null | undefined) {
  return (
    value
      ?.split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export async function generateMetadata(props: {
  params: Promise<{ category: string; pageNo: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const decodedCategory = decodeSlug(params.category);
  const pageNo = parsePositiveInt(params.pageNo) ?? 1;
  const { data: category } = await getCategoryBySlug(decodedCategory, "en");
  const title = category?.name ?? decodedCategory.replace(/[-_]+/g, " ");
  const canonicalSlug = category?.slug ?? decodedCategory;
  const zhSlug =
    category && "zhSlug" in category && typeof category.zhSlug === "string"
      ? category.zhSlug
      : decodedCategory;
  const canonicalUrl = `${getSiteUrl()}/en/fwq/${encodeURIComponent(canonicalSlug)}/page/${pageNo}`;
  const zhUrl = `${getSiteUrl()}/fwq/${encodeURIComponent(zhSlug)}/page/${pageNo}`;

  const description =
    category?.description ??
    `${title} server deals, VPS reviews, coupons, and buying guides.`;

  return {
    title: `${title} - fwqgo`,
    description,
    keywords: category?.keywords ?? title,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "zh-CN": zhUrl,
        en: canonicalUrl,
        "x-default": zhUrl,
      },
    },
    openGraph: {
      title: `${title} - fwqgo`,
      description,
      url: canonicalUrl,
      siteName: "fwqgo",
    },
  };
}

async function CategoryPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ category: string; pageNo: string }>;
}) {
  await connection();

  const params = await paramsPromise;
  const decodedCategory = decodeSlug(params.category);
  const pageNo = parsePositiveInt(params.pageNo);
  if (!pageNo) notFound();

  const { data: category, error: categoryError } = await getCategoryBySlug(
    decodedCategory,
    "en",
  );
  if (categoryError) return <div>Failed to load category.</div>;
  if (!category) notFound();

  const [
    { data: posts, error: postsError },
    { data: totalCount },
    { data: latestPosts },
    relatedOffers,
  ] = await Promise.all([
    getPostsWithTagsByCategoryId(category.id, pageNo, "en"),
    getPublishedPostCountByCategoryId(category.id, "en"),
    getLatestPostsForSidebar("en"),
    getServerOffersByKeywords({
      keywords: [category.name, ...splitKeywords(category.keywords)],
      limit: 6,
    }),
  ]);
  const totalPage = Math.ceil((totalCount ?? 0) / 10);

  if ((totalCount ?? 0) > 0 && pageNo > totalPage) {
    notFound();
  }

  if (postsError) return <div>Failed to load articles.</div>;
  if (!posts) notFound();
  const pageDescription =
    category.description ??
    `${category.name} server deals, VPS reviews, and buying guides.`;
  const pageUrl = `${getSiteUrl()}/en/fwq/${encodeURIComponent(category.slug)}/page/${pageNo}`;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    description: pageDescription,
    url: pageUrl,
    inLanguage: "en",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListElement: posts.map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(post.slug)}`,
        name: post.title,
      })),
    },
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.82fr)_320px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScriptContent(collectionJsonLd),
        }}
      />
      <div className="space-y-5">
        <PageCard
          kind="Category"
          name={category.name}
          description={pageDescription}
          totalCount={totalCount ?? 0}
          pageNo={pageNo}
          language="en"
        />
        <RelatedServerOfferCards
          title={`${category.name} related offers`}
          description="Structured server offers matched to this category."
          offers={relatedOffers}
          language="en"
        />
        <div className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => (
              <ArticleCard key={post.id} post={post} language="en" />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No published English articles in this category yet.
            </div>
          )}
        </div>
        <PaginationComponent
          pageNo={pageNo}
          totalPage={totalPage}
          basePath={`/en/fwq/${encodeURIComponent(category.slug)}`}
        />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-4">
          <Card className="rounded-lg border-border/70 bg-background shadow-none">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Compass className="size-4 text-accent" />
                Browsing tip
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Use this page to scan one category first, then continue by page
                for deeper articles.
              </p>
              <Badge variant="secondary">
                Page {pageNo} / {Math.max(totalPage, 1)}
              </Badge>
            </CardContent>
          </Card>

          <LatestPostsSidebar posts={latestPosts ?? []} language="en" />
        </div>
      </aside>
    </div>
  );
}

export default function EnglishCategoryPage(props: {
  params: Promise<{ category: string; pageNo: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="en" />
      <Separator />
      <main className="container mx-auto flex-1 px-4 py-6 md:py-8">
        <Suspense
          fallback={
            <div className="rounded-lg border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              Loading category articles...
            </div>
          }
        >
          <CategoryPageContent paramsPromise={props.params} />
        </Suspense>
      </main>
      <Separator className="mt-4" />
      <Footer language="en" />
    </div>
  );
}
