import * as cheerio from "cheerio";

const siteUrl = (process.env.SITE_URL ?? "https://fwqgo.com").replace(
  /\/+$/,
  "",
);
const configuredReleaseId = process.env.ARTICLE_ISR_RELEASE_ID?.trim();
const releaseId = configuredReleaseId?.length
  ? configuredReleaseId
  : String(Date.now());

/** @param {unknown} condition @param {string} message */
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
  const candidates = sitemapArticleUrls(await sitemapResponse.text()).slice(
    0,
    5,
  );
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

const { canonicalUrl, probeUrl, response, html, $, ttfbMs, totalMs } =
  await findPublishedArticle();
const article = $("article").first();
const prose = article.find(".article-prose").first();
const proseText = prose.text().replace(/\s+/g, " ").trim();
const cacheControl = response.headers.get("cache-control") ?? "";

assert(
  cacheControl.includes("public") && cacheControl.includes("s-maxage=900"),
  `Article omitted the public ISR cache policy: ${cacheControl || "none"}`,
);
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
assert(
  $('head link[rel="alternate"]').length > 0,
  "Article hreflang links are missing from head",
);
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

console.log(
  JSON.stringify({
    article: canonicalUrl,
    status: response.status,
    rawTextLength: proseText.length,
    cacheControl,
    cloudflare: response.headers.get("cf-cache-status") ?? "unavailable",
    ttfbMs,
    totalMs,
    rscStatus: rscResponse.status,
    rscCacheControl: rscCacheControl || "none",
  }),
);
