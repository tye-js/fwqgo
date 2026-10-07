import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";

import { renderArticleContentHtml } from "../packages/core/content";
import { DEFAULT_ARTICLE_COVER } from "../packages/core/article-cover";
import {
  buildArticleSeo,
  extractArticleSeoContent,
} from "../src/features/public/lib/article-seo";
import { getSiteUrl } from "../src/features/public/lib/site-structured-data";
import { ArticlePublicationMeta } from "../src/features/public/components/article-detail";

const post = {
  title: "An actual VPS offer",
  description: "  Editorial summary\nwith verified details.  ",
  keywords: "VPS, VPS，CN2 GIA",
  createdAt: new Date("2026-09-20T03:00:00Z"),
  updatedAt: new Date("2026-09-21T04:30:00Z"),
  categoryName: "服务器优惠",
  tags: [{ tag: { name: "VPS" } }, { tag: { name: "CN2 GIA" } }],
};
const body = renderArticleContentHtml(
  'Actual first paragraph about this offer.\n\n![套餐截图](/uploads/screenshot.webp?v=v2 "官网套餐")',
);
const dimensions = {
  "/uploads/screenshot.webp": { width: 1440, height: 900 },
  "/uploads/cover.webp": { width: 1600, height: 900 },
};
const content = extractArticleSeoContent(
  body,
  dimensions,
  "/uploads/cover.webp",
);

void test("bilingual metadata shares canonical, factual dates and article identity with JSON-LD", () => {
  for (const inLanguage of ["zh-CN", "en"] as const) {
    const seo = buildArticleSeo({
      inLanguage,
      slug: "actual-offer",
      alternateSlug: "translated-offer",
      post,
      content,
    });
    const english = inLanguage === "en";
    const expected = `${getSiteUrl()}${english ? "/en" : ""}/fwq/posts/actual-offer`;
    const alternate = `${getSiteUrl()}${english ? "" : "/en"}/fwq/posts/translated-offer`;
    assert.equal(seo.articleUrl, expected);
    assert.equal(seo.metadata.alternates?.canonical, expected);
    assert.equal(seo.metadata.alternates?.languages?.[inLanguage], expected);
    assert.equal(
      seo.metadata.alternates?.languages?.[english ? "zh-CN" : "en"],
      alternate,
    );
    assert.equal(
      seo.metadata.alternates?.languages?.["x-default"],
      english ? alternate : expected,
    );
    assert.equal(seo.jsonLd["@id"], `${expected}#article`);
    assert.equal(seo.jsonLd.mainEntityOfPage["@id"], expected);
    assert.equal(seo.jsonLd.inLanguage, inLanguage);
    assert.equal(seo.jsonLd.description, seo.metadata.description);
    assert.equal(seo.description, "Editorial summary with verified details.");
    assert.equal(seo.publishedTime, "2026-09-20T03:00:00.000Z");
    assert.equal(seo.modifiedTime, "2026-09-21T04:30:00.000Z");
    assert.deepEqual(seo.metadata.keywords, ["VPS", "CN2 GIA"]);
    const og = seo.metadata.openGraph;
    assert.ok(og && "publishedTime" in og);
    assert.equal(og.publishedTime, seo.jsonLd.datePublished);
    assert.equal(og.modifiedTime, seo.jsonLd.dateModified);
    assert.equal(og.locale, english ? "en_US" : "zh_CN");
    assert.deepEqual(og.alternateLocale, [english ? "zh_CN" : "en_US"]);
    assert.equal(seo.jsonLd.author["@type"], "Organization");
    assert.ok(seo.jsonLd.author.url);
    assert.deepEqual(seo.metadata.robots, {
      index: true,
      follow: true,
      "max-image-preview": "large",
    });
  }
});

