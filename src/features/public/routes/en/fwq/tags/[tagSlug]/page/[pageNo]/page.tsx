import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getPostsWithTagsByTagSlug,
  getTagBySlug,
} from "@/features/public/data/tag";
import { getLatestPostsForSidebar } from "@/features/public/data/post";
import ArticleCard from "@/features/public/components/article-card";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import { TagContextSidebar } from "@/features/public/components/tag-context-sidebar";
import PageCard from "@/features/public/components/page-card";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { Separator } from "@/components/ui/separator";
import { decodeSlug, parsePositiveInt } from "@fwqgo/core/utils";
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
  params: Promise<{ tagSlug: string; pageNo: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const pageNo = parsePositiveInt(params.pageNo);
  if (!pageNo) {
    return { robots: { index: false, follow: true } };
  }
  const { data } = await getTagBySlug(decodedTagSlug, "en");
  const title = data?.name ?? decodedTagSlug.replace(/[-_]+/g, " ");
  const canonicalSlug = data?.slug ?? decodedTagSlug;
  const zhSlug =
    data && "zhSlug" in data && typeof data.zhSlug === "string"
      ? data.zhSlug
      : decodedTagSlug;
  const canonicalUrl = `${getSiteUrl()}/en/fwq/tags/${encodeURIComponent(canonicalSlug)}/page/${pageNo}`;
  const zhUrl = `${getSiteUrl()}/fwq/tags/${encodeURIComponent(zhSlug)}/page/${pageNo}`;

  const description =
    data?.description ?? `${title} server deals, VPS reviews, and coupons.`;

  return {
    title: `${title} - fwqgo`,
    description,
    keywords: data?.keywords ?? `${title} VPS,${title} server deals`,
    robots: {
      index: Boolean(data?.indexable),
      follow: true,
    },
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

async function TagPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  const params = await paramsPromise;
  const decodedTagSlug = decodeSlug(params.tagSlug);
  const pageNo = parsePositiveInt(params.pageNo);
  if (!pageNo) notFound();

  const [{ data: postsWithTag, error }, { data: latestPosts }] =
    await Promise.all([
      getPostsWithTagsByTagSlug(decodedTagSlug, pageNo, "en"),
      getLatestPostsForSidebar("en"),
    ]);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
      >
        Tag content is temporarily unavailable. Please refresh this page later.
      </div>
    );
  }
  if (!postsWithTag?.posts) {
    notFound();
  }

  const posts = postsWithTag.posts;
  const totalPage = Math.ceil((postsWithTag.totalCount ?? 0) / 10);
  const relatedOffers = await getServerOffersByKeywords({
    keywords: [postsWithTag.name, ...splitKeywords(postsWithTag.keywords)],
    limit: 6,
  });

  if ((postsWithTag.totalCount ?? 0) > 0 && postsWithTag.pageNo > totalPage) {
    notFound();
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <PageCard
          kind="Tag"
          name={postsWithTag.name}
          description={
            postsWithTag.description ??
            `${postsWithTag.name} server deals, VPS reviews, and buying guides.`
          }
          totalCount={postsWithTag.totalCount ?? 0}
          pageNo={postsWithTag.pageNo}
          language="en"
          variant="compact"
        />
        <RelatedServerOfferCards
          title={`${postsWithTag.name} related offers`}
          description="Structured server offers matched to this tag."
          offers={relatedOffers}
          language="en"
        />
        <div className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => (
              <ArticleCard
                key={post.post.id}
                post={post.post}
                language="en"
                excludedTagSlug={postsWithTag.slug}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No published English articles for this tag yet.
            </div>
          )}
        </div>
        <PaginationComponent
          pageNo={postsWithTag.pageNo}
          totalPage={totalPage}
          basePath={`/en/fwq/tags/${encodeURIComponent(postsWithTag.slug)}`}
        />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-4">
          <TagContextSidebar
            offers={relatedOffers}
            pageNo={postsWithTag.pageNo}
            totalPage={totalPage}
            language="en"
          />
          <LatestPostsSidebar
            posts={latestPosts ?? []}
            language="en"
            variant="compact"
          />
        </div>
      </aside>
    </div>
  );
}

export default function EnglishTagPage(props: {
  params: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="en" />
      <Separator />
      <main className="container mx-auto flex-1 px-4 py-6 md:py-8">
        <Suspense
          fallback={
            <div className="rounded-lg border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
              Loading tag articles...
            </div>
          }
        >
          <TagPageContent paramsPromise={props.params} />
        </Suspense>
      </main>
      <Separator className="mt-4" />
      <Footer language="en" />
    </div>
  );
}
