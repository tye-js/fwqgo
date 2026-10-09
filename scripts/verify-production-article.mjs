import * as cheerio from "cheerio";

const siteUrl = (process.env.SITE_URL ?? "https://fwqgo.com").replace(
  /\/+$/,
  "",
);
const configuredReleaseId = process.env.ARTICLE_ISR_RELEASE_ID?.trim();
const releaseId = configuredReleaseId?.length
  ? configuredReleaseId
  : String(Date.now());

/**
 * @param {unknown} condition
 * @param {string} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {string | URL} url @param {RequestInit} [init] */
async function fetchWithTimeout(url, init = {}) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
}

/** @param {string} xml */
function sitemapArticleUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => (match[1] ?? "").replaceAll("&amp;", "&"))
    .filter((value) => value.length > 0)
    .filter((value) => {
      try {
        const url = new URL(value);
        return (
          url.origin === new URL(siteUrl).origin &&
          url.pathname.startsWith("/fwq/posts/")
        );
      } catch {
        return false;
      }
    });
}

/** @param {string} html @param {string} label */
function assertUniqueResumeSegmentIds(html, label) {
  const ids = [...html.matchAll(/<(?:div|template)[^>]*\bid="(S:\d+)"/g)].map(
    (match) => match[1],
  );
  assert(
    ids.length === new Set(ids).size,
    `${label} contains duplicate streamed resume segment IDs`,
  );
}

const LOC_ELEMENT_PATTERN = /<loc>([^<]+)<\/loc>/;
const HREFLANG_ATTRIBUTE_PATTERN = /hreflang="([^"]+)"/;
const HREF_ATTRIBUTE_PATTERN = /href="([^"]+)"/;

/**
 * Pick a Chinese article the sitemap itself advertises as bilingual.
 *
 * The sitemap only annotates `<xhtml:link rel="alternate">` when a published English
 * translation exists (`articleAlternates` in `packages/core/public-content-policy.ts`
 * emits a pair only when both sides qualify). The majority of Chinese articles are
 * Chinese-only — 135 of 204 at the time of writing — so the sitemap is the reliable
 * way to find a subject that must carry hreflang, instead of asserting it on a page
 * that legitimately has none.
 *
 * @param {string} xml
 */
function pairedArticleFromSitemap(xml) {
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const body = block[1] ?? "";
    const loc = LOC_ELEMENT_PATTERN.exec(body)?.[1];
    if (!loc) continue;
    /** @type {Map<string, string>} */
    const byLanguage = new Map();
    for (const tag of body.matchAll(/<xhtml:link[^>]*>/g)) {
      const language = HREFLANG_ATTRIBUTE_PATTERN.exec(tag[0])?.[1];
      const href = HREF_ATTRIBUTE_PATTERN.exec(tag[0])?.[1];
      if (language && href) {
        byLanguage.set(language.toLowerCase(), href.replaceAll("&amp;", "&"));
      }
    }
    const englishUrl = byLanguage.get("en");
    if (englishUrl) {
      return { chineseUrl: loc.replaceAll("&amp;", "&"), englishUrl };
    }
  }
  return null;
}

/** @param {import("cheerio").CheerioAPI} page */
function headAlternates(page) {
  /** @type {Map<string, string>} */
  const byLanguage = new Map();
  for (const node of page('head link[rel="alternate"]').toArray()) {
    const language = (page(node).attr("hreflang") ?? "").toLowerCase();
    const href = page(node).attr("href") ?? "";
    if (language && href) byLanguage.set(language, href);
  }
  return byLanguage;
}

async function findPublishedArticle() {
  const sitemapResponse = await fetchWithTimeout(
    `${siteUrl}/sitemap-posts.xml`,
    {
      headers: { "User-Agent": "fwqgo-deploy-article-isr-check/1.0" },
    },
  );
  assert(
    sitemapResponse.ok,
    `Article sitemap returned HTTP ${sitemapResponse.status}`,
  );
  const sitemapXml = await sitemapResponse.text();
  const candidates = sitemapArticleUrls(sitemapXml).slice(0, 5);
  assert(candidates.length > 0, "Article sitemap contains no Chinese post URL");

  const failures = [];
  for (const candidate of candidates) {
    const probeUrl = new URL(candidate);
    probeUrl.searchParams.set("__fwqgo_release_probe", releaseId);
    const startedAt = performance.now();
    const response = await fetchWithTimeout(probeUrl, {
      headers: { "User-Agent": "fwqgo-deploy-article-isr-check/1.0" },
    });
    const responseAt = performance.now();
    if (response.status !== 200) {
      failures.push(`${probeUrl.pathname}: HTTP ${response.status}`);
      await response.body?.cancel();
      continue;
    }

    const html = await response.text();
    const completedAt = performance.now();
    const $ = cheerio.load(html);
    const prose = $("article .article-prose").first();
    if (prose.length === 1 && prose.parents("[hidden]").length === 0) {
      return {
        canonicalUrl: candidate,
        probeUrl,
        response,
        html,
        $,
        sitemapXml,
        ttfbMs: Math.round(responseAt - startedAt),
        totalMs: Math.round(completedAt - startedAt),
      };
    }

    failures.push(`${probeUrl.pathname}: article prose is not visible`);
  }

  throw new Error(
    `No recent sitemap article produced visible raw HTML (${failures.join("; ")})`,
  );
}

const { canonicalUrl, probeUrl, response, html, $, sitemapXml, ttfbMs, totalMs } =
  await findPublishedArticle();
const article = $("article").first();
const prose = article.find(".article-prose").first();
const proseText = prose.text().replace(/\s+/g, " ").trim();
const cacheControl = response.headers.get("cache-control") ?? "";

