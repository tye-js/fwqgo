import type { PublicLanguage } from "@/features/public/lib/site-contact";

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

/**
 * A raster logo is required for `Organization.logo`. Google ignores SVG here,
 * and the brand mark is served from the public directory so the crawler never
 * has to follow a redirect.
 */
export const SITE_LOGO_PATH = "/apple-icon.png";

/**
 * Verified public profiles for the publisher entity. Left empty on purpose:
 * inventing a `sameAs` target is worse than omitting the property, because a
 * wrong identity claim undermines the whole graph. Add real profile URLs here
 * (GitHub, X, a stable Telegram channel, a company registry entry) when they
 * exist and the property starts rendering automatically.
 */
export const SITE_SOCIAL_PROFILES: string[] = [];

export function getSiteLogoUrl() {
  return `${getSiteUrl()}${SITE_LOGO_PATH}`;
}

export function buildOrganizationJsonLd(input?: {
  name?: string;
  description?: string;
}) {
  const siteUrl = getSiteUrl();
  const name = input?.name ?? "服务器go";

  return {
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name,
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: getSiteLogoUrl(),
    },
    ...(input?.description ? { description: input.description } : {}),
    ...(SITE_SOCIAL_PROFILES.length > 0
      ? { sameAs: [...SITE_SOCIAL_PROFILES] }
      : {}),
  };
}

/**
 * `WebSite` anchors the site entity and declares the language-scoped name.
 * The `SearchAction` is kept because non-Google engines still consume it;
 * Google retired its sitelinks search box in 2023, so treat it as a bonus
 * rather than an expected rich result.
 */
export function buildWebSiteJsonLd(input: {
  language: PublicLanguage;
  name: string;
  description?: string;
}) {
  const siteUrl = getSiteUrl();
  const homeUrl = input.language === "en" ? `${siteUrl}/en` : siteUrl;
  const searchUrl =
    input.language === "en"
      ? `${siteUrl}/search?lang=en&q={search_term_string}`
      : `${siteUrl}/search?q={search_term_string}`;

  return {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: input.name,
    url: homeUrl,
    inLanguage: input.language === "en" ? "en" : "zh-CN",
    ...(input.description ? { description: input.description } : {}),
    publisher: { "@id": `${siteUrl}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: searchUrl,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * The site has no bylined individual authors yet. Organisational authorship is
 * an honest, schema-valid substitute; a `Person` whose name is the brand would
 * be a false claim and is exactly what quality raters penalise.
 */
export function buildPublisherJsonLd(input?: {
  name?: string;
  description?: string;
}) {
  return buildOrganizationJsonLd(input);
}
