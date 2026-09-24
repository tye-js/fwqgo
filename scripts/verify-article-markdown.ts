import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as cheerio from "cheerio";

import {
  buildArticleImageMarkdown,
  parseArticleImages,
} from "../packages/core/article-image-syntax";
import {
  contentToArticleMarkdown,
  htmlToArticleMarkdown,
  renderArticleContentHtml,
} from "../packages/core/content";

// 正文表格的滚动/列宽契约横跨两处：包裹层由 enhanceArticleTables 生成，
// 列宽由 .article-table-scroll table 的样式决定。任何一侧单独改动都会
// 让另一侧失效（例如去掉 table-fixed 就退回「长文本列把表格撑宽」），
// 所以在这里一并守住。
const globalsCss = readFileSync("src/styles/globals.css", "utf8");

const requestText =
  "Hello, Could you please double the monthly bandwidth and assign an IPv6 address for my VPS? Service ID: [填写你的服务ID] Invoice Number: [填写账单号] Thank you!";
const legacyEscaped =
  "**&#xA0;\\`\\`****`text " + requestText + "\u00a0`****\\`\\`**";
const legacyUnescaped =
  "**&#xA0;``****`text " + requestText + "\u00a0`****``**";

function render(source: string) {
  return cheerio.load(renderArticleContentHtml(source), null, false);
}

void test("standalone Markdown separators render as horizontal rules", () => {
  for (const separator of ["---", "-----", "***", "___", "  - - -  "]) {
    const $ = render(`前一段\n\n${separator}\n\n后一段`);
    assert.equal($("hr").length, 1, separator);
    assert.deepEqual(
      $("p")
        .map((_, node) => $(node).text())
        .get(),
      ["前一段", "后一段"],
    );
  }
});

