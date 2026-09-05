import assert from "node:assert/strict";
import * as cheerio from "cheerio";

const origin = (process.env.SITE_URL ?? "https://fwqgo.com").replace(
  /\/+$/,
  "",
);
const nonce = `seo-missing-${Date.now()}`;
const all = process.argv.includes("--all");
/** @type {[string, string]} */
const userAgents = [
  "Mozilla/5.0 fwqgo-public-seo-check/1.0",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
];
let requests = 0;

/** @param {string | URL} path @param {Record<string, string>} [headers] @param {string} [method] */
async function get(path, headers = {}, method = "GET") {
  requests++;
  const response = await fetch(new URL(path, `${origin}/`), {
    method,
    redirect: "manual",
    headers: { "User-Agent": userAgents[0], ...headers },
    signal: AbortSignal.timeout(30_000),
  });
  return { response, body: await response.text() };
}

/** @param {string} html */
function robotsPolicies(html) {
  const $ = cheerio.load(html);
  return $('meta[name="robots"]')
    .map((_, element) => $(element).attr("content") ?? "")
    .get();
}

/** @param {Response} response @param {string} label */
function assertNoPublicCache(response, label) {
  for (const name of [
    "cache-control",
    "cdn-cache-control",
    "cloudflare-cdn-cache-control",
  ]) {
    const policy = response.headers.get(name) ?? "";
    assert.ok(
      !/\bpublic\b|s-maxage=[1-9]/i.test(policy),
      `${label} inherited public HTML cache: ${name}: ${policy}`,
    );
  }
}

const missingPaths = [
  `/fwq/posts/${nonce}`,
  `/en/fwq/posts/${nonce}`,
  "/fwq/page/99999999",
  "/en/fwq/page/99999999",
  "/fwq/page/0",
  "/en/fwq/page/1abc",
  `/fwq/${nonce}/page/1`,
  `/en/fwq/${nonce}/page/1`,
  `/fwq/tags/${nonce}/page/1`,
  `/en/fwq/tags/${nonce}/page/1`,
  `/knowledge/${nonce}`,
  `/en/knowledge/${nonce}`,
  `/servers/providers/${nonce}`,
  "/servers/regions/Deploy%20in%20Multiple%20Locations",
  `/servers/${nonce}`,
];
/** @type {Array<[string, string]>} */
const emptyFixtures = [
  ["SEO_EMPTY_CATEGORY", "fwq"],
  ["SEO_EMPTY_TAG", "fwq/tags"],
];
for (const [key, segment] of emptyFixtures) {
  if (process.env[key])
    missingPaths.push(
      `/${segment}/${encodeURIComponent(process.env[key])}/page/1`,
    );
}
if (process.env.SEO_MISSING_PATHS) {
  /** @type {unknown} */
  const paths = JSON.parse(process.env.SEO_MISSING_PATHS);
  assert.ok(
    Array.isArray(paths) && paths.every((path) => typeof path === "string"),
  );
  missingPaths.push(...paths);
}

for (const userAgent of userAgents) {
  for (const path of missingPaths) {
    const { response, body } = await get(path, { "User-Agent": userAgent });
    assert.equal(response.status, 404, `${path}: expected a real 404`);
    assertNoPublicCache(response, path);
    const policies = robotsPolicies(body);
    assert.equal(
      policies.some((value) => /(^|[,\s])index([,\s]|$)/i.test(value)),
      false,
      `${path}: conflicting index metadata`,
    );
    assert.equal(policies.length, 1, `${path}: expected one robots tag`);
    assert.match(policies[0] ?? "", /noindex/i);
    assert.equal(
      cheerio.load(body)('link[rel="canonical"]').length,
      0,
      `${path}: error page has a canonical`,
    );
  }
}
assert.ok(missingPaths[0]);
const head = await get(missingPaths[0], {}, "HEAD");
assert.equal(head.response.status, 404);
assertNoPublicCache(head.response, "HEAD 404");
assert.equal(head.body, "");

