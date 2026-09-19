import type { Metadata } from "next";
import { cacheLife } from "next/cache";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { TrustDocumentPage } from "@/features/public/components/trust-document-page";
import {
  getSiteUrl,
} from "@/features/public/lib/site-structured-data";
import {
  trustPageAlternates,
  trustPagePath,
  type PublicLanguage,
} from "@/features/public/lib/site-contact";
import {
  getTrustDocument,
  type TrustDocument,
} from "@/features/public/lib/trust-pages";

type TrustDocumentSlug = "contact" | "privacy" | "terms" | "affiliate-disclosure";

/**
 * One route implementation serves every long-form trust document. The document
 * itself is static content, so the route carries no request-scoped work and is
 * safe to cache with the rest of the public pages.
 */
export function createTrustDocumentRoute(
  slug: TrustDocumentSlug,
  language: PublicLanguage,
) {
  async function loadDocument(): Promise<TrustDocument> {
    "use cache";
    cacheLife({ stale: 3600, revalidate: 86_400, expire: 604_800 });
    return getTrustDocument(slug, language);
  }

  async function generateMetadata(): Promise<Metadata> {
    const doc = await loadDocument();
    const siteUrl = getSiteUrl();
    const canonicalUrl = `${siteUrl}${trustPagePath(slug, language)}`;

    return {
      title: doc.seoTitle,
      description: doc.description,
      alternates: {
        canonical: canonicalUrl,
        languages: trustPageAlternates(slug, siteUrl),
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

  async function TrustDocumentRoute() {
    const doc = await loadDocument();
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <Header language={language} />
        <TrustDocumentPage doc={doc} language={language} />
        <Footer language={language} />
      </div>
    );
  }

  return { generateMetadata, Page: TrustDocumentRoute };
}
