import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import {
  getHomepagePostsWithTags,
  getHomepageSidebarData,
} from "@/features/public/data/post";
import { listPublishedKnowledgeArticles } from "@/features/public/data/knowledge";
import { PublicHomePage } from "@/features/public/components/home-page";
import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import {
  HOMEPAGE_LATEST_OFFER_LIMIT,
  getLatestServerOffers,
  getPublicServerOfferCount,
  getServerOfferTopicCounts,
  getServerOfferCollectionIndex,
} from "@/server/offers/server-offers";
import { getSiteSeoConfig } from "@/features/shared/data/site-seo";
import { getActiveHomepageSlots } from "@/server/homepage/homepage-slots";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@/features/public/lib/site-structured-data";
import { jsonLdScriptContent } from "@fwqgo/core/utils";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { isDatabaseFreeBuild } from "@fwqgo/core/build-verification";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const { data } = await getSiteSeoConfig("en");

  return {
    title: data.title,
    description: data.description,
    keywords: data.keywords,
    alternates: {
      canonical: `${getSiteUrl()}/en`,
      languages: {
        "zh-CN": getSiteUrl(),
        en: `${getSiteUrl()}/en`,
        "x-default": getSiteUrl(),
      },
      types: {
        "application/rss+xml": "/feed.xml",
      },
    },
    openGraph: {
      title: data.title,
      description: data.description,
      url: `${getSiteUrl()}/en`,
      siteName: data.siteName,
    },
  };
}

async function EnglishHomeContent() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3_600 });
  tagCache(
    cacheTags.homepage,
    cacheTags.homepageSlots,
    cacheTags.posts,
    cacheTags.categories,
    cacheTags.tags,
    cacheTags.sidebar,
    cacheTags.serverOffers,
    cacheTags.knowledge,
  );
  // Local verification builds never require a production database.
  if (isDatabaseFreeBuild()) return null;
  const [
    { data: posts },
    { data: sidebarData },
    offerCounts,
    latestOffers,
    totalOfferCount,
    homepageSlots,
    collections,
    knowledge,
  ] = await Promise.all([
    getHomepagePostsWithTags("en"),
    getHomepageSidebarData("en"),
    getServerOfferTopicCounts(),
    // 首页只用 4 条优惠码 + 一个「最近更新」时间戳（`home-page.tsx`），
    // 按优惠码块约定的条数取，不必按 24 条拉全量字段。
    getLatestServerOffers(HOMEPAGE_LATEST_OFFER_LIMIT),
    getPublicServerOfferCount(),
    getActiveHomepageSlots("en"),
    getServerOfferCollectionIndex(5),
    listPublishedKnowledgeArticles({ language: "en", page: 1 }),
  ]);
  return (
    <PublicHomePage
      language="en"
      posts={posts ?? []}
      sidebarData={sidebarData}
      offerCounts={offerCounts}
      latestOffers={latestOffers}
      totalOfferCount={totalOfferCount}
      homepageSlots={homepageSlots}
      collections={collections}
      knowledge={knowledge.items}
    />
  );
}

export default async function EnglishHome() {
  // Start the cached SEO config alongside the cached body, then resolve the
  // body before rendering so the complete homepage stays in the first HTML.
  const seoPromise = getSiteSeoConfig("en");
  const content = await EnglishHomeContent();
  const { data: seo } = await seoPromise;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScriptContent([
            buildWebSiteJsonLd({
              language: "en",
              name: seo.siteName,
              description: seo.description,
            }),
            buildOrganizationJsonLd({ name: seo.siteName }),
          ]),
        }}
      />
      <Header language="en" />
      {content}
      <Footer language="en" />
    </div>
  );
}