const sitemapIndex = await get("/sitemap.xml");
assert.equal(sitemapIndex.response.status, 200);
const index = cheerio.load(sitemapIndex.body, { xmlMode: true });
const sitemapUrls = index("sitemap > loc")
  .map((_, e) => index(e).text())
  .get();
assert.ok(
  sitemapUrls.some((url) => url.endsWith("/sitemap-core.xml")),
  "Core sitemap missing",
);
/** @type {Map<string, Array<{language: string, href: string}>>} */
const entries = new Map();
for (const url of sitemapUrls) {
  assert.equal(new URL(url).origin, origin, `Foreign sitemap: ${url}`);
  const { response, body } = await get(url);
  assert.equal(response.status, 200, url);
  assert.match(response.headers.get("content-type") ?? "", /xml/);
  const xml = cheerio.load(body, { xmlMode: true });
  xml("urlset > url").each((_, node) => {
    const loc = xml(node).find("loc").text();
    assert.equal(entries.has(loc), false, `Duplicate sitemap URL: ${loc}`);
    assert.equal(new URL(loc).origin, origin, `Foreign URL: ${loc}`);
    assert.equal(new URL(loc).search, "", `Query URL in sitemap: ${loc}`);
    if (/\/servers\/(providers|regions|lines)\//.test(loc)) {
      assert.match(
        new URL(loc).pathname.split("/").at(-1) ?? "",
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        `Raw entity in sitemap: ${loc}`,
      );
    }
    const alternates = xml(node)
      .find("xhtml\\:link")
      .map((_, e) => ({
        language: xml(e).attr("hreflang") ?? "",
        href: xml(e).attr("href") ?? "",
      }))
      .get();
    entries.set(loc, alternates);
  });
}
for (const [loc, alternates] of entries) {
  for (const alternate of alternates) {
    assert.ok(
      entries.has(alternate.href),
      `hreflang absent from sitemap: ${alternate.href}`,
    );
    if (alternate.language !== "x-default") {
      assert.ok(
        entries.get(alternate.href)?.some((other) => other.href === loc),
        `Nonreciprocal hreflang: ${loc}`,
      );
    }
  }
}

const selected = all
  ? [...entries.keys()]
  : [...entries.keys()]
      .filter((url, i) => i < 3 || url.endsWith("/page/1"))
      .slice(0, 20);
for (const url of selected) {
  const { response, body } = await get(url);
  assert.equal(response.status, 200, `Sitemap URL is not 200: ${url}`);
  const $ = cheerio.load(body);
  const headEnd = body.indexOf("</head>");
  assert.ok(headEnd > 0, `Initial head missing: ${url}`);
  const initialHead = cheerio.load(body.slice(0, headEnd + 7));
  const canonical = initialHead('link[rel="canonical"]').attr("href");
  assert.ok(canonical, `Initial canonical missing: ${url}`);
  assert.equal(
    new URL(canonical).href,
    new URL(url).href,
    `Noncanonical sitemap URL: ${url}`,
  );
  assert.ok(
    !robotsPolicies(body).some((policy) => /noindex/i.test(policy)),
    `noindex in sitemap: ${url}`,
  );
  for (const alternate of entries.get(url) ?? []) {
    const href = initialHead(
      `link[rel="alternate"][hreflang="${alternate.language}"]`,
    ).attr("href");
    assert.ok(href, `Missing head hreflang: ${url}`);
    assert.equal(
      new URL(href).href,
      new URL(alternate.href).href,
      `Head/sitemap hreflang disagreement: ${url}`,
    );
  }
  if (url.includes("/fwq/posts/")) {
    const prose = $("article .article-prose");
    assert.ok(
      prose.text().trim().length >= 200,
      `Article has no usable prose: ${url}`,
    );
    assert.equal(
      prose.parents("[hidden]").length,
      0,
      `Article prose hidden in a resume segment: ${url}`,
    );
  }
}

