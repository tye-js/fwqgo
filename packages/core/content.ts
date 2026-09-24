import * as cheerio from "cheerio";
import { Marked } from "marked";
import { isTag, isText, type AnyNode, type Element } from "domhandler";

import { isOutboundShortLinkHref, slugify } from "@fwqgo/core/utils";
import {
  buildArticleImageMarkdown,
  escapeMarkdownLinkDestination,
  markdownEscape,
} from "@fwqgo/core/article-image-syntax";

export type ArticleDocumentBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "image"; src: string; alt: string; caption: string }
  | { type: "thematic-break" };

/**
 * `images: "drop"` 保留抓取路径的既有行为：不把来源站的第三方图片写进正文。
 * 编辑、改写与英文翻译路径必须用 `"keep"`，否则正文里的图片会在
 * `contentToArticleMarkdown` 这一步被静默吃掉。
 */
export type ArticleDocumentOptions = {
  images?: "keep" | "drop";
};

export type ArticleDocument = {
  blocks: ArticleDocumentBlock[];
  textLength: number;
  sourceHtmlLength: number;
};

const safeHrefPattern = /^(https?:|mailto:|tel:|\/|#)/i;
const markdownLinkPattern =
  /\[([^\]]+)\]\((<([^>]+)>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
const dangerousArticleTags = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "svg",
  "math",
  "canvas",
]);
const allowedArticleTags = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "figcaption",
  "figure",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);
const articleBlockTags =
  "address,article,aside,blockquote,div,dl,fieldset,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,ol,p,pre,section,table,ul";

function getHeadingId(text: string, usedIds: Map<string, number>) {
  const baseId = slugify(text) || "section";
  const currentCount = usedIds.get(baseId) ?? 0;
  usedIds.set(baseId, currentCount + 1);

  return currentCount === 0 ? baseId : `${baseId}-${currentCount + 1}`;
}

export function normalizeArticleHtml(content: string) {
  const $ = cheerio.load(content, null, false);
  const usedIds = new Map<string, number>();
  let previousHeadingLevel = 1;

  $("h2, h3, h4, h5, h6").each((_, element) => {
    const $heading = $(element);
    const headingText = $heading.text().trim();
    const rawHeadingLevel = Number(element.name.slice(1));
    const headingLevel = Math.min(rawHeadingLevel, previousHeadingLevel + 1);
    if (headingLevel !== rawHeadingLevel) {
      element.name = `h${headingLevel}`;
    }
    previousHeadingLevel = headingLevel;

    if (!headingText) {
      $heading.removeAttr("id");
      return;
    }

    $heading.attr("id", getHeadingId(headingText, usedIds));
  });

  return $.html();
}

