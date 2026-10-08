import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import {
  getHomepageFallbackPromotions,
  getHomepagePostsWithTags,
  getHomepageSidebarData,
} from "@/features/public/data/post";
import { getHomepageTopics } from "@/features/public/data/homepage-topics";
import { PublicHomePage } from "@/features/public/components/home-page";
import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
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
  // Partial Prefetching 只将 stale >= 5 分钟的缓存纳入页面外壳。
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(
    cacheTags.homepage,
    cacheTags.homepageSlots,
    cacheTags.posts,
    cacheTags.categories,
    cacheTags.tags,
    cacheTags.sidebar,
    cacheTags.serverOffers,
  );
  // Local verification builds never require a production database.
  if (isDatabaseFreeBuild()) return null;
  const [{ data: posts }, { data: sidebarData }, homepageSlots, topics] =
    await Promise.all([
      getHomepagePostsWithTags("en"),
      getHomepageSidebarData("en"),
      getActiveHomepageSlots("en"),
      getHomepageTopics("en"),
    ]);
  // 「推广」区只在没有任何 sidebar 运营位时才退回到这批文章；存在运营位时
  // 它的结果必然被丢弃，所以不要为它发起查询。
  const hasSidebarSlot = homepageSlots.some(
    (slot) => slot.placement === "sidebar",
  );
  const promotedPosts = hasSidebarSlot
    ? []
    : await getHomepageFallbackPromotions("en");
  return (
    <PublicHomePage
      language="en"
      posts={posts}
      sidebarData={sidebarData}
      promotedPosts={promotedPosts}
      homepageSlots={homepageSlots}
      topics={topics}
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
