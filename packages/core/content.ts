import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import { slugify } from "@fwqgo/core/utils";

export type ArticleDocumentBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string };

export type ArticleDocument = {
  blocks: ArticleDocumentBlock[];
  textLength: number;
  sourceHtmlLength: number;
};

const safeHrefPattern = /^(https?:|mailto:|tel:|\/|#)/i;
const markdownLinkPattern =
  /\[([^\]]+)\]\((<([^>]+)>|[^)\s]+)(?:\s+"[^"]*")?\)/g;

function getHeadingId(text: string, usedIds: Map<string, number>) {
  const baseId = slugify(text) || "section";
  const currentCount = usedIds.get(baseId) ?? 0;
  usedIds.set(baseId, currentCount + 1);

  return currentCount === 0 ? baseId : `${baseId}-${currentCount + 1}`;
}

export function normalizeArticleHtml(content: string) {
  const $ = cheerio.load(content, null, false);
  const usedIds = new Map<string, number>();

  $("h2, h3, h4, h5, h6").each((_, element) => {
    const $heading = $(element);
    const headingText = $heading.text().trim();

    if (!headingText) {
      $heading.removeAttr("id");
      return;
    }

    $heading.attr("id", getHeadingId(headingText, usedIds));
  });

  return $.html();
}

export function looksLikeHtmlContent(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isBlankLine(value: string | undefined) {
  return typeof value === "undefined" || value.trim().length === 0;
}

function isMarkdownBlockStart(value: string | undefined) {
  if (typeof value === "undefined") {
    return false;
  }

  return (
    /^#{1,6}\s+/.test(value) ||
    /^>\s?/.test(value) ||
    /^[-*+]\s+/.test(value) ||
    /^\d+[.)]\s+/.test(value) ||
    value.startsWith("```") ||
    /^\|.+\|$/.test(value.trim())
  );
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function isExternalArticleHref(href: string) {
  if (/^\/go\/[a-z0-9-]+/i.test(href)) {
    return true;
  }

  if (href.startsWith("/") && !href.startsWith("//")) {
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
  if (!safeHrefPattern.test(trimmedHref)) {
    return label;
  }

  const attrs = isExternalArticleHref(trimmedHref)
    ? ' target="_blank" rel="nofollow sponsored noopener noreferrer"'
    : "";

  return `<a href="${escapeAttribute(trimmedHref)}"${attrs}>${label}</a>`;
}

function unescapeMarkdownInlineText(value: string) {
  return value.replace(/\\([\\*_[\]\|])/g, "$1");
}

function renderMarkdownInline(value: string) {
  const links: string[] = [];
  const tokenized = value.replace(
    markdownLinkPattern,
    (_, label: string, rawHref: string, angledHref: string | undefined) => {
      const href = angledHref ?? rawHref;
      const token = `@@ARTICLE_LINK_${links.length}@@`;
      links.push(
        renderArticleLink(href, escapeHtml(unescapeMarkdownInlineText(label))),
      );
      return token;
    },
  );

  let rendered = escapeHtml(tokenized)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\\([\\*_[\]\|])/g, "$1");

  links.forEach((link, index) => {
    rendered = rendered.replace(`@@ARTICLE_LINK_${index}@@`, link);
  });

  return rendered;
}

function splitMarkdownTableRow(row: string) {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of trimmed) {
    if (char === "|" && !escaped) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
    escaped = !escaped && char === "\\";
  }

  cells.push(current);
  return cells;
}

function unescapeMarkdownTableCell(value: string) {
  return value.replace(/\\\|/g, "|");
}

