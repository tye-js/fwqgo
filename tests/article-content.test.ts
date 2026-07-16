import assert from "node:assert/strict";
import test from "node:test";

import {
  contentToArticleMarkdown,
  htmlToArticleMarkdown,
  renderArticleContentHtml,
} from "@fwqgo/core/content";

void test("renders external Markdown links with their label and safe attributes", () => {
  const html = renderArticleContentHtml(
    "[立即购买](https://merchant.example/buy?plan=1&aff=fwqgo)",
  );

  assert.match(html, />立即购买<\/a>/);
  assert.match(
    html,
    /href="https:\/\/merchant\.example\/buy\?plan=1&amp;aff=fwqgo"/,
  );
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="nofollow sponsored noopener noreferrer"/);
});

void test("preserves distinct purchase links inside Markdown tables", () => {
  const html = renderArticleContentHtml(`
| 套餐 | 购买 |
| --- | --- |
| A | [购买 A](https://merchant.example/buy?a=1) |
| B | [购买 B](https://merchant.example/buy?b=2) |
`);

  assert.match(html, /<table>/);
  assert.match(html, />购买 A<\/a>/);
  assert.match(html, /buy\?a=1/);
  assert.match(html, />购买 B<\/a>/);
  assert.match(html, /buy\?b=2/);
});

void test("wraps wide article tables without changing cell links", () => {
  const html = renderArticleContentHtml(`
| 套餐 | CPU | 内存 | 地区 | 购买 |
| --- | --- | --- | --- | --- |
| A | 2 核 | 2 GB | 香港 | [购买](https://merchant.example/a) |
`);

  assert.match(html, /class="article-table-scroll"/);
  assert.match(html, /href="https:\/\/merchant\.example\/a"/);
  assert.match(html, />购买<\/a>/);
});

void test("removes dangerous HTML while keeping safe article content", () => {
  const html = renderArticleContentHtml(
    '<p onclick="alert(1)">正文 <a href="javascript:alert(1)">危险</a></p><script>alert(1)</script>',
  );

  assert.match(html, /<p>正文 <a>危险<\/a><\/p>/);
  assert.doesNotMatch(html, /onclick|javascript:|script/i);
});

void test("generates stable unique heading ids", () => {
  const html = renderArticleContentHtml("## 套餐详情\n\n## 套餐详情");

  assert.match(html, /id="套餐详情"/);
  assert.match(html, /id="套餐详情-2"/);
});

void test("converts HTML tables to Markdown without dropping links", () => {
  const result = htmlToArticleMarkdown(`
    <table>
      <tr><th>套餐</th><th>购买</th></tr>
      <tr><td>A</td><td><a href="https://merchant.example/a?aff=fwqgo">立即购买</a></td></tr>
    </table>
  `);

  assert.match(result.markdown, /\| 套餐 \| 购买 \|/);
  assert.match(
    result.markdown,
    /\[立即购买\]\(https:\/\/merchant\.example\/a\?aff=fwqgo\)/,
  );
});

void test("reports Markdown truncation without converting it to HTML", () => {
  const result = contentToArticleMarkdown("第一段内容\n\n第二段内容", {
    maxLength: 6,
  });

  assert.equal(result.truncated, true);
  assert.equal(result.markdown, "第一段内容");
  assert.equal(result.length, 5);
});
