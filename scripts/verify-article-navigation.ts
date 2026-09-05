import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import webConfig from "../apps/web/next.config.js";
import type * as NextCacheMap from "next/dist/client/components/segment-cache/cache-map";
import type * as NextVaryPath from "next/dist/client/components/segment-cache/vary-path";
import type { MapValue } from "next/dist/client/components/segment-cache/cache-map";
import type { VaryPath } from "next/dist/client/components/segment-cache/vary-path";

const require = createRequire(import.meta.url);
type CacheMapModule = typeof NextCacheMap;
type VaryPathModule = typeof NextVaryPath;

/** Run the installed Next implementation, isolating only browser LRU scheduling. */
function loadNextModule<T>(
  moduleId: string,
  dependencies: Record<string, unknown>,
): T {
  const filename = require.resolve(moduleId);
  const moduleRecord = { exports: {} as unknown };
  const localRequire = createRequire(filename);
  const factory = vm.runInThisContext(
    `(function (module, exports, require) {\n${readFileSync(filename, "utf8")}\n})`,
    { filename },
  ) as (
    module: { exports: unknown },
    exports: unknown,
    require: (id: string) => unknown,
  ) => void;
  factory(moduleRecord, moduleRecord.exports, (id) =>
    Object.hasOwn(dependencies, id)
      ? dependencies[id]
      : (localRequire(id) as unknown),
  );
  return moduleRecord.exports as T;
}

// LRU timers are irrelevant to key identity. Keep Next's actual insertion,
// fallback lookup, expiry, and re-keying code instead of approximating a cache.
const cache = loadNextModule<CacheMapModule>(
  "next/dist/client/components/segment-cache/cache-map.js",
  {
    "./lru": {
      lruPut() {
        /* No browser scheduling is needed for these tiny cache fixtures. */
      },
      deleteFromLru() {
        /* Memory eviction is outside this key-identity regression. */
      },
      updateLruSize(node: { size: number }, size: number) {
        node.size = size;
      },
    },
  },
);
const vary = loadNextModule<VaryPathModule>(
  "next/dist/client/components/segment-cache/vary-path.js",
  { "./cache-map": cache },
);

type ArticleEntry = MapValue & { body: string };
function entry(body: string): ArticleEntry {
  return {
    ref: null,
    size: body.length,
    staleAt: Infinity,
    version: 1,
    status: 2,
    body,
  };
}

function articleKey(
  slug: string,
  language: "zh" | "en" = "zh",
  search = "",
): VaryPath {
  return vary.finalizePageVaryPath(
    `/${language}/fwq/posts/$d$slug/__PAGE__`,
    search as Parameters<VaryPathModule["finalizePageVaryPath"]>[1],
    vary.appendLayoutVaryPath(null, slug, "slug", false),
  );
}

function configuredKey(key: VaryPath, reportedParams: Set<string>) {
  return webConfig.experimental?.varyParams === false
    ? key
    : vary.getFulfilledSegmentVaryPath(key, reportedParams);
}

void test("reproduces URL B reading article A when staged params omit slug", () => {
  // Both forms were observed in complete Flight responses: [] and ['?'].
  for (const reported of [new Set<string>(), new Set(["?"])]) {
    const map = cache.createCacheMap<ArticleEntry>();
    const first = entry("Article A body");
    cache.setInCacheMap(
      map,
      vary.getFulfilledSegmentVaryPath(articleKey("a"), reported),
      first,
      false,
    );
    assert.equal(
      cache.getFromCacheMap(0, 1, map, articleKey("b"), false, true),
      first,
    );
  }
});

void test("public navigation keeps URL-specific keys and retains server ISR", () => {
  assert.equal(webConfig.experimental?.varyParams, false);
  assert.equal(webConfig.cacheComponents, true);
  assert.equal(webConfig.partialPrefetching, true);
});

void test("A to B to C to A preserves each article through cold and cached visits", () => {
  const map = cache.createCacheMap<ArticleEntry>();
  const reported = new Set<string>();
  const articles = new Map([
    ["a", "Article A body"],
    ["b", "Article B body"],
    ["c", "Article C body"],
  ]);
  let fetched = 0;
  for (const slug of ["a", "b", "c", "a", "c", "b", "a"]) {
    const key = articleKey(slug);
    let cached = cache.getFromCacheMap(0, 1, map, key, false, true);
    if (!cached) {
      fetched++;
      cached = entry(articles.get(slug)!);
      cache.setInCacheMap(map, configuredKey(key, reported), cached, false);
    }
    assert.equal(
      cached.body,
      articles.get(slug),
      `Stale body under URL ${slug}`,
    );
  }
  assert.equal(
    fetched,
    3,
    "Returning to a known article should still use its own cache",
  );
});

void test("late prefetches, Unicode slugs, language and query variants remain isolated", () => {
  const map = cache.createCacheMap<ArticleEntry>();
  const cases = [
    { slug: "文章-a", language: "zh" as const, search: "", body: "中文 A" },
    { slug: "article-b", language: "zh" as const, search: "", body: "中文 B" },
    {
      slug: "article-b",
      language: "en" as const,
      search: "",
      body: "English B",
    },
    {
      slug: "article-b",
      language: "en" as const,
      search: "?preview=1",
      body: "Query B",
    },
  ];
  // Complete the earlier request last, as happens when clicks outpace fetches.
  for (const article of [...cases].reverse()) {
    const key = articleKey(article.slug, article.language, article.search);
    cache.setInCacheMap(
      map,
      configuredKey(key, new Set(["?"])),
      entry(article.body),
      false,
    );
  }
  for (const article of [...cases, ...cases].reverse()) {
    const cached = cache.getFromCacheMap(
      0,
      1,
      map,
      articleKey(article.slug, article.language, article.search),
      false,
      true,
    );
    assert.equal(cached?.body, article.body);
  }
});

// Keep this verifier tied to the implementation that consumes the setting.
// A future Next upgrade must re-check the regression instead of silently
// passing after the experimental option is renamed or removed.
void test("installed Next consumes the varyParams opt-out in client cache writes", () => {
  const nextRoot = path.dirname(require.resolve("next/package.json"));
  const cacheSource = readFileSync(
    path.join(nextRoot, "dist/client/components/segment-cache/cache.js"),
    "utf8",
  );
  const defineEnv = readFileSync(
    path.join(nextRoot, "dist/build/define-env.js"),
    "utf8",
  );
  assert.ok(cacheSource.includes("process.env.__NEXT_VARY_PARAMS"));
  assert.ok(defineEnv.includes("config.experimental.varyParams"));
});