void test("separators do not consume list items or Markdown table dividers", () => {
  const $ = render(
    "- 第一项\n\n---\n\n- 第二项\n\n| 套餐 | 价格 |\n| --- | --- |\n| A | 5 美元 |",
  );
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
  for (const source of [
    legacyEscaped,
    legacyUnescaped,
    legacyEscaped.replace("&#xA0;", "&nbsp;"),
    legacyEscaped.replace("&#xA0;", "\u00a0"),
  ]) {
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
  const message =
    "Hello,\n\nCould you please double the monthly bandwidth?\nService ID: [填写你的服务ID]\nInvoice Number: [填写账单号]\n\nThank you!";
  const $ = render("**&#xA0;\\`\\`****`text\n" + message + "`****\\`\\`**");
  assert.equal($("pre code").text().trimEnd(), message);
});

void test("a legacy-looking example inside a valid fence is not repaired", () => {
  const $ = render("````markdown\n" + legacyEscaped + "\n````");
  assert.equal($("pre code").text().trimEnd(), legacyEscaped);
});

void test("standard code fences preserve Markdown, separators, links and HTML literally", () => {
  const code =
    '---\n**literal**\n[购买](https://example.com/buy)\n<script>alert("x")</script>\n&#xA0;';
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

void test("HTML examples inside inline code are not mistaken for stored HTML", () => {
  const $ = render("示例 `<p>--- **literal**</p>` 和 `<div>content</div>`。");
  assert.deepEqual(
    $("code")
      .map((_, node) => $(node).text())
      .get(),
    ["<p>--- **literal**</p>", "<div>content</div>"],
  );
  assert.equal($("code p, code div, code strong, hr").length, 0);
});

void test("stored HTML code and horizontal rules remain HTML", () => {
  const $ = render("<pre><code>---\n**literal**\n```</code></pre><hr>");
  assert.equal($("pre code").text(), "---\n**literal**\n```");
  assert.equal($("hr").length, 1);
  assert.equal(render("<code>hello</code>")("code").text(), "hello");
});

void test("multiple-backtick spans and code within bold text render correctly", () => {
  const $ = render("运行 ``echo `Hello` && **literal**``；**复制 `ls -la`**");
  assert.equal($("code").first().text(), "echo `Hello` && **literal**");
  assert.equal($("strong code").text(), "ls -la");
  assert.equal(render("\\`不是代码\\`")("code").length, 0);
});

void test("character references decode as text outside code without becoming HTML", () => {
  const $ = render(
    "A&#xA0;B &amp; C &lt;label&gt;；`&#xA0;`；&#42;&#42;不是加粗&#42;&#42;",
  );
  assert.ok($("p").text().includes("A\u00a0B & C <label>"));
  assert.equal($("code").text(), "&#xA0;");
  assert.equal($("label, strong").length, 0);
});

void test("tables retain distinct purchase destinations and paid-link attributes", () => {
  const first = "https://merchant.example/buy/(basic)?plan=1&aff=fwqgo";
  const second = "https://merchant.example/buy?plan=2&aff=fwqgo";
  const $ = render(
    `| 套餐 | 购买 |\n| --- | --- |\n| A | [购买 A](<${first}>) |\n| B | [购买 B](${second}) |`,
  );
  assert.deepEqual(
    $("td a")
      .map((_, node) => $(node).attr("href"))
      .get(),
    [first, second],
  );
  assert.equal(
    $("td a").first().attr("rel"),
    "nofollow sponsored noopener noreferrer",
  );
  assert.equal(render("[购买](/go/test-plan)")("a").attr("rel"), "nofollow");
});

void test("wide tables expose their column count for the layout CSS", () => {
  const $ = render(
    "| 套餐 | CPU | 内存 | 地区 | 购买 |\n| --- | --- | --- | --- | --- |\n| A | 2 核 | 2 GB | 香港 | [购买](https://merchant.example/a) |",
  );

  const wrapper = $(".article-table-scroll");
  assert.equal(wrapper.length, 1);
  // 列数必须写进 CSS 自定义属性，min-width 才能按列数算出「可读下限宽度」
  assert.equal(wrapper.attr("style"), "--article-table-columns:5");
  // 表格必须留在包裹层内部，否则 overflow-x-auto 无从生效
  assert.equal(wrapper.find("table").length, 1);
});

void test("table column counts follow colspan and stop at the layout cap", () => {
  // colspan 要计入列数：3 + 1 + 1 = 5 列，按裸单元格数只有 3 列
  const spanned = render(
    '<table><tr><th colspan="3">标题</th><th>甲</th><th>乙</th></tr><tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td></tr></table>',
  );
  assert.equal(
    spanned(".article-table-scroll").attr("style"),
    "--article-table-columns:5",
  );

  // 清洗阶段会保留 colspan（4 位以内），因此超大 colspan 能一路走到这里；
  // 写入 CSS 前必须夹紧，否则 min-width 会算出天文数字拖垮整页布局
  const capped = render(
    '<table><tr><th colspan="9999">标题</th><th>甲</th><th>乙</th><th>丙</th><th>丁</th></tr><tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td></tr></table>',
  );
  assert.equal(
    capped(".article-table-scroll").attr("style"),
    "--article-table-columns:24",
  );
});

void test("tables at or below the scroll threshold stay unwrapped", () => {
  const $ = render(
    "| 套餐 | 价格 | 备注 | 购买 |\n| --- | --- | --- | --- |\n| A | 5 美元 | 有货 | [购买](https://merchant.example/a) |",
  );

  // 4 列及以下不需要滚动容器：均分宽度 + 换行已经够用，
  // 多包一层会平白给读屏用户增加一个可聚焦的 region
  assert.equal($(".article-table-scroll").length, 0);
  assert.equal($("table").length, 1);
});

void test("scroll containers size columns by width instead of by content", () => {
  const start = globalsCss.indexOf(
    ".article-prose :where(.article-table-scroll table)",
  );
  assert.ok(start > -1, "缺少 .article-table-scroll table 样式规则");
  const rule = globalsCss.slice(start, globalsCss.indexOf("}", start));

  // table-auto 会按内容撑开列宽：只要有一列是长文本，整张表就宽过正文栏，
  // 桌面端也会出现横向滚动。必须固定为 table-fixed，让列宽由表格宽度均分。
  assert.match(rule, /table-fixed/);
  assert.doesNotMatch(rule, /table-auto/);
  // 可读下限必须与列数挂钩，而不是写死一个与列数无关的值。
  // 末尾的 px 上界（= 修复前的固定值）同样必须存在：没有它，列数 ≥ 10 时
  // 列数 × 每列下限会超过 720px，反而比修复前溢出更多。
  assert.match(
    rule,
    /min-width:\s*min\(calc\(var\(--article-table-columns,\s*\d+\)\s*\*\s*[\d.]+rem\),\s*\d+px\)/,
  );
  assert.doesNotMatch(rule, /min-w-\[720px\]/);
});

void test("unsafe links and executable HTML remain blocked", () => {
  const $ = render(
    "## 正文\n\n[危险](javascript:alert%281%29)\n\n<script>alert(1)</script>",
  );
  assert.equal($("a[href], script").length, 0);
  assert.ok($.root().text().includes("正文"));
});

void test("HTML conversion retains horizontal rules and the indentation of code", () => {
  const originalCode = "  echo hello\n    echo world\n```";
  const { markdown } = htmlToArticleMarkdown(
    `<p>上文</p><hr><pre><code>${originalCode}</code></pre><p>下文</p>`,
  );
  const $ = render(markdown);
  assert.equal($("hr").length, 1);
  assert.equal($("pre code").text().trimEnd(), originalCode);
  assert.deepEqual(
    $("p")
      .map((_, node) => $(node).text())
      .get(),
    ["上文", "下文"],
  );
});

void test("HTML conversion keeps loose text and purchase links around rules", () => {
  const { markdown } = htmlToArticleMarkdown(
    '上文<hr><div>请<a href="https://merchant.example/buy?plan=1">购买</a><hr>下文</div>',
  );
  const $ = render(markdown);
  assert.equal($("hr").length, 2);
  assert.deepEqual(
    $("p")
      .map((_, node) => $(node).text())
      .get(),
    ["上文", "请购买", "下文"],
  );
  assert.equal($("a").attr("href"), "https://merchant.example/buy?plan=1");
});

void test("article images render with a caption slot and lazy loading", () => {
  const bare = render("![架构图](/uploads/arch.webp)");
  assert.equal(bare("img").length, 1);
  assert.equal(bare("img").attr("src"), "/uploads/arch.webp");
  assert.equal(bare("img").attr("alt"), "架构图");
  // 没有图注时不要多包一层空 figure。
  assert.equal(bare("figure").length, 0);
  // 拿不到真实尺寸时给出 16:9 占位，避免首屏 CLS；真实宽高由前台富化步骤补上。
  assert.equal(bare("img").attr("width"), "1200");
  assert.equal(bare("img").attr("height"), "675");
  assert.equal(bare("img").attr("data-article-image-dimensions"), "fallback");
  assert.equal(bare("img").attr("loading"), "lazy");
  assert.equal(bare("img").attr("decoding"), "async");

  const captioned = render('![架构图](/uploads/arch.webp "三节点部署拓扑")');
  assert.equal(captioned("figure img").length, 1);
  assert.equal(captioned("figcaption").text(), "三节点部署拓扑");
  // 空段落没有语义，但 `.article-prose :where(p) { my-5 }` 会给它上下各留
  // 1.25rem。figure 被浏览器解析器从 <p> 里挤出来后会留下这种空段落，
  // 每张带图注的图片两侧就会凭空多出约 40px 死空白。
  assert.equal(captioned("p").length, 0);
});

void test("only same-origin upload images survive sanitization", () => {
  for (const source of [
    "![外链](https://evil.example/a.png)",
    "![协议相对](//evil.example/a.png)",
    // 同站绝对地址也一并拒绝：remotePatterns 带 `search: ""`，带版本号的
    // 绝对地址进不了优化器，只会以原始体积直出。正文统一用相对路径。
    "![同站绝对](https://fwqgo.com/uploads/a.webp)",
    "![多余参数](/uploads/a.webp?foo=1)",
  ]) {
    assert.equal(render(source)("img").length, 0, source);
  }

  // `?v=` 是 replaceImageAssetFile 写入的内容版本号，必须放行，
  // 否则替换图片后浏览器与优化器会一直用旧字节。
  const versioned = render("![图](/uploads/a.webp?v=a1b2c3d4)");
  assert.equal(versioned("img").attr("src"), "/uploads/a.webp?v=a1b2c3d4");
});

void test("HTML conversion keeps body images and captions exactly once", () => {
  const { markdown } = contentToArticleMarkdown(
    '<p>上文</p><figure><img src="/uploads/a.webp" alt="图"><figcaption>图注</figcaption></figure><img src="/uploads/b.webp" alt="裸图">',
  );
  assert.ok(markdown.includes('![图](/uploads/a.webp "图注")'));
  assert.ok(markdown.includes("![裸图](/uploads/b.webp)"));
  assert.ok(markdown.includes("上文"));
  // 图注只能出现在图片语法里，不能再被输出成一段独立正文。
  assert.equal(markdown.split("图注").length - 1, 1);

  // 抓取路径必须继续丢弃图片，否则会把来源站的第三方图片写进正文，
  // 而渲染阶段又会把它们全部净化掉，只留下无效的 Markdown。
  const scraped = htmlToArticleMarkdown(
    '<p>上文</p><figure><img src="https://other.example/a.png" alt="图"><figcaption>图注</figcaption></figure>',
    { images: "drop" },
  );
  assert.equal(scraped.markdown.includes("!["), false);
  assert.ok(scraped.markdown.includes("上文"));
});

void test("article image parsing mirrors the builder", () => {
  const built = [
    buildArticleImageMarkdown({
      src: "/uploads/a.webp",
      alt: "架构图",
      caption: "三节点部署拓扑",
    }),
    buildArticleImageMarkdown({
      src: "/uploads/b.webp?v=a1b2c3",
      alt: "无图注",
      caption: "",
    }),
  ].join("\n\n");

  const parsed = parseArticleImages(built);
  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map(({ src, alt, caption }) => ({ src, alt, caption })),
    [
      {
        src: "/uploads/a.webp",
        alt: "架构图",
        caption: "三节点部署拓扑",
      },
      { src: "/uploads/b.webp?v=a1b2c3", alt: "无图注", caption: "" },
    ],
  );

  // 构建 → 解析 → 再构建必须完全等价，否则编辑器清单会和正文实际内容脱节。
  for (const image of parsed) {
    assert.equal(
      buildArticleImageMarkdown({
        src: image.src,
        alt: image.alt,
        caption: image.caption,
      }),
      image.raw,
    );
  }
});

void test("article image parsing ignores code examples and keeps external sources visible", () => {
  const source = [
    "```markdown",
    "![示例](/uploads/in-code.webp)",
    "```",
    "",
    "行内示例 `![行内](/uploads/inline.webp)` 结束。",
    "",
    "![外链](https://evil.example/a.png)",
    "",
    "![正文图](/uploads/body.webp)",
  ].join("\n");

  const parsed = parseArticleImages(source);
  // 代码里的图片语法不算正文图片，否则编辑器清单会出现假的缩略图。
  assert.deepEqual(
    parsed.map((image) => image.src),
    ["https://evil.example/a.png", "/uploads/body.webp"],
  );
  // 解析器按语法原样报告外链图，由调用方提示「前台会被净化掉」——
  // 静默丢弃才是真正的问题。
  assert.equal(parsed[0]?.src.startsWith("/uploads/"), false);
});
