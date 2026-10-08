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

void test("table-first articles get a real description instead of a title echo", () => {
  // 本站主力内容形态：首屏是规格表格，正文没有段落。走完整的净化 + 抽取链路，
  // 确认 description 不会退化成与 title 完全相同（页头 <h1> 下方也会显示它）。
  const tableFirst = extractArticleSeoContent(
    renderArticleContentHtml(
      [
        "## 配置详情",
        "",
        "| 内存 | 硬盘 |",
        "| --- | --- |",
        "| 8 GB DDR5 | 1 TB NVMe |",
        "",
        "## 亮点",
        "",
        "- CN2 GIA 优质线路，回程直连",
        "- 年付 199 元含 2TB 流量",
        "",
      ].join("\n"),
    ),
    dimensions,
    null,
  );
  // 列表项是完整可读的短语，优先于表格表头。
  assert.ok(
    tableFirst.excerpt.includes("CN2 GIA 优质线路"),
    `列表项应被用作摘要，实际：${JSON.stringify(tableFirst.excerpt)}`,
  );

  const seo = buildArticleSeo({
    inLanguage: "zh-CN",
    slug: "table-first",
    post: { ...post, description: null },
    content: tableFirst,
  });
  assert.notEqual(
    seo.description,
    seo.metadata.title,
    "description 不得回落到 title",
  );
  assert.ok(seo.description.length > 0);
  assert.ok(
    !seo.description.includes("8 GB DDR5"),
    "表格数据单元格不应混入摘要，它们不成句",
  );

  // 只有表格、没有列表时，表头仍好过复制标题。
  const tableOnly = extractArticleSeoContent(
    renderArticleContentHtml(
      ["| 内存 | 硬盘 |", "| --- | --- |", "| 8 GB | 1 TB |", ""].join("\n"),
    ),
    dimensions,
    null,
  );
  assert.ok(
    tableOnly.excerpt.includes("内存") && tableOnly.excerpt.includes("硬盘"),
    `表头应被用作摘要，实际：${JSON.stringify(tableOnly.excerpt)}`,
  );

  // 有段落时行为不变：段落优先，不被列表或表头污染。
  const withParagraphs = extractArticleSeoContent(
    renderArticleContentHtml("第一段正文。\n\n- 列表项\n"),
    dimensions,
    null,
  );
  assert.equal(withParagraphs.excerpt, "第一段正文。");
});

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

void test("hreflang is emitted only when both language versions exist", () => {
  for (const inLanguage of ["zh-CN", "en"] as const) {
    const paired = buildArticleSeo({
      inLanguage,
      slug: "offer",
      alternateSlug: "offer-en",
      post,
      content,
    });
    const languages = paired.metadata.alternates?.languages;
    assert.ok(languages, `${inLanguage}: 有配对时应输出 hreflang 集合`);
    const other = inLanguage === "en" ? "zh-CN" : "en";
    // 双向互指：两种语言互相指向对方。
    assert.equal(languages[inLanguage], paired.articleUrl);
    assert.ok(languages[other], `${inLanguage}: 配对方语言必须存在`);
    assert.notEqual(languages[other], paired.articleUrl);
    // x-default 恒定指向中文（主语言）页，与集合页 public-content-policy.ts 一致。
    assert.equal(
      languages["x-default"],
      inLanguage === "en" ? languages["zh-CN"] : paired.articleUrl,
    );

    // 无配对：整个集合都不输出，而不是输出自引用集合。
    const unpaired = buildArticleSeo({
      inLanguage,
      slug: "offer",
      alternateSlug: null,
      post,
      content,
    });
    assert.equal(
      unpaired.metadata.alternates?.languages,
      undefined,
      `${inLanguage}: 无配对时不应输出 hreflang 集合`,
    );
    assert.equal(unpaired.metadata.alternates?.canonical, unpaired.articleUrl);
  }
});

void test("blank descriptions use actual prose and unpaired articles never invent alternates", () => {
  const seo = buildArticleSeo({
    inLanguage: "en",
    slug: "offer",
    post: { ...post, description: " \n ", keywords: null },
    content,
  });
  assert.equal(seo.description, "Actual first paragraph about this offer.");
  // 无配对时不输出 hreflang 集合，改为断言整个集合为 undefined：
  // 早期实现会输出 `x-default` 指向本页自己，英文侧因此产生只含自引用的
  // `{en: 本页, x-default: 本页}`，等于声明「英文是所有语言的兜底」。
  // 站内集合页（public-content-policy.ts）用的是「不配对就不输出」，
  // 文章页现在与之对齐。
  assert.equal(seo.metadata.alternates?.languages, undefined);
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

void test("the article header never shows the publication date", () => {
  for (const language of ["zh", "en"] as const) {
    // 未被修改的文章：页头不应出现任何日期。
    const fresh = load(
      renderToStaticMarkup(
        <ArticlePublicationMeta
          publishedTime="2026-01-01T00:00:00.000Z"
          modifiedTime="2026-01-01T00:00:00.000Z"
          language={language}
        />,
      ),
    );
    assert.equal(fresh("time").length, 0, `${language}: 未修改时不应渲染日期`);
    assert.ok(!fresh.text().includes("发布于"));
    assert.ok(!fresh.text().includes("Published"));
    assert.ok(!fresh.text().includes("更新于"));
    assert.ok(!fresh.text().includes("Updated"));

    // 确实被修改过的文章：只显示更新时间，且发布时间不出现。
    const updated = load(
      renderToStaticMarkup(
        <ArticlePublicationMeta
          publishedTime="2026-01-01T00:00:00.000Z"
          modifiedTime="2026-02-02T00:00:00.000Z"
          language={language}
        />,
      ),
    );
    assert.equal(updated("time").length, 1, `${language}: 修改过应显示一个日期`);
    assert.equal(
      updated("time").attr("datetime"),
      "2026-02-02T00:00:00.000Z",
    );
    assert.ok(!updated.text().includes("发布于"));
    assert.ok(!updated.text().includes("Published"));
    assert.ok(
      updated.text().includes(language === "en" ? "Updated" : "更新于"),
      `${language}: 修改过应显示更新时间标签`,
    );
  }
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
    // 未修改时不输出日期，页头不会被一个等于发布时间的"更新"误导。
    const $ = load(
      renderToStaticMarkup(
        <ArticlePublicationMeta
          publishedTime={seo.publishedTime}
          modifiedTime={seo.modifiedTime}
        />,
      ),
    );
    assert.equal($("time").length, 0);
    assert.ok(!$.text().includes("更新于"));
    // SEO 侧的日期仍然要如实输出，不能因为页头不显示就丢掉。
    assert.ok(seo.publishedTime);
    assert.equal(seo.modifiedTime, seo.publishedTime);
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
  assert.equal($("time").length, 1);
  assert.equal($("time").attr("datetime"), seo.modifiedTime);
  assert.ok($.text().includes("Updated"));
  assert.ok(!$.text().includes("Published"));
});