function renderMarkdownTable(rows: string[]) {
  const parsedRows = rows
    .filter(
      (row, index) =>
        index !== 1 || !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(row),
    )
    .map((row) =>
      splitMarkdownTableRow(row).map((cell) =>
        renderMarkdownInline(unescapeMarkdownTableCell(cell.trim())),
      ),
    )
    .filter((row) => row.length > 0);

  if (parsedRows.length === 0) {
    return "";
  }

  const [headRow, ...bodyRows] = parsedRows;
  const head = `<thead><tr>${headRow
    ?.map((cell) => `<th>${cell}</th>`)
    .join("")}</tr></thead>`;
  const body = `<tbody>${bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;

  return `<table>${head}${body}</table>`;
}

export function markdownToArticleHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (isBlankLine(line)) {
      index += 1;
      continue;
    }

    const fenceMatch = /^```\s*([a-z0-9-]+)?\s*$/i.exec(line);
    if (fenceMatch) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      output.push(
        `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const rawLevel = headingMatch[1]?.length ?? 2;
      const level = Math.min(Math.max(rawLevel, 2), 4);
      output.push(
        `<h${level}>${renderMarkdownInline(headingMatch[2] ?? "")}</h${level}>`,
      );
      index += 1;
      continue;
    }

    if (
      /^\|.+\|$/.test(line.trim()) &&
      /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1] ?? "")
    ) {
      const tableLines: string[] = [];

      while (
        index < lines.length &&
        /^\|.+\|$/.test((lines[index] ?? "").trim())
      ) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }

      const table = renderMarkdownTable(tableLines);
      if (table) {
        output.push(table);
      }
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      output.push(
        `<blockquote>${renderMarkdownInline(quoteLines.join(" "))}</blockquote>`,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items: string[] = [];
      const itemPattern = ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/;

      while (index < lines.length && itemPattern.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(itemPattern, "").trim());
        index += 1;
      }

      const tag = ordered ? "ol" : "ul";
      output.push(
        `<${tag}>${items
          .map((item) => `<li>${renderMarkdownInline(item)}</li>`)
          .join("")}</${tag}>`,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      !isBlankLine(lines[index]) &&
      !isMarkdownBlockStart(lines[index])
    ) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }

    if (paragraphLines.length === 0) {
      paragraphLines.push(line);
      index += 1;
    }

    output.push(`<p>${renderMarkdownInline(paragraphLines.join(" "))}</p>`);
  }

  return output.join("\n");
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
    $link.attr("rel", "nofollow sponsored noopener noreferrer");
  });

  return $.html();
}

export function renderArticleContentHtml(content: string) {
  const html = looksLikeHtmlContent(content)
    ? content
    : markdownToArticleHtml(content);

  return enhanceArticleLinks(normalizeArticleHtml(html));
}

function normalizeArticleText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function markdownEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
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

function escapeMarkdownLinkDestination(href: string) {
  return href
    .trim()
    .replace(/\s/g, "%20")
    .replace(/\)/g, "%29")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
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

  blocks.push(block);
}

export function htmlToArticleDocument(content: string): ArticleDocument {
  const sourceHtmlLength = content.length;
  const $ = cheerio.load(content, null, false);
  const blocks: ArticleDocumentBlock[] = [];

  $(
    [
      "script",
      "style",
      "iframe",
      "noscript",
      "img",
      "picture",
      "source",
      "svg",
      "video",
      "audio",
      "canvas",
      "figure",
      "figcaption",
      "form",
      "button",
      "input",
      "select",
      "textarea",
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

    if (tagName === "pre") {
      pushTextBlock(blocks, {
        type: "code",
        text: $element.text().trim(),
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

    $element.children().each((_, child) => {
      visitElement(child);
    });
  };

  $.root()
    .children()
    .each((_, element) => {
      visitElement(element);
    });

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

      return length + block.text.length;
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

    if (block.type === "code") {
      append(`\`\`\`\n${block.text}\n\`\`\``);
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
  options: { maxLength?: number } = {},
) {
  const document = htmlToArticleDocument(content);
  return {
    document,
    ...articleDocumentToMarkdown(document, options),
  };
}

export function contentToArticleMarkdown(
  content: string,
  options: { maxLength?: number } = {},
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
  const markdown = truncated ? trimmed.slice(0, maxLength) : trimmed;

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
