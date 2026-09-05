import assert from "node:assert/strict";
import * as cheerio from "cheerio";

const origin = new URL(process.env.KNOWLEDGE_SMOKE_URL ?? "http://127.0.0.1:3000");
const canonicalOrigin = process.env.KNOWLEDGE_CANONICAL_ORIGIN ?? "https://fwqgo.com";
const requireContent = process.env.KNOWLEDGE_SMOKE_REQUIRE_CONTENT !== "0";
const requireEdgeHit = process.env.KNOWLEDGE_SMOKE_REQUIRE_EDGE_HIT === "1";
const originOnly = process.env.KNOWLEDGE_SMOKE_ORIGIN_ONLY === "1";

/** @param {string | URL} path @param {RequestInit} [options] */
async function read(path, options = {}) {
  const startedAt = performance.now();
  const headers = new Headers(options.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", "fwqgo-knowledge-smoke/1.0");
  const response = await fetch(new URL(path, origin), {
    ...options,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const ttfbMs = Math.round(performance.now() - startedAt);
  const html = await response.text();
  return { response, html, ttfbMs };
}

/** @param {Response} response @param {string} label */
function assertSharedCacheBypassed(response, label) {
  const cdn = ["cdn-cache-control", "cloudflare-cdn-cache-control"]
    .map((name) => response.headers.get(name) ?? "");
  const browser = response.headers.get("cache-control") ?? "";
  assert.ok(cdn.some((value) => value.includes("no-store")) || /private|no-store/.test(browser),
    `${label} permits a shared cache: ${browser}`);
  assert.equal(response.headers.get("x-fwqgo-cacheable-knowledge"), null, `${label} incorrectly opts into knowledge HTML caching`);
  assert.notEqual(response.headers.get("cf-cache-status"), "HIT", `${label} was cached at Cloudflare`);
}

/** @type {Array<[string, string]>} */
const knowledgePages = [["/knowledge", "zh-CN"], ["/en/knowledge", "en"]];
for (const [path, language] of knowledgePages) {
  /** @type {Array<{ttfbMs: number; next: string | null; edge: string | null; cacheControl: string}>} */
  const samples = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const { response, html, ttfbMs } = await read(path);
    assert.equal(response.status, 200, `${path} returned ${response.status}`);
    const $ = cheerio.load(html);
    assert.equal($("html").attr("lang"), language);
    assert.equal($("main h1").length, 1, `${path} is missing its heading`);
    assert.equal($("main h1").parents("[hidden]").length, 0, `${path} heading is hidden in a streamed segment`);
    assert.ok($("head title").text().trim().length > 0);
    assert.ok(($('head meta[name="description"]').attr("content") ?? "").length > 0);
    assert.equal($('head link[rel="canonical"]').attr("href"), new URL(path, canonicalOrigin).href);
    assert.ok($('head link[rel="alternate"][hreflang="en"]').length > 0);
    assert.ok($('head link[rel="alternate"][hreflang="zh-CN"]').length > 0);
    assert.ok(!($('head meta[name="robots"]').attr("content") ?? "").includes("noindex"));
    const articleLinks = $("main a[href]").toArray().filter((element) => {
      const href = $(element).attr("href") ?? "";
      return href.startsWith(`${path}/`) && !href.includes("index-render");
    });
    if (requireContent) assert.ok(articleLinks.length > 0, `${path} has no knowledge content`);
    assert.equal($('a[href*="index-render"], form[action*="index-render"]').length, 0);
    const segmentIds = [...html.matchAll(/<(?:div|template)[^>]*\bid="(S:\d+)"/g)].map((match) => match[1]);
    assert.equal(segmentIds.length, new Set(segmentIds).size, `${path} contains duplicate resume IDs`);
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (originOnly) {
      assert.equal(response.headers.get("x-fwqgo-cacheable-knowledge"), "1", `${path} is not eligible for status-aware caching`);
    } else {
      assert.match(cacheControl, /s-maxage=300\b/, `${path} HTML is missing its status-aware cache policy: ${cacheControl}`);
      assert.doesNotMatch(cacheControl, /private|no-store/, `${path} HTML is marked private`);
    }
    if (attempt === 1 && requireEdgeHit) {
      assert.match(response.headers.get("cf-cache-status") ?? "", /HIT|STALE/, `${path} has no Cloudflare cache hit`);
    }
    samples.push({ ttfbMs, next: response.headers.get("x-nextjs-cache"), edge: response.headers.get("cf-cache-status"), cacheControl });
  }

  const filtered = await read(`${path}?q=__fwqgo_no_match_probe__`);
  assert.equal(filtered.response.status, 200);
  assertSharedCacheBypassed(filtered.response, `${path} search`);
  const $filtered = cheerio.load(filtered.html);
  assert.match($filtered('head meta[name="robots"]').attr("content") ?? "", /noindex/);
  assert.equal($filtered('input[name="q"]').attr("value"), "__fwqgo_no_match_probe__");

  for (const headers of [
    new Headers({ Cookie: "fwqgo-smoke=1" }),
    new Headers({ Authorization: "Bearer smoke-test" }),
    new Headers({ RSC: "1" }),
    new Headers({ "Next-Router-Prefetch": "1" }),
    new Headers({ "Next-Router-Segment-Prefetch": "/_tree" }),
  ]) {
    const probe = await read(path, { headers: Object.fromEntries(headers) });
    assertSharedCacheBypassed(probe.response, `${path} ${[...headers.keys()].join(",")}`);
  }
  let flight = await read(`${path}?_rsc=knowledge-smoke`, { headers: { RSC: "1" } });
  // Next.js canonicalizes the Flight request hash. Validate the bypass on the
  // redirects too, then inspect the actual RSC response rather than a 307 body.
  for (let redirects = 0; redirects < 2 && [307, 308].includes(flight.response.status); redirects++) {
    assertSharedCacheBypassed(flight.response, `${path} Flight redirect`);
    const location = flight.response.headers.get("location");
    assert.ok(location, "Flight redirect has no target");
    const target = new URL(location, origin);
    assert.equal(target.origin, origin.origin, "Flight redirected outside the tested origin");
    flight = await read(target, { headers: { RSC: "1" } });
  }
  assertSharedCacheBypassed(flight.response, `${path} Flight`);
  assert.match(flight.response.headers.get("content-type") ?? "", /text\/x-component/);

  for (const suffix of ["index", "__fwqgo_knowledge_static_shell__"]) {
    const internal = await read(`${path}/index-render/${suffix}`);
    assert.equal(internal.response.status, 404, "Internal render routes must not become public aliases");
    assertSharedCacheBypassed(internal.response, `${path} internal route`);
    assert.match(internal.response.headers.get("x-robots-tag") ?? "", /noindex/);
  }
  console.log(JSON.stringify({ path, samples, checks: "HTML, metadata, language, search, private/RSC bypasses and internal route rejection" }));
}

const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
const redirectSource = isLocal
  ? new URL("/en/knowledge?q=CN2%20GIA&a=1&a=2", origin)
  : new URL("https://www.fwqgo.com/en/knowledge?q=CN2%20GIA&a=1&a=2");
const redirected = await read(redirectSource, isLocal ? { headers: { Host: "www.fwqgo.com", "X-Forwarded-Host": "www.fwqgo.com" } } : {});
assert.equal(redirected.response.status, 301);
assert.equal(redirected.response.headers.get("location"), "https://fwqgo.com/en/knowledge?q=CN2%20GIA&a=1&a=2");
console.log("Knowledge HTTP smoke passed. Run smoke:mobile for actual viewport and navigation checks.");