// The release probe has a query parameter and must bypass shared HTML caches.
// Cache Components still caches the article core. Status-aware CDN policy is
// applied by the outer proxy only to anonymous, query-free, canonical 200 HTML.
assert(
  !cacheControl.includes("s-maxage=900"),
  "Release probe must bypass the public HTML cache",
);
const canonicalResponse = await fetchWithTimeout(canonicalUrl);
assert(
  canonicalResponse.status === 200,
  "Canonical article did not return 200",
);
const canonicalCacheControl =
  canonicalResponse.headers.get("cache-control") ?? "";
if (process.env.ARTICLE_ISR_REQUIRE_EDGE_CACHE === "1") {
  assert(
    canonicalCacheControl.includes("s-maxage=900"),
    `Status-aware edge policy is missing: ${canonicalCacheControl || "none"}`,
  );
}
await canonicalResponse.body?.cancel();
assert(
  $("head title").text().trim().length > 0,
  "Article title is missing from head",
);
assert(
  ($('head meta[name="description"]').attr("content") ?? "").trim().length > 0,
  "Article description is missing from head",
);
assert(
  $('head link[rel="canonical"]').attr("href") === canonicalUrl,
  "Article canonical is missing or does not match the sitemap URL",
);
// hreflang is emitted only for bilingual articles, so its presence is not universal.
// This subject may legitimately carry none; assert self-consistency here and prove the
// paired path end to end below.
const articleAlternates = headAlternates($);
if (articleAlternates.size > 0) {
  assert(
    articleAlternates.get("zh-cn") === canonicalUrl,
    "A bilingual article must self-reference its canonical URL in hreflang",
  );
  assert(
    articleAlternates.get("x-default") === canonicalUrl,
    "x-default must point at the Chinese page",
  );
  assert(
    (articleAlternates.get("en") ?? "").includes("/en/fwq/posts/"),
    "A bilingual article must advertise its English translation",
  );
}
const robots = $('head meta[name="robots"]').attr("content") ?? "";
assert(
  /\bindex\b/i.test(robots) && /\bfollow\b/i.test(robots),
  `Article robots policy is not index, follow: ${robots || "missing"}`,
);
assert(
  article.length === 1,
  "Article element is missing from the raw document",
);
assert(prose.length === 1, "Article prose is missing from the raw document");
assert(proseText.length >= 200, "Article prose is unexpectedly short");
assert(
  prose.parents("[hidden]").length === 0,
  "Article prose is still inside a hidden PPR resume segment",
);
assertUniqueResumeSegmentIds(html, "Article document");

const rscUrl = new URL(probeUrl);
rscUrl.searchParams.set("_rsc", `deploy-${releaseId}`);
const rscResponse = await fetchWithTimeout(rscUrl, {
  redirect: "manual",
  headers: {
    RSC: "1",
    "Next-Router-Prefetch": "1",
    "User-Agent": "fwqgo-deploy-article-isr-check/1.0",
  },
});
const rscCacheControl = rscResponse.headers.get("cache-control") ?? "";
assert(
  !rscCacheControl.includes("s-maxage=900"),
  "RSC prefetch inherited the public HTML cache policy",
);
await rscResponse.body?.cancel();

// Prove the bilingual path end to end: the sitemap only annotates a pair when both
// sides qualify, so a pair found there must be reciprocal in both heads. This is the
// check that actually pins the hreflang convention — a page with no translation is
// correctly silent, and a pair must agree in both directions.
const pair = pairedArticleFromSitemap(sitemapXml);
assert(
  pair,
  "Article sitemap advertises no bilingual pair; cannot verify hreflang reciprocity",
);
const chineseResponse = await fetchWithTimeout(pair.chineseUrl, {
  headers: { "User-Agent": "fwqgo-deploy-article-isr-check/1.0" },
});
assert(
  chineseResponse.status === 200,
  `Paired Chinese article returned HTTP ${chineseResponse.status}`,
);
const chinesePage = cheerio.load(await chineseResponse.text());
const chineseAlternates = headAlternates(chinesePage);
assert(
  chinesePage('head link[rel="canonical"]').attr("href") === pair.chineseUrl,
  "Paired Chinese article canonical does not match its sitemap URL",
);
assert(
  chineseAlternates.get("zh-cn") === pair.chineseUrl,
  "Paired Chinese article must self-reference in hreflang",
);
assert(
  chineseAlternates.get("en") === pair.englishUrl,
  "Paired Chinese article must point at the English URL from the sitemap",
);
assert(
  chineseAlternates.get("x-default") === pair.chineseUrl,
  "Paired Chinese article x-default must be the Chinese page",
);

const englishResponse = await fetchWithTimeout(pair.englishUrl, {
  headers: { "User-Agent": "fwqgo-deploy-article-isr-check/1.0" },
});
assert(
  englishResponse.status === 200,
  `Paired English article returned HTTP ${englishResponse.status}`,
);
const englishAlternates = headAlternates(
  cheerio.load(await englishResponse.text()),
);
assert(
  englishAlternates.get("zh-cn") === pair.chineseUrl,
  "English article must point back at the Chinese page",
);
assert(
  englishAlternates.get("en") === pair.englishUrl,
  "English article must self-reference in hreflang",
);
assert(
  englishAlternates.get("x-default") === pair.chineseUrl,
  "English article x-default must be the Chinese page",
);

console.log(
  JSON.stringify({
    article: canonicalUrl,
    status: response.status,
    rawTextLength: proseText.length,
    cacheControl,
    canonicalCacheControl,
    cloudflare: response.headers.get("cf-cache-status") ?? "unavailable",
    ttfbMs,
    totalMs,
    rscStatus: rscResponse.status,
    rscCacheControl: rscCacheControl || "none",
    bilingualPair: pair,
  }),
);
