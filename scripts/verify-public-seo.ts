import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getPublicPageCount,
  isPublicArticleSourceRenderable,
  isPublicTaxonomyPageIndexable,
  parsePublicPageNumber,
  publicTaxonomyAlternates,
} from "../packages/core/public-content-policy";
import {
  isPublicHtmlRequest,
  parsePublicResourceRoute,
  publicResourcePath,
} from "../packages/core/public-route-policy";
import { resolveServerEntity } from "../packages/core/server-entity";

for (const value of [
  "0",
  "-1",
  "1.5",
  "+1",
  "1abc",
  "1e2",
  "",
  "9007199254740992",
  "１",
]) {
  assert.equal(
    parsePublicPageNumber(value),
    null,
    `Invalid page accepted: ${value}`,
  );
}
assert.deepEqual(parsePublicPageNumber("0001"), { value: 1, canonical: false });
assert.deepEqual(parsePublicPageNumber("2"), { value: 2, canonical: true });
assert.equal(getPublicPageCount(11), 2);
assert.equal(getPublicPageCount(0), 0);
assert.equal(
  isPublicTaxonomyPageIndexable({ page: 1, publishedPostCount: 2 }),
  false,
);
assert.equal(
  isPublicTaxonomyPageIndexable({ page: 1, publishedPostCount: 3 }),
  true,
);
assert.equal(
  isPublicTaxonomyPageIndexable({
    page: 1,
    publishedPostCount: 30,
    explicitlyIndexable: false,
  }),
  false,
);
assert.equal(
  isPublicTaxonomyPageIndexable({ page: 2, publishedPostCount: 30 }),
  false,
);
assert.equal(
  isPublicTaxonomyPageIndexable({ page: 0, publishedPostCount: 30 }),
  false,
);
const taxonomy = {
  baseUrl: "https://fwqgo.com",
  kind: "category" as const,
  zhSlug: "japan",
  enSlug: "japan-vps",
  zhPublishedPostCount: 4,
  enPublishedPostCount: 2,
  page: 1,
};
assert.equal(
  publicTaxonomyAlternates(taxonomy),
  undefined,
  "Thin English page must not receive hreflang",
);
assert.deepEqual(
  publicTaxonomyAlternates({ ...taxonomy, enPublishedPostCount: 3 }),
  {
    "zh-CN": "https://fwqgo.com/fwq/japan/page/1",
    en: "https://fwqgo.com/en/fwq/japan-vps/page/1",
    "x-default": "https://fwqgo.com/fwq/japan/page/1",
  },
);
assert.equal(
  publicTaxonomyAlternates({ ...taxonomy, enPublishedPostCount: 30, page: 2 }),
  undefined,
);
assert.equal(
  isPublicArticleSourceRenderable({
    title: "Title",
    slug: "post",
    content: "x".repeat(199),
  }),
  false,
);
assert.equal(
  isPublicArticleSourceRenderable({
    title: "Title",
    slug: "post",
    content: "x".repeat(200),
  }),
  true,
);
assert.equal(
  isPublicArticleSourceRenderable({
    title: "Title",
    slug: "post",
    content: "😀".repeat(100),
  }),
  false,
);
assert.equal(
  isPublicArticleSourceRenderable({
    title: "  ",
    slug: "post",
    content: "x".repeat(300),
  }),
  false,
);

for (const path of [
  "/fwq/page/01",
  "/en/fwq/日本/page/0002",
  "/fwq/tags/CN2%20GIA/page/1",
]) {
  const route = parsePublicResourceRoute(path);
  assert.ok(route);
  assert.equal(publicResourcePath(route).includes("/page/0"), false);
}
for (const path of [
  "/fwq/page/-1",
  "/fwq/posts/a%2Fb",
  "/en/knowledge/%00",
  "/fwq/tags/%ZZ/page/1",
]) {
  assert.equal(parsePublicResourceRoute(path), null);
}
assert.equal(parsePublicResourceRoute("/api/health"), undefined);
const htmlRequest = {
  method: "GET",
  url: "https://fwqgo.com/fwq/posts/article",
  headers: new Headers(),
};
assert.equal(isPublicHtmlRequest(htmlRequest), true);
for (const header of [
  "RSC",
  "Next-Router-Prefetch",
  "Next-Router-Segment-Prefetch",
  "Next-Router-State-Tree",
  "Cookie",
  "Authorization",
]) {
  assert.equal(
    isPublicHtmlRequest({
      ...htmlRequest,
      headers: new Headers({ [header]: "1" }),
    }),
    false,
    header,
  );
}
assert.equal(isPublicHtmlRequest({ ...htmlRequest, method: "POST" }), false);
assert.equal(
  isPublicHtmlRequest({ ...htmlRequest, url: `${htmlRequest.url}?_rsc=x` }),
  false,
);
assert.equal(
  isPublicHtmlRequest({
    ...htmlRequest,
    url: `${htmlRequest.url}?utm_source=x`,
  }),
  false,
);

const entities = [
  {
    id: 1,
    slug: "united-states",
    name: "美国",
    enName: "United States",
    aliases: "US,USA",
  },
  {
    id: 2,
    slug: "united-kingdom",
    name: "英国",
    enName: "United Kingdom",
    aliases: "UK,GB",
  },
];
assert.equal(
  resolveServerEntity(entities, "United States")?.slug,
  "united-states",
);
assert.equal(resolveServerEntity(entities, "usa")?.slug, "united-states");
assert.equal(
  resolveServerEntity(entities, "Deploy in Multiple Locations"),
  null,
);
assert.equal(
  resolveServerEntity([{ id: 1, slug: "United States", name: "US" }], "US"),
  null,
);
assert.equal(
  resolveServerEntity(
    [...entities, { id: 3, slug: "ambiguous", name: "USA" }],
    "USA",
  ),
  null,
);
assert.equal(
  resolveServerEntity(
    [{ id: 16, slug: "racknerd-16", name: "RackNerd" }],
    "racknerd",
  )?.slug,
  "racknerd-16",
);

const migration = readFileSync("drizzle/0068_public_slug_history.sql", "utf8");
for (const invariant of [
  "pg_advisory_xact_lock",
  "fwqgo.allow_slug_change",
  "SECURITY DEFINER",
  "REVOKE ALL",
  'OLD."slugLocked"',
  '"public_slug_redirects"',
]) {
  assert.ok(
    migration.includes(invariant),
    `Missing slug history protection: ${invariant}`,
  );
}
// A collection page exists only for a canonical entity slug. The offer rows
// carry the upstream marketing text ("United States", "CMIN2 / CU9929", a
// provider name), so falling back to it put crawlable 404s on /servers, which
// is listed in sitemap-servers.xml.
const inventoryResults = readFileSync(
  "src/features/public/components/server-inventory-results.tsx",
  "utf8",
);
assert.ok(
  inventoryResults.includes("function CollectionLink("),
  "Offer rows must render a collection label without a canonical slug as plain text",
);
assert.ok(
  !/Slug \?\? offer\.(providerName|region|lineType)/.test(inventoryResults),
  "Collection hrefs must not fall back to unmapped marketing text",
);
for (const raw of ["providerName", "region", "lineType"]) {
  assert.ok(
    !new RegExp(`collectionHref\\([^)]*offer\\.${raw}\\b`).test(
      inventoryResults,
    ),
    `Collection hrefs must not be built from offer.${raw}`,
  );
}

console.log(
  "Public SEO rules verified: pagination, bilingual eligibility, publication quality, aliases and cache exclusions.",
);
