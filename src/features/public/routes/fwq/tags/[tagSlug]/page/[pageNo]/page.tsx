import {
  resolveTagPage,
  taxonomyPageMetadata,
} from "@/features/public/lib/taxonomy-page";
import { getPostsWithTagsByTagSlug } from "@/features/public/data/tag";
import { getLatestPostsForSidebar } from "@/features/public/data/post";
import ArticleCard from "@/features/public/components/article-card";
import { LatestPostsSidebar } from "@/features/public/components/latest-posts-sidebar";
import { TagContextSidebar } from "@/features/public/components/tag-context-sidebar";
import PageCard from "@/features/public/components/page-card";
import { RelatedServerOfferCards } from "@/features/public/components/related-server-offer-cards";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { decodeSlug, jsonLdScriptContent } from "@fwqgo/core/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerOffersByKeywords } from "@/server/offers/server-offers";
import { Suspense } from "react";

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
  const state = await resolveTagPage(params.tagSlug, params.pageNo, "zh");
  return taxonomyPageMetadata({ ...state, kind: "tag", language: "zh" });
}

async function TagPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  const params = await paramsPromise;
  const { pageNo } = await resolveTagPage(params.tagSlug, params.pageNo, "zh");
  const decodedTagSlug = decodeSlug(params.tagSlug);

  const { data: postsWithTag, error } = await getPostsWithTagsByTagSlug(
    decodedTagSlug,
    pageNo,
  );
  if (error) throw new Error(error);
  if (!postsWithTag?.posts) {
    notFound();
  }

  const cardInfo = {
    kind: "标签页",
    name: postsWithTag.name,
    description:
      postsWithTag.description ??
      `${postsWithTag.name}的服务器,${postsWithTag.name}的VPS`,
    totalCount: postsWithTag.totalCount ?? 0,
    pageNo: postsWithTag.pageNo,
  };
  const posts = postsWithTag.posts;
  const totalPage = Math.ceil((postsWithTag.totalCount ?? 0) / 10);

  if (postsWithTag.pageNo > totalPage) {
    notFound();
  }
  const [{ data: latestPosts }, relatedOffers] = await Promise.all([
    getLatestPostsForSidebar(),
    getServerOffersByKeywords({
      keywords: [
        postsWithTag.name ?? decodedTagSlug,
        ...splitKeywords(postsWithTag.keywords),
      ],
      limit: 6,
    }),
  ]);
  const pageSlug = postsWithTag.slug ?? decodedTagSlug;
  const pageUrl = `${getSiteUrl()}/fwq/tags/${encodeURIComponent(pageSlug)}/page/${postsWithTag.pageNo}`;
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cardInfo.name,
    description: cardInfo.description,
    url: pageUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: posts.length,
      itemListElement: posts.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${getSiteUrl()}/fwq/posts/${encodeURIComponent(item.post.slug)}`,
        name: item.post.title,
      })),
    },
  };

  return (
    <div className="grid gap-8 px-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScriptContent(collectionJsonLd),
        }}
      />
      <div className="space-y-5">
        <PageCard {...cardInfo} variant="compact" />
        <RelatedServerOfferCards
          title={`${postsWithTag.name}相关套餐`}
          offers={relatedOffers}
        />
        <div className="space-y-4">
          {posts.length > 0 ? (
            posts.map((post) => (
              <ArticleCard
                key={post.post.id}
                post={post.post}
                excludedTagSlug={pageSlug}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              当前标签下还没有已发布文章。
            </div>
          )}
        </div>
        <PaginationComponent
          pageNo={postsWithTag.pageNo}
          totalPage={totalPage}
          basePath={`/fwq/tags/${encodeURIComponent(pageSlug)}`}
        />
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-4">
          <TagContextSidebar
            offers={relatedOffers}
            pageNo={postsWithTag.pageNo}
            totalPage={totalPage}
          />
          <LatestPostsSidebar posts={latestPosts ?? []} variant="compact" />
        </div>
      </aside>
    </div>
  );
}

export default function TagPage(props: {
  params: Promise<{ tagSlug: string; pageNo: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
          正在加载标签文章...
        </div>
      }
    >
      <TagPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