void test("cover and body images retain original URLs and real dimensions without returning a cover to the body", () => {
  assert.equal(content.images.length, 2);
  assert.equal(content.images[0]?.url, `${getSiteUrl()}/uploads/cover.webp`);
  assert.deepEqual(content.images[1], {
    url: `${getSiteUrl()}/uploads/screenshot.webp?v=v2`,
    alt: "套餐截图",
    width: 1440,
    height: 900,
  });
  const noCover = extractArticleSeoContent(
    body,
    dimensions,
    DEFAULT_ARTICLE_COVER,
  );
  assert.equal(noCover.images.length, 1);
  const seo = buildArticleSeo({
    inLanguage: "zh-CN",
    slug: "offer",
    post,
    content: noCover,
  });
  assert.equal(
    seo.jsonLd.image?.[0]?.url,
    `${getSiteUrl()}/uploads/screenshot.webp?v=v2`,
  );
  assert.equal(load(body)("img").length, 1);
  assert.ok(!body.includes("cover.webp"));
  const repeated = extractArticleSeoContent(body + body, dimensions);
  assert.equal(repeated.images.length, 1);
  const noImages = extractArticleSeoContent(
    renderArticleContentHtml("![外链](https://example.com/a.png)"),
    dimensions,
    DEFAULT_ARTICLE_COVER,
  );
  assert.equal(noImages.images.length, 0);
  const textOnly = buildArticleSeo({
    inLanguage: "en",
    slug: "offer",
    post,
    content: noImages,
  });
  assert.equal(textOnly.jsonLd.image, undefined);
  assert.ok(textOnly.metadata.twitter && "card" in textOnly.metadata.twitter);
  assert.equal(textOnly.metadata.twitter.card, "summary");
});

void test("blank descriptions use actual prose and unpaired articles never invent alternates", () => {
  const seo = buildArticleSeo({
    inLanguage: "en",
    slug: "offer",
    post: { ...post, description: " \n ", keywords: null },
    content,
  });
  assert.equal(seo.description, "Actual first paragraph about this offer.");
  assert.equal(seo.metadata.alternates?.languages?.["zh-CN"], undefined);
  assert.equal(
    seo.metadata.alternates?.languages?.["x-default"],
    seo.articleUrl,
  );
  assert.equal(seo.metadata.openGraph?.alternateLocale, undefined);
  assert.deepEqual(seo.metadata.keywords, ["VPS", "CN2 GIA"]);
  const long = buildArticleSeo({
    inLanguage: "en",
    slug: "offer",
    post: { ...post, description: null },
    content: { ...content, excerpt: "Actual detailed sentence. ".repeat(30) },
  });
  assert.ok(long.description.length <= 160);
  assert.ok(long.description.endsWith("…"));
});

void test("historical backwards or invalid modified dates never create false freshness", () => {
  for (const updatedAt of [new Date("2024-01-01"), new Date("invalid"), null]) {
    const seo = buildArticleSeo({
      inLanguage: "zh-CN",
      slug: "offer",
      post: { ...post, updatedAt },
      content,
    });
    assert.equal(seo.modifiedTime, seo.publishedTime);
    const $ = load(
      renderToStaticMarkup(
        <ArticlePublicationMeta
          publishedTime={seo.publishedTime}
          modifiedTime={seo.modifiedTime}
        />,
      ),
    );
    assert.equal($("time").length, 1);
    assert.equal($("time").attr("datetime"), seo.publishedTime);
    assert.ok(!$.text().includes("更新于"));
  }
  const seo = buildArticleSeo({
    inLanguage: "en",
    slug: "offer",
    post,
    content,
  });
  const $ = load(
    renderToStaticMarkup(
      <ArticlePublicationMeta
        publishedTime={seo.publishedTime}
        modifiedTime={seo.modifiedTime}
        language="en"
      />,
    ),
  );
  assert.equal($("time").length, 2);
  assert.equal($("time").last().attr("datetime"), seo.modifiedTime);
  assert.ok($.text().includes("Updated"));
});