const categoryUrl = [...entries.keys()].find((url) =>
  /\/fwq\/(?!tags\/)[^/]+\/page\/1$/.test(url),
);
/** @type {Array<[string, string]>} */
const redirects = [];
if (process.env.SEO_REDIRECTS_JSON) {
  /** @type {unknown} */
  const parsed = JSON.parse(process.env.SEO_REDIRECTS_JSON);
  assert.ok(Array.isArray(parsed));
  for (const pair of parsed) {
    assert.ok(
      Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === "string" &&
        typeof pair[1] === "string",
    );
    redirects.push([pair[0], pair[1]]);
  }
}
if (categoryUrl)
  redirects.push([
    new URL(categoryUrl).pathname.replace(/\/1$/, "/0001"),
    new URL(categoryUrl).pathname,
  ]);
for (const [source, target] of redirects) {
  const { response } = await get(`${source}?seo_probe=1&a=2`);
  assert.equal(response.status, 301, `Alias should be a single 301: ${source}`);
  const locationHeader = response.headers.get("location");
  assert.ok(locationHeader);
  const location = new URL(locationHeader, origin);
  assert.equal(location.pathname, target);
  assert.equal(location.search, "?seo_probe=1&a=2");
  const destination = await get(location.href);
  assert.equal(
    destination.response.status,
    200,
    `Redirect chain or invalid target: ${source}`,
  );
}

const articleUrl = [...entries.keys()].find((url) =>
  url.includes("/fwq/posts/"),
);
assert.ok(articleUrl, "No public article to test cache boundaries");
/** @type {Array<Record<string, string>>} */
const bypassRequests = [
  { RSC: "1", "Next-Router-Prefetch": "1" },
  { "Next-Router-Segment-Prefetch": "/_tree" },
  { Cookie: "seo_probe=1" },
];
for (const headers of bypassRequests) {
  const path = headers.RSC ? `${articleUrl}?_rsc=seo` : articleUrl;
  const { response } = await get(path, headers);
  assert.ok(
    [200, 204, 307].includes(response.status),
    `Unexpected RSC/cookie status: ${response.status}`,
  );
  assertNoPublicCache(response, "RSC/cookie request");
  if (response.status === 307) {
    const location = response.headers.get("location");
    assert.ok(location);
    const target = new URL(location, origin);
    assert.equal(
      target.pathname,
      new URL(articleUrl).pathname,
      "Prefetch redirect changed the resource",
    );
    assert.ok(target.searchParams.has("_rsc"));
    const next = await get(target.href, headers);
    assert.ok(
      [200, 204].includes(next.response.status),
      "RSC normalization should finish in one redirect",
    );
    assertNoPublicCache(next.response, "Normalized RSC request");
  }
}

if (new URL(origin).hostname === "fwqgo.com") {
  for (const userAgent of userAgents) {
    for (const host of [
      "http://fwqgo.com",
      "http://www.fwqgo.com",
      "https://www.fwqgo.com",
    ]) {
      const { response } = await get(`${host}/fwq/page/1?seo_probe=1&a=2`, {
        "User-Agent": userAgent,
      });
      assert.ok(
        [301, 308].includes(response.status),
        `Host alias did not redirect: ${host}`,
      );
      assert.equal(
        response.headers.get("location"),
        "https://fwqgo.com/fwq/page/1?seo_probe=1&a=2",
      );
    }
  }
} else {
  const { response } = await get("/fwq/page/1?seo_probe=1&a=2", {
    "X-Forwarded-Host": "www.fwqgo.com",
  });
  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get("location"),
    "https://fwqgo.com/fwq/page/1?seo_probe=1&a=2",
  );
}

console.log(
  JSON.stringify({
    status: "passed",
    requests,
    sitemapUrls: entries.size,
    checkedPages: selected.length,
    redirects: redirects.length,
    userAgents: 2,
  }),
);