function isSafeArticleHref(href: string) {
  const trimmedHref = href.trim();

  if (!trimmedHref || /[\u0000-\u001f\u007f]/.test(trimmedHref)) {
    return false;
  }

  if (trimmedHref.startsWith("#")) {
    return true;
  }

  if (
    trimmedHref.startsWith("/") &&
    !trimmedHref.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(trimmedHref)
  ) {
    return true;
  }

  try {
    const parsed = new URL(
      trimmedHref.startsWith("//") ? `https:${trimmedHref}` : trimmedHref,
    );

    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * 正文图片只接受站内上传资源。
 *
 * 第三方 http(s) 图片一律丢弃，原因是它们无法进入图片优化器：
 * `apps/web/next.config.js` 的 `images.remotePatterns` 只放行
 * `fwqgo.com/uploads/**`，外链图只能以原始体积直出。这正是
 * 2026-09-04 那次「封面绕过优化器」事故的同类形态——当时 724px 的槽位
 * 下载了 169 KB 全尺寸图（见 `scripts/verify-public-images.ts` 开头）。
 * 外链图还额外带来热链失效与跨站追踪，收益远小于代价。
 */
function isSafeArticleImageSrc(src: string) {
  const trimmedSrc = src.trim();

  if (!trimmedSrc || /[\u0000-\u001f\u007f]/.test(trimmedSrc)) {
    return false;
  }

  // `//host/path` 是协议相对 URL，不是站内路径。
  if (!trimmedSrc.startsWith("/uploads/") || trimmedSrc.startsWith("//")) {
    return false;
  }

  const queryIndex = trimmedSrc.indexOf("?");
  if (queryIndex === -1) {
    return true;
  }

  // 查询串只承载内容版本号。`replaceImageAssetFile` 会给被替换图片的引用
  // 写入 `?v=<内容哈希>`，用于击穿浏览器与优化器的长期缓存；其余参数
  // 没有任何用途，出现即视为不可信。
  return /^\?v=[A-Za-z0-9._-]+$/.test(trimmedSrc.slice(queryIndex));
}

function cleanShortTextAttribute(value: string | undefined) {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

function cleanPositiveIntegerAttribute(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d{1,4}$/.test(trimmed)) return null;

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

function sanitizeArticleHtml(content: string) {
  const $ = cheerio.load(content, null, false);

  [...dangerousArticleTags].forEach((tag) => {
    $(tag).remove();
  });

  $("*").each((_, node) => {
    const element = node as Element;
    const $element = $(element);
    const tagName = String($element.prop("tagName") ?? "").toLowerCase();

    if (!allowedArticleTags.has(tagName)) {
      $element.replaceWith($element.contents());
      return;
    }

    const attrs: Record<string, string> = { ...(element.attribs ?? {}) };
    Object.keys(attrs).forEach((name) => {
      $element.removeAttr(name);
    });

    if (tagName === "a") {
      const href = attrs.href?.trim();
      if (href && isSafeArticleHref(href)) {
        $element.attr("href", href);
      }

      const title = cleanShortTextAttribute(attrs.title);
      if (title) {
        $element.attr("title", title);
      }
      return;
    }

    if (tagName === "img") {
      const src = attrs.src?.trim();
      if (src && isSafeArticleImageSrc(src)) {
        $element.attr("src", src);
      } else {
        $element.remove();
        return;
      }

      const alt = cleanShortTextAttribute(attrs.alt);
      if (alt) {
        $element.attr("alt", alt);
      }

      const width = cleanPositiveIntegerAttribute(attrs.width);
      const height = cleanPositiveIntegerAttribute(attrs.height);
      if (width && height) {
        $element.attr("width", width);
        $element.attr("height", height);
      } else {
        // Keep images without source dimensions from expanding the document
        // after the first paint. A later publish-time pipeline can replace
        // this conservative 16:9 fallback with the real dimensions.
        $element.attr("width", "1200");
        $element.attr("height", "675");
        $element.attr("data-article-image-dimensions", "fallback");
      }
      $element.attr("loading", "lazy");
      $element.attr("decoding", "async");
      return;
    }

    if (tagName === "td" || tagName === "th") {
      const colspan = cleanPositiveIntegerAttribute(attrs.colspan);
      const rowspan = cleanPositiveIntegerAttribute(attrs.rowspan);
      if (colspan) $element.attr("colspan", colspan);
      if (rowspan) $element.attr("rowspan", rowspan);
    }
  });

  // Browser parsers repair invalid phrasing/block nesting before React can
  // hydrate it. Normalize the common cases in the same Cheerio pass.
  $("p").each((_, element) => {
    const $paragraph = $(element);
    if ($paragraph.find(articleBlockTags).length > 0) {
      $paragraph.replaceWith($paragraph.contents());
    }
  });

  // `figure` 不是合法的 `<p>` 子元素，浏览器解析器会把它挤出来并在原位留下
  // 一个空段落。空段落本身没有语义，但 `.article-prose :where(p) { my-5 }`
  // 会给它上下各留 1.25rem，于是每张带图注的图片两侧凭空多出约 40px 死空白。
  $("p").each((_, element) => {
    const $paragraph = $(element);
    if (!$paragraph.text().trim() && $paragraph.children().length === 0) {
      $paragraph.remove();
    }
  });

  $("a a").each((_, element) => {
    $(element).replaceWith($(element).contents());
  });

  $("h1, h2, h3, h4, h5, h6").each((_, element) => {
    $(element)
      .find("h1, h2, h3, h4, h5, h6")
      .each((__, nestedHeading) => {
        $(nestedHeading).replaceWith($(nestedHeading).contents());
      });
  });

  return $.html();
}

export function looksLikeHtmlContent(value: string) {
  if (
    !/<(?:article|section|div|p|h[1-6]|blockquote|pre|code|hr|table|thead|tbody|tfoot|tr|td|th|ul|ol|li)\b/i.test(
      value,
    )
  ) {
    return false;
  }

  // Tokenization keeps Markdown examples inside HTML <pre> blocks literal,
  // and recognizes fenced HTML examples as Markdown rather than live HTML.
  let hasMarkdown = false;
  void articleMarkdown.walkTokens(articleMarkdown.lexer(value), (token) => {
    if (
      [
        "heading",
        "blockquote",
        "list",
        "code",
        "codespan",
        "escape",
        "hr",
        "table",
        "strong",
        "em",
        "link",
      ].includes(token.type)
    ) {
      hasMarkdown = true;
    }
  });
  return !hasMarkdown;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function isExternalArticleHref(href: string) {
  if (/^\/go\/[a-z0-9-]+/i.test(href)) {
    return true;
  }

  if (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(href)
  ) {
    return false;
  }

  try {
    const parsed = new URL(href.startsWith("//") ? `https:${href}` : href);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function renderArticleLink(href: string, label: string) {
  const trimmedHref = href.trim();
  if (!isSafeArticleHref(trimmedHref)) {
    return label;
  }

  const attrs = isExternalArticleHref(trimmedHref)
    ? ` target="_blank" rel="${isOutboundShortLinkHref(trimmedHref) ? "nofollow" : "nofollow sponsored noopener noreferrer"}"`
    : "";

  return `<a href="${escapeAttribute(trimmedHref)}"${attrs}>${label}</a>`;
}

// Some imported rich-text content split a fenced block into three bold spans:
// **&#xA0;\`\`****`text ...`****\`\`**. Recognize only this block shape;
// standard fenced code is tokenized separately and its contents stay literal.
const legacyCodeFenceStart =
  /^ {0,3}\*\*(?:[ \t\u00a0]|&nbsp;|&#0*160;|&#x0*a0;)*(?:\\?`){2}\*\*[ \t]*\*\*`/im;
const legacyCodeFence =
  /^ {0,3}\*\*(?:[ \t\u00a0]|&nbsp;|&#0*160;|&#x0*a0;)*(?:\\?`){2}\*\*[ \t]*\*\*`([\s\S]*?)`\*\*[ \t]*\*\*(?:\\?`){2}\*\*[ \t]*(?:\n|$)/i;
const legacyCodeLanguage =
  /^(text|txt|plaintext|bash|sh|shell|console|powershell|json|yaml|yml|ini|toml|conf|nginx|javascript|js|typescript|ts|html|css|python|py|sql)(?:[ \t]+|\n)([\s\S]*)$/i;

const articleMarkdown = new Marked({
  gfm: true,
  async: false,
  extensions: [
    {
      name: "legacyArticleCodeFence",
      level: "block",
      start(source) {
        return legacyCodeFenceStart.exec(source)?.index;
      },
      tokenizer(source) {
        const match = legacyCodeFence.exec(source);
        if (!match) return undefined;
        const content = match[1] ?? "";
        const language = legacyCodeLanguage.exec(content);
        return {
          type: "code",
          raw: match[0],
          text: language?.[2] ?? content,
          lang: language?.[1],
        };
      },
    },
  ],
  renderer: {
    heading({ depth, tokens }) {
      const level = Math.min(Math.max(depth, 2), 4);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    link({ href, tokens }) {
      return renderArticleLink(href, this.parser.parseInline(tokens));
    },
    image({ href, title, text }) {
      const src = href?.trim() ?? "";
      // 没有 src 的图片没有任何意义，净化阶段也会把它丢掉。
      if (!src) return "";

      const image = `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(
        text ?? "",
      )}">`;

      // `![alt](url "图注")` 的 title 槽位承载图注。选它是因为它是 Markdown
      // 里唯一与图片天然相邻、可承载纯文本的位置：marked 原生解析，正文
      // 仍然是单行，不需要引入自定义指令语法。净化阶段会把 figure 与
      // figcaption 和 img 一起保留；没有图注时保持裸 img，避免每张图都
      // 多包一层空 figure。
      return title
        ? `<figure>${image}<figcaption>${escapeHtml(title)}</figcaption></figure>`
        : image;
    },
    html({ text }) {
      // Retain the existing Markdown contract: literal HTML examples do not
      // become executable markup. Stored HTML follows the sanitizer path.
      return escapeHtml(text);
    },
  },
});

export function markdownToArticleHtml(markdown: string) {
  return articleMarkdown.parse(markdown.replace(/\r\n?/g, "\n"), {
    async: false,
  });
}

export function enhanceArticleLinks(html: string) {
  const $ = cheerio.load(html, null, false);

  $("a[href]").each((_, element) => {
    const $link = $(element);
    const href = $link.attr("href")?.trim();

    if (!href || !safeHrefPattern.test(href) || !isExternalArticleHref(href)) {
      return;
    }

    $link.attr("target", "_blank");
    $link.attr(
      "rel",
      isOutboundShortLinkHref(href)
        ? "nofollow"
        : "nofollow sponsored noopener noreferrer",
    );
  });

  return $.html();
}

/**
 * 超过该列数的表格会被包进 `.article-table-scroll`，从而允许横向滚动。
 *
 * 列数少时表格可以用 `table-fixed` 均分宽度、靠换行容纳内容；列数一多，
 * 均分会让每列窄到逐字换行，此时宁可让用户横向滚动。
 */
const ARTICLE_TABLE_SCROLL_COLUMN_THRESHOLD = 4;

/**
 * 写入 `--article-table-columns` 的列数上限。
 *
 * `colspan` 会在 `sanitizeArticleHtml` 中被保留，所以 `colspan="9999"`
 * 这类内容能一路走到这里。真正兜住布局的是样式表里的
 * `min-width: min(calc(var(--article-table-columns) * 5rem), 720px)`，
 * 这里再夹一道只是让写进 DOM 的属性值本身保持合理（避免出现 `--article-table-columns:9999`
 * 这种明显失真的值），并让列数语义与真实列数保持可信。
 */
const ARTICLE_TABLE_LAYOUT_COLUMN_CAP = 24;

function enhanceArticleTables(html: string) {
  const $ = cheerio.load(html, null, false);

  $("table").each((_, element) => {
    const $table = $(element);
    let maxColumns = 0;

    $table.find("tr").each((__, row) => {
      const columns = $(row)
        .children("th, td")
        .toArray()
        .reduce((total, cell) => {
          const colspan = Number.parseInt($(cell).attr("colspan") ?? "1", 10);
          return (
            total + (Number.isFinite(colspan) && colspan > 0 ? colspan : 1)
          );
        }, 0);
      maxColumns = Math.max(maxColumns, columns);
    });

    if (maxColumns > ARTICLE_TABLE_SCROLL_COLUMN_THRESHOLD) {
      // 把列数交给样式表：`.article-table-scroll table` 用它算出「可读下限宽度」，
      // 列宽因此由表格宽度均分（table-fixed）而不是按内容撑开。若仍用 table-auto，
      // 任一长文本列都会把整张表推宽，在桌面端也会强制横向滚动。
      // 这里写入的只是服务端解析出的整数，不含任何来自文章内容的字符串。
      const layoutColumns = Math.min(
        maxColumns,
        ARTICLE_TABLE_LAYOUT_COLUMN_CAP,
      );
      $table.wrap(
        `<div class="article-table-scroll" role="region" aria-label="Data table" tabindex="0" style="--article-table-columns:${layoutColumns}"></div>`,
      );
    }
  });

  return $.html();
}

export function renderArticleContentHtml(content: string) {
  const html = looksLikeHtmlContent(content)
    ? content
    : markdownToArticleHtml(content);

  return enhanceArticleTables(
    enhanceArticleLinks(normalizeArticleHtml(sanitizeArticleHtml(html))),
  );
}

function normalizeArticleText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function markdownEscapePreservingLinks(
  value: string,
  escapeText: (text: string) => string = markdownEscape,
  transformLink: (link: string) => string = (link) => link,
) {
  let result = "";
  let lastIndex = 0;

  for (const match of value.matchAll(markdownLinkPattern)) {
    const original = match[0];
    if (typeof match.index !== "number") {
      continue;
    }

    result += escapeText(value.slice(lastIndex, match.index));
    result += transformLink(original);
    lastIndex = match.index + original.length;
  }

  result += escapeText(value.slice(lastIndex));
  return result;
}

function markdownTableCellEscape(value: string) {
  return markdownEscapePreservingLinks(
    value.replace(/\r?\n/g, " "),
    (text) => markdownEscape(text).replace(/\|/g, "\\|"),
    (link) => link.replace(/\|/g, "\\|"),
  );
}

function createMarkdownLink(label: string, href: string | undefined) {
  const normalizedLabel = normalizeArticleText(label);
  const normalizedHref = href?.trim();

  if (!normalizedLabel) {
    return "";
  }

  if (!normalizedHref || !safeHrefPattern.test(normalizedHref)) {
    return normalizedLabel;
  }

  return `[${markdownEscape(normalizedLabel)}](${escapeMarkdownLinkDestination(
    normalizedHref,
  )})`;
}

function htmlImageToMarkdown(
  $image: cheerio.Cheerio<Element>,
  caption: string,
) {
  const src = $image.attr("src")?.trim();
  if (!src) return "";

  return buildArticleImageMarkdown({
    src,
    alt: normalizeArticleText($image.attr("alt") ?? ""),
    // 图注优先取 figcaption；裸 img 只有 title 可用。两者必须能互相还原：
    // 图片语法的 title 槽位渲染出来就是 figcaption。
    caption: caption || normalizeArticleText($image.attr("title") ?? ""),
  });
}

function htmlFragmentToMarkdownText($: cheerio.CheerioAPI, element: Element) {
  const $clone = $(element).clone();

  $clone.find("a").each((_, anchor) => {
    const $anchor = $(anchor);
    const text = normalizeArticleText($anchor.text());
    const href = $anchor.attr("href")?.trim();

    if (!text) {
      $anchor.remove();
      return;
    }

    $anchor.replaceWith(createMarkdownLink(text, href));
  });

  // figure 必须先于裸 img 处理：先把整块（图片 + 图注）换成图片语法，
  // 否则内层 img 会被后面的 img 处理先消费掉，图注就丢了。
  $clone.find("figure").each((_, figure) => {
    const $figure = $(figure);
    const $image = $figure.find("img").first();
    const markdown = $image.length
      ? htmlImageToMarkdown(
          $image,
          normalizeArticleText($figure.find("figcaption").first().text()),
        )
      : "";

    // 没有图片的 figure 只保留其中的文字，不做静默丢弃。
    $figure.replaceWith(markdown || normalizeArticleText($figure.text()));
  });

  // 行内图片：`<p>文字 <img> 文字</p>` 里的图片会被 text() 直接抹掉，
  // 这里换成图片语法，正文与图片都不丢。
  $clone.find("img").each((_, image) => {
    $(image).replaceWith(htmlImageToMarkdown($(image), ""));
  });

  $clone.find("br").replaceWith("\n");

  return normalizeArticleText($clone.text());
}

function pushTextBlock(
  blocks: ArticleDocumentBlock[],
  block: ArticleDocumentBlock,
) {
  if ("text" in block && !block.text) {
    return;
  }

  if (block.type === "list" && block.items.length === 0) {
    return;
  }

  if (block.type === "table" && block.rows.length === 0) {
    return;
  }

  if (block.type === "image" && !block.src) {
    return;
  }

  blocks.push(block);
}

export function htmlToArticleDocument(
  content: string,
  options: ArticleDocumentOptions = {},
): ArticleDocument {
  const sourceHtmlLength = content.length;
  const $ = cheerio.load(content, null, false);
  const blocks: ArticleDocumentBlock[] = [];
  const keepImages = options.images !== "drop";

  $(
    [
      "script",
      "style",
      "iframe",
      "noscript",
      "source",
      "svg",
      "video",
      "audio",
      "canvas",
      "form",
      "button",
      "input",
      "select",
      "textarea",
      // 图片相关标签只在「丢弃图片」模式下整体移除。保留模式下交给
      // visitElement 转成 Markdown 图片语法（figure 的图注一并带走）。
      ...(keepImages ? [] : ["img", "picture", "figure", "figcaption"]),
    ].join(","),
  ).remove();

  const visited = new Set<Element>();

  const visitElement = (element: Element) => {
    if (visited.has(element)) {
      return;
    }
    visited.add(element);

    const $element = $(element);
    const tagName = String($element.prop("tagName") ?? "").toLowerCase();

    if (/^h[1-6]$/.test(tagName)) {
      const rawLevel = Number(tagName.slice(1));
      const level = Math.min(Math.max(rawLevel, 2), 4) as 2 | 3 | 4;
      pushTextBlock(blocks, {
        type: "heading",
        level,
        text: normalizeArticleText($element.text()),
      });
      return;
    }

    if (tagName === "p") {
      pushTextBlock(blocks, {
        type: "paragraph",
        text: htmlFragmentToMarkdownText($, element),
      });
      return;
    }

    if (tagName === "blockquote") {
      pushTextBlock(blocks, {
        type: "quote",
        text: htmlFragmentToMarkdownText($, element),
      });
      return;
    }

    if (tagName === "hr") {
      pushTextBlock(blocks, { type: "thematic-break" });
      return;
    }

    if (tagName === "figure") {
      const imageElement = $element.find("img").get(0);
      const src = imageElement ? $(imageElement).attr("src")?.trim() : "";

      if (imageElement && src) {
        const captionElement = $element.find("figcaption").get(0);
        pushTextBlock(blocks, {
          type: "image",
          src,
          alt: normalizeArticleText($(imageElement).attr("alt") ?? ""),
          caption: captionElement
            ? normalizeArticleText($(captionElement).text())
            : normalizeArticleText($(imageElement).attr("title") ?? ""),
        });
        // 消费掉的图片与图注直接从 DOM 移除。只标记 visited 不够：visitNodes
        // 会把非块级节点当行内内容拼接，而 figcaption 不在 articleBlockTags 里，
        // 于是图注会被再输出成一段独立段落。
        $(imageElement).remove();
        if (captionElement) $(captionElement).remove();
        visitNodes($element.contents().toArray());
        return;
      }
    }

    if (tagName === "img") {
      const src = $element.attr("src")?.trim();
      if (src) {
        pushTextBlock(blocks, {
          type: "image",
          src,
          alt: normalizeArticleText($element.attr("alt") ?? ""),
          caption: normalizeArticleText($element.attr("title") ?? ""),
        });
      }
      return;
    }

    if (tagName === "pre") {
      pushTextBlock(blocks, {
        type: "code",
        text: $element.text().replace(/\r\n?/g, "\n"),
      });
      return;
    }

    if (tagName === "ul" || tagName === "ol") {
      const items = $element
        .children("li")
        .toArray()
        .map((item) => htmlFragmentToMarkdownText($, item))
        .filter(Boolean);
      pushTextBlock(blocks, {
        type: "list",
        ordered: tagName === "ol",
        items,
      });
      return;
    }

    if (tagName === "table") {
      const rows = $element
        .find("tr")
        .toArray()
        .map((row) =>
          $(row)
            .children("th,td")
            .toArray()
            .map((cell) => htmlFragmentToMarkdownText($, cell)),
        )
        .filter((row) => row.some(Boolean));
      pushTextBlock(blocks, { type: "table", rows });
      return;
    }

    visitNodes($element.contents().toArray());
  };

  // Keep loose text and inline links around an <hr> in their original order.
  // Without this, recognizing the rule would suppress the old text fallback.
  const visitNodes = (nodes: AnyNode[]) => {
    let inlineHtml = "";
    const flushInline = () => {
      if (!inlineHtml) return;
      const wrapper = $("<span></span>").html(inlineHtml).get(0);
      if (wrapper && isTag(wrapper))
        pushTextBlock(blocks, {
          type: "paragraph",
          text: htmlFragmentToMarkdownText($, wrapper),
        });
      inlineHtml = "";
    };
    for (const node of nodes) {
      if (isText(node)) {
        inlineHtml += $.html(node);
      } else if (isTag(node)) {
        const element = $(node);
        if (
          // 顶层裸 img 必须当块处理：作为行内内容拼接时，它会被
          // htmlFragmentToMarkdownText 的 text() 抹掉，图片整个消失。
          node.name === "img" ||
          element.is(articleBlockTags) ||
          element.find(articleBlockTags).length > 0
        ) {
          flushInline();
          visitElement(node);
        } else {
          inlineHtml += $.html(node);
        }
      }
    }
    flushInline();
  };

  visitNodes($.root().contents().toArray());

  if (blocks.length === 0) {
    const fallbackText = normalizeArticleText($.root().text());
    if (fallbackText) {
      blocks.push({ type: "paragraph", text: fallbackText });
    }
  }

  return {
    blocks,
    sourceHtmlLength,
    textLength: blocks.reduce((length, block) => {
      if (block.type === "list") {
        return length + block.items.join(" ").length;
      }

      if (block.type === "table") {
        return length + block.rows.flat().join(" ").length;
      }

      return length + ("text" in block ? block.text.length : 0);
    }, 0),
  };
}

function tableToMarkdown(rows: string[][]) {
  if (rows.length === 0) {
    return "";
  }

  const maxColumns = Math.max(...rows.map((row) => row.length));
  if (maxColumns === 0) {
    return "";
  }

  const normalizedRows = rows.map((row) =>
    Array.from({ length: maxColumns }, (_, index) =>
      markdownTableCellEscape(row[index] ?? ""),
    ),
  );
  const [firstRow, ...bodyRows] = normalizedRows;

  if (!firstRow) {
    return "";
  }

  return [
    `| ${firstRow.join(" | ")} |`,
    `| ${Array.from({ length: maxColumns }, () => "---").join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function truncateMarkdownBlock(value: string, maxLength: number) {
  if (!Number.isFinite(maxLength) || value.length <= maxLength) {
    return value;
  }

  const limit = Math.max(0, Math.floor(maxLength));
  if (limit === 0) {
    return "";
  }

  const sliced = value.slice(0, limit);
  const lastLineBreak = sliced.lastIndexOf("\n");

  return (
    lastLineBreak > 0 ? sliced.slice(0, lastLineBreak) : sliced
  ).trimEnd();
}

export function articleDocumentToMarkdown(
  document: ArticleDocument,
  options: { maxLength?: number } = {},
) {
  const maxLength = options.maxLength ?? Infinity;
  const output: string[] = [];
  let length = 0;
  let truncated = false;

  const append = (value: string) => {
    const block = value.trim();

    if (!block) {
      return;
    }

    const separatorLength = output.length > 0 ? 2 : 0;
    const nextLength = length + block.length + separatorLength;
    if (nextLength > maxLength) {
      truncated = true;
      const remaining = maxLength - length - separatorLength;
      const partialBlock = truncateMarkdownBlock(block, remaining);

      if (partialBlock) {
        output.push(partialBlock);
        length += partialBlock.length + separatorLength;
      }

      return;
    }

    output.push(block);
    length = nextLength;
  };

  for (const block of document.blocks) {
    if (truncated) {
      break;
    }

    if (block.type === "heading") {
      append(`${"#".repeat(block.level)} ${markdownEscape(block.text)}`);
      continue;
    }

    if (block.type === "paragraph") {
      append(markdownEscapePreservingLinks(block.text));
      continue;
    }

    if (block.type === "quote") {
      append(`> ${markdownEscapePreservingLinks(block.text)}`);
      continue;
    }

    if (block.type === "thematic-break") {
      append("---");
      continue;
    }

    if (block.type === "image") {
      append(buildArticleImageMarkdown(block));
      continue;
    }

    if (block.type === "code") {
      // A longer fence keeps embedded backticks from terminating the block.
      const longestRun = [...block.text.matchAll(/`+/g)].reduce(
        (length, match) => Math.max(length, match[0].length),
        2,
      );
      const fence = "`".repeat(longestRun + 1);
      append(
        `${fence}\n${block.text}${block.text.endsWith("\n") ? "" : "\n"}${fence}`,
      );
      continue;
    }

    if (block.type === "list") {
      append(
        block.items
          .map((item, index) =>
            block.ordered
              ? `${index + 1}. ${markdownEscapePreservingLinks(item)}`
              : `- ${markdownEscapePreservingLinks(item)}`,
          )
          .join("\n"),
      );
      continue;
    }

    append(tableToMarkdown(block.rows));
  }

  return {
    markdown: output.join("\n\n"),
    truncated,
    length,
  };
}

export function htmlToArticleMarkdown(
  content: string,
  options: { maxLength?: number } & ArticleDocumentOptions = {},
) {
  const document = htmlToArticleDocument(content, options);
  return {
    document,
    ...articleDocumentToMarkdown(document, options),
  };
}

export function contentToArticleMarkdown(
  content: string,
  options: { maxLength?: number } & ArticleDocumentOptions = {},
) {
  const trimmed = content.trim();

  if (!trimmed) {
    return {
      document: {
        blocks: [],
        sourceHtmlLength: 0,
        textLength: 0,
      } satisfies ArticleDocument,
      markdown: "",
      truncated: false,
      length: 0,
    };
  }

  if (looksLikeHtmlContent(trimmed)) {
    return htmlToArticleMarkdown(trimmed, options);
  }

  const maxLength = options.maxLength ?? Infinity;
  const truncated = trimmed.length > maxLength;
  const markdown = truncated ? trimmed.slice(0, maxLength).trimEnd() : trimmed;

  return {
    document: {
      blocks: [{ type: "paragraph", text: markdown }],
      sourceHtmlLength: 0,
      textLength: markdown.length,
    } satisfies ArticleDocument,
    markdown,
    truncated,
    length: markdown.length,
  };
}
