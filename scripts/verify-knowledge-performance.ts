import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPublicCacheEventTargets } from "../packages/cache/tags";
import {
  getKnowledgeIndexRewritePath,
  isKnowledgeIndexRenderPath,
  knowledgeIndexRenderPath,
  normalizeKnowledgeQuery,
  resolveKnowledgeBrowsePage,
} from "../packages/core/knowledge-index";
import {
  getPrimaryPublicRedirectUrl,
  isPublicHtmlRequest,
} from "../packages/core/public-route-policy";

for (const [pathname, language] of [
  ["/knowledge", "zh"],
  ["/en/knowledge", "en"],
] as const) {
  const url = new URL(pathname, "https://fwqgo.com");
  assert.equal(
    getKnowledgeIndexRewritePath(url),
    knowledgeIndexRenderPath(language),
  );
  for (const query of [
    "q=test",
    "q=",
    "category=network",
    "page=1",
    "page=2",
    "q=a&q=b",
  ]) {
    const filtered = new URL(`${pathname}?${query}`, url);
    assert.equal(
      getKnowledgeIndexRewritePath(filtered),
      null,
      `Search must remain dynamic: ${filtered}`,
    );
  }
  for (const query of ["utm_source=test", "_rsc=next-flight"]) {
    const tracked = new URL(`${pathname}?${query}`, url);
    assert.equal(
      getKnowledgeIndexRewritePath(tracked),
      knowledgeIndexRenderPath(language),
    );
    assert.equal(
      isPublicHtmlRequest({
        url: tracked.href,
        method: "GET",
        headers: new Headers(),
      }),
      false,
    );
  }
  assert.equal(
    isKnowledgeIndexRenderPath(knowledgeIndexRenderPath(language)),
    true,
  );
  assert.equal(
    isKnowledgeIndexRenderPath(`${pathname}/%69ndex-render/index`),
    true,
  );
  assert.equal(
    isKnowledgeIndexRenderPath(`${pathname}/ordinary-article`),
    false,
  );
}
for (const pathname of [
  "/",
  "/servers",
  "/knowledge/article",
  "/en/knowledge/article",
]) {
  assert.equal(
    getKnowledgeIndexRewritePath(new URL(pathname, "https://fwqgo.com")),
    null,
  );
}

const categories = [
  {
    id: 11,
    slug: "网络",
    enSlug: "network",
    zhArticleCount: 36,
    enArticleCount: 18,
  },
  {
    id: 19,
    slug: "配置",
    enSlug: "configuration",
    zhArticleCount: 1,
    enArticleCount: 20,
  },
];
assert.deepEqual(
  resolveKnowledgeBrowsePage(
    categories,
    normalizeKnowledgeQuery({ language: "zh" }),
  ),
  {
    categoryId: null,
    total: 37,
    totalPages: 3,
    page: 1,
  },
);
assert.deepEqual(
  resolveKnowledgeBrowsePage(
    categories,
    normalizeKnowledgeQuery({
      language: "en",
      categorySlug: " network ",
      page: 10_000,
    }),
  ),
  {
    categoryId: 11,
    total: 18,
    totalPages: 1,
    page: 1,
  },
);
assert.deepEqual(
  resolveKnowledgeBrowsePage(
    categories,
    normalizeKnowledgeQuery({ language: "zh", categorySlug: "网络", page: 2 }),
  ),
  {
    categoryId: 11,
    total: 36,
    totalPages: 2,
    page: 2,
  },
);
for (const categorySlug of [
  "missing",
  "network",
  "arbitrary-input-".repeat(30),
]) {
  assert.equal(
    resolveKnowledgeBrowsePage(
      categories,
      normalizeKnowledgeQuery({ language: "zh", categorySlug }),
    ),
    null,
  );
}
for (const page of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(normalizeKnowledgeQuery({ language: "zh", page }).page, 1);
}
assert.equal(
  normalizeKnowledgeQuery({ language: "zh", query: "x".repeat(500) }).query
    .length,
  120,
);
assert.deepEqual(
  resolveKnowledgeBrowsePage([], normalizeKnowledgeQuery({ language: "en" })),
  {
    categoryId: null,
    total: 0,
    totalPages: 1,
    page: 1,
  },
);

const redirectCases: Record<string, string>[] = [
  { host: "www.fwqgo.com" },
  { "x-forwarded-host": "WWW.FWQGO.COM:443, upstream.internal" },
];
for (const headers of redirectCases) {
  const redirect = getPrimaryPublicRedirectUrl({
    url: "http://127.0.0.1:3000/en/knowledge?q=CN2%20GIA&a=1&a=2",
    headers: new Headers(headers),
  });
  assert.equal(
    redirect?.href,
    "https://fwqgo.com/en/knowledge?q=CN2%20GIA&a=1&a=2",
  );
}
assert.equal(
  getPrimaryPublicRedirectUrl({
    url: "https://www.fwqgo.com/",
    headers: new Headers(),
  })?.href,
  "https://fwqgo.com/",
);
assert.equal(
  getPrimaryPublicRedirectUrl({
    url: "https://fwqgo.com/",
    headers: new Headers(),
  }),
  null,
);
assert.equal(
  getPrimaryPublicRedirectUrl({
    url: "https://www.fwqgo.com.evil.example/",
    headers: new Headers(),
  }),
  null,
);
const doubleSlash = getPrimaryPublicRedirectUrl({
  url: "https://www.fwqgo.com//other.example/path",
  headers: new Headers(),
});
assert.equal(
  doubleSlash?.origin,
  "https://fwqgo.com",
  "A path must never become a redirect host",
);
assert.equal(doubleSlash?.pathname, "//other.example/path");

const htmlRequest = {
  url: "https://fwqgo.com/knowledge",
  method: "GET",
  headers: new Headers(),
};
assert.equal(isPublicHtmlRequest(htmlRequest), true);
assert.equal(isPublicHtmlRequest({ ...htmlRequest, method: "HEAD" }), true);
assert.equal(isPublicHtmlRequest({ ...htmlRequest, method: "POST" }), false);
for (const name of [
  "cookie",
  "authorization",
  "rsc",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-router-state-tree",
]) {
  assert.equal(
    isPublicHtmlRequest({
      ...htmlRequest,
      headers: new Headers({ [name]: "1" }),
    }),
    false,
    name,
  );
}

const cacheSource = readFileSync("packages/cache/tags.ts", "utf8");
const invalidation = getPublicCacheEventTargets("knowledge.changed");
assert.ok(invalidation.tags.includes("knowledge"));
assert.ok(invalidation.paths.includes(knowledgeIndexRenderPath("zh")));
assert.ok(invalidation.paths.includes(knowledgeIndexRenderPath("en")));
assert.ok(cacheSource.includes('knowledgeIndexRenderPath("zh")'));
assert.ok(cacheSource.includes('knowledgeIndexRenderPath("en")'));
const indexSource = readFileSync(
  "src/features/public/routes/knowledge/page.tsx",
  "utf8",
);
const landing = indexSource.slice(
  indexSource.indexOf("export function KnowledgeLandingPage"),
  indexSource.indexOf("export function KnowledgeIndexPage"),
);
assert.ok(landing.includes("<KnowledgeIndexContent"));
assert.ok(
  !landing.includes("connection(") && !landing.includes("searchParams"),
);

console.log(
  "Knowledge performance boundaries verified: bilingual ISR routing, bounded browse cache, search isolation, cache invalidation, proxy redirects and private/RSC bypasses",
);
