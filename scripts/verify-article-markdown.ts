import assert from "node:assert/strict";
import test from "node:test";
import * as cheerio from "cheerio";

import {
  htmlToArticleMarkdown,
  renderArticleContentHtml,
} from "../packages/core/content";

const requestText =
  "Hello, Could you please double the monthly bandwidth and assign an IPv6 address for my VPS? Service ID: [填写你的服务ID] Invoice Number: [填写账单号] Thank you!";
const legacyEscaped = "**&#xA0;\\`\\`****`text " + requestText + "\u00a0`****\\`\\`**";
const legacyUnescaped = "**&#xA0;``****`text " + requestText + "\u00a0`****``**";

function render(source: string) {
  return cheerio.load(renderArticleContentHtml(source), null, false);
}

void test("standalone Markdown separators render as horizontal rules", () => {
  for (const separator of ["---", "-----", "***", "___", "  - - -  "]) {
    const $ = render(`前一段\n\n${separator}\n\n后一段`);
    assert.equal($("hr").length, 1, separator);
    assert.deepEqual($("p").map((_, node) => $(node).text()).get(), ["前一段", "后一段"]);
  }
});

void test("separators do not consume list items or Markdown table dividers", () => {
  const $ = render("- 第一项\n\n---\n\n- 第二项\n\n| 套餐 | 价格 |\n| --- | --- |\n| A | 5 美元 |");
  assert.equal($("hr").length, 1);
  assert.equal($("li").length, 2);
  assert.equal($("table tbody td").length, 2);
});

void test("plain dashes and escaped separators remain literal text", () => {
  for (const source of ["--", "VPS---Plan", "\\---"]) {
    assert.equal(render(source)("hr").length, 0);
  }
});

void test("the supplied escaped and unescaped legacy code fences retain the entire template", () => {
  for (const source of [legacyEscaped, legacyUnescaped, legacyEscaped.replace("&#xA0;", "&nbsp;"), legacyEscaped.replace("&#xA0;", "\u00a0")]) {
    const $ = render(`申请模板：\n\n${source}\n\n填写信息后提交。`);
    assert.equal($("pre > code").length, 1, source);
    assert.equal($("pre > code").text().trim(), requestText);
    assert.equal($("pre strong, pre a").length, 0);
    assert.equal($("p").last().text(), "填写信息后提交。");
    assert.ok(!$.root().text().includes("&#xA0;"));
    assert.ok(!$.root().text().includes("``"));
  }
});

void test("legacy code fence repair preserves line breaks and blank lines", () => {
  const message = "Hello,\n\nCould you please double the monthly bandwidth?\nService ID: [填写你的服务ID]\nInvoice Number: [填写账单号]\n\nThank you!";
  const $ = render("**&#xA0;\\`\\`****`text\n" + message + "`****\\`\\`**");
  assert.equal($("pre code").text().trimEnd(), message);
});

void test("a legacy-looking example inside a valid fence is not repaired", () => {
  const $ = render("````markdown\n" + legacyEscaped + "\n````");
  assert.equal($("pre code").text().trimEnd(), legacyEscaped);
});

void test("standard code fences preserve Markdown, separators, links and HTML literally", () => {
  const code = '---\n**literal**\n[购买](https://example.com/buy)\n<script>alert("x")</script>\n&#xA0;';
  for (const delimiter of ["```", "````", "~~~"]) {
    const $ = render(`${delimiter}text\n${code}\n${delimiter}`);
    assert.equal($("pre code").text().trimEnd(), code);
    assert.equal($("hr, strong, a, script").length, 0);
  }
});

void test("code spans take precedence over emphasis and links", () => {
  const code = "**保持原样** [购买](https://example.com)";
  const $ = render("`" + code + "` **正常加粗**");
  assert.equal($("code").text(), code);
  assert.equal($("code strong, code a").length, 0);
  assert.equal($("strong").text(), "正常加粗");
});

void test("multiple-backtick spans and code within bold text render correctly", () => {
  const $ = render("运行 ``echo `Hello` && **literal**``；**复制 `ls -la`**");
  assert.equal($("code").first().text(), "echo `Hello` && **literal**");
  assert.equal($("strong code").text(), "ls -la");
  assert.equal(render("\\`不是代码\\`")("code").length, 0);
});

void test("character references decode as text outside code without becoming HTML", () => {
  const $ = render("A&#xA0;B &amp; C &lt;label&gt;；`&#xA0;`；&#42;&#42;不是加粗&#42;&#42;");
  assert.ok($("p").text().includes("A\u00a0B & C <label>"));
  assert.equal($("code").text(), "&#xA0;");
  assert.equal($("label, strong").length, 0);
});

void test("tables retain distinct purchase destinations and paid-link attributes", () => {
  const first = "https://merchant.example/buy/(basic)?plan=1&aff=fwqgo";
  const second = "https://merchant.example/buy?plan=2&aff=fwqgo";
  const $ = render(`| 套餐 | 购买 |\n| --- | --- |\n| A | [购买 A](<${first}>) |\n| B | [购买 B](${second}) |`);
  assert.deepEqual($("td a").map((_, node) => $(node).attr("href")).get(), [first, second]);
  assert.equal($("td a").first().attr("rel"), "nofollow sponsored noopener noreferrer");
  assert.equal(render("[购买](/go/test-plan)")("a").attr("rel"), "nofollow");
});

void test("unsafe links and executable HTML remain blocked", () => {
  const $ = render("## 正文\n\n[危险](javascript:alert%281%29)\n\n<script>alert(1)</script>");
  assert.equal($("a[href], script").length, 0);
  assert.ok($.root().text().includes("正文"));
});

void test("HTML conversion retains horizontal rules and the indentation of code", () => {
  const originalCode = "  echo hello\n    echo world\n```";
  const { markdown } = htmlToArticleMarkdown(`<p>上文</p><hr><pre><code>${originalCode}</code></pre><p>下文</p>`);
  const $ = render(markdown);
  assert.equal($("hr").length, 1);
  assert.equal($("pre code").text().trimEnd(), originalCode);
  assert.deepEqual($("p").map((_, node) => $(node).text()).get(), ["上文", "下文"]);
});
