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

/**
 * ## 为什么每个节点都自带 `@context`
 *
 * 调用方把 `WebSite` 与 `Organization` 放进**一个顶层数组**（见 `routes/page.tsx`）。
 * JSON-LD 里 `@context` 是**局部**属性：数组里某个节点带了不会作用于兄弟节点。
 * 两个节点都不带时，整块标注里的 `WebSite` / `Organization` 只是普通字符串，
 * 不构成 schema.org 标注 —— 搜索引擎会整块忽略，而页面上看不出任何异常。
 *
 * 实测（2026-09-28 资源审计）：`/`、`/about`、`/en`、`/en/about` 的站点级标注
 * 6 个节点全部缺 `@context`，而仓库里其它 20+ 处 JSON-LD 都带。
 */
const SCHEMA_CONTEXT = "https://schema.org";

export function buildOrganizationJsonLd(input?: {
  name?: string;
  description?: string;
}) {
  const siteUrl = getSiteUrl();
  const name = input?.name ?? "服务器go";

  return {
    "@context": SCHEMA_CONTEXT,
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
    "@context": SCHEMA_CONTEXT,
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
