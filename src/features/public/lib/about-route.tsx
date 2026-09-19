import type { Metadata } from "next";
import { cacheLife } from "next/cache";

import { AboutPage, type AboutStats } from "@/features/public/components/about-page";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { getPublishedPostCount } from "@/features/public/data/post";
import { listPublishedKnowledgeArticles } from "@/features/public/data/knowledge";
import {
  trustPageAlternates,
  trustPagePath,
  type PublicLanguage,
} from "@/features/public/lib/site-contact";
import {
  buildOrganizationJsonLd,
  getSiteUrl,
} from "@/features/public/lib/site-structured-data";
import { getTrustDocument } from "@/features/public/lib/trust-pages";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { isDatabaseFreeBuild } from "@fwqgo/core/build-verification";
import { jsonLdScriptContent } from "@fwqgo/core/utils";
import {
  getPublicServerOfferCount,
  getServerOfferCollectionIndex,
} from "@/server/offers/server-offers";

/**
 * Reads one counter and drops it when the read fails. A metric that cannot be
 * verified is omitted from the page rather than guessed at; that is the whole
 * point of showing numbers on a trust page.
 */
async function readCount(read: () => Promise<number>): Promise<number | undefined> {
  try {
    const value = await read();
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function loadAboutStats(language: PublicLanguage): Promise<AboutStats> {
  "use cache";
  cacheLife({ stale: 900, revalidate: 3600, expire: 86_400 });
  // The counters mirror CMS-owned data, so they must join the existing cache
  // tag invalidation or the page would keep showing pre-publish numbers.
  tagCache(cacheTags.posts, cacheTags.serverOffers, cacheTags.knowledge);
  if (isDatabaseFreeBuild()) return {};

  const [offerCount, collections, knowledge, posts] = await Promise.all([
    readCount(() => getPublicServerOfferCount()),
    getServerOfferCollectionIndex(200).catch(() => null),
    listPublishedKnowledgeArticles({ language, page: 1 }).catch(() => null),
    getPublishedPostCount(language).catch(() => null),
  ]);

  return {
    offerCount,
    providerCount: collections?.providers.length,
    knowledgeCount:
      knowledge && knowledge.total > 0 ? knowledge.total : undefined,
    postCount: posts?.data,
  };
}

export function createAboutRoute(language: PublicLanguage) {
  async function generateMetadata(): Promise<Metadata> {
    const doc = getTrustDocument("about", language);
    const siteUrl = getSiteUrl();
    const canonicalUrl = `${siteUrl}${trustPagePath("about", language)}`;

    return {
      title: doc.seoTitle,
      description: doc.description,
      alternates: {
        canonical: canonicalUrl,
        languages: trustPageAlternates("about", siteUrl),
      },
      robots: { index: true, follow: true },
      openGraph: {
        type: "website",
        title: doc.seoTitle,
        description: doc.description,
        url: canonicalUrl,
        siteName: language === "en" ? "fwqgo" : "服务器go",
      },
    };
  }

  async function AboutRoute() {
    const stats = await loadAboutStats(language);

    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScriptContent(buildOrganizationJsonLd()),
          }}
        />
        <Header language={language} />
        <AboutPage language={language} stats={stats} />
        <Footer language={language} />
      </div>
    );
  }

  return { generateMetadata, Page: AboutRoute };
}
