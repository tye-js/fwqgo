import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export type ArticleNoiseCleanupResult = {
  html: string;
  removedSelectors: string[];
  removedContentPatterns: string[];
};

export type ArticleNoiseCleanupOptions = {
  sourceHost?: string | null;
};

const genericNoiseSelectors = [
  "header",
  "nav",
  "footer",
  "aside",
  "[role='navigation']",
  "[role='complementary']",
  ".breadcrumb",
  ".breadcrumbs",
  ".post-meta",
  ".entry-meta",
  ".article-meta",
  ".author-box",
  ".author-card",
  ".author-info",
  ".post-author",
  ".entry-author",
  ".share",
  ".social-share",
  ".share-buttons",
  ".comments",
  "#comments",
  ".comment-list",
  "#related",
  "#related-posts",
  "#recommended",
  "#recommendations",
  ".post-navigation",
  ".entry-navigation",
  ".pagination",
  ".related",
  ".related-post",
  ".related-posts",
  ".related-article",
  ".related-articles",
  ".related-content",
  ".related-reading",
  ".related-list",
  ".post-related",
  ".recommended",
  ".recommendation",
  ".recommendations",
  ".recommend",
  ".recommend-posts",
  ".recommend-articles",
  ".recommended-reading",
  ".more-posts",
  ".more-articles",
  ".read-more",
  ".readmore",
  ".popular-posts",
  ".latest-posts",
  ".article-nav",
  ".next-prev",
  ".article-source",
  ".source-info",
  ".source-meta",
  ".post-copyright",
  ".postcopyright",
  ".copyright",
  ".advertisement",
  ".advertising",
  ".ads",
  ".ad-wrap",
  "form",
];

const relatedHeadingPattern =
  /^(?:相关文章?|相关推荐|相关内容|相关阅读|推荐阅读|推荐文章|推荐内容|猜你喜欢|你可能还喜欢|热门文章|热门推荐|更多文章|更多内容|继续阅读|read\s+more|related\s+(?:posts?|articles?|content)|recommended(?:\s+for\s+you)?|you\s+may\s+also\s+like|more\s+from)/i;

const sourceNoticePattern =
  /^(?:(?:本文|本篇文章|该文)?(?:来源|文章来源|原文来源|原文链接|原文地址|出处|转载自|转自|发布来源|信息来源|作者|编辑|发布者|发布时间|发布日期|更新时间|最后更新|最后编辑|source|original\s+source|via)\s*[:：]|(?:本文|本篇文章)?(?:由|来自)\s*[^。！？\n]{1,80}(?:发布|整理|转载)|(?:版权所有|版权声明|免责声明|转载声明|转载请注明|未经许可))/i;

const pageNavigationPattern =
  /^(?:上一篇|下一篇|上(?:一)?篇|下(?:一)?篇|previous\s+post|next\s+post)\s*[:：]/i;

const sharingPattern =
  /^(?:分享到|分享本文|share\s+(?:this|the)\s+article)\s*[:：]?/i;

function normalizeHost(value: string | null | undefined) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/^www\./, "") ?? ""
  );
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeadingElement($: cheerio.CheerioAPI, element: AnyNode) {
  const tagName = String($(element).prop("tagName") ?? "").toLowerCase();
  return /^h[2-6]$/.test(tagName);
}

function headingLevel($: cheerio.CheerioAPI, element: AnyNode) {
  const tagName = String($(element).prop("tagName") ?? "").toLowerCase();
  return Number.parseInt(tagName.slice(1), 10);
}

function isRelatedHeading(text: string) {
  return relatedHeadingPattern.test(normalizeText(text));
}

function isSourceNotice(text: string, sourceHost: string) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length > 280) return false;
  if (sourceNoticePattern.test(normalized)) return true;

  const sourceUrlPattern = new RegExp(
    `^(?:https?:\\/\\/)?(?:www\\.)?${sourceHost.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?:[\\/#?].*)?$`,
    "i",
  );

  return Boolean(
    sourceHost &&
    normalized.toLowerCase().includes(sourceHost) &&
    (/(?:来源|原文|转载|出处|版权|链接|source|original)/i.test(normalized) ||
      sourceUrlPattern.test(normalized)),
  );
}

function removeSelectors(
  $: cheerio.CheerioAPI,
  result: ArticleNoiseCleanupResult,
) {
  for (const selector of genericNoiseSelectors) {
    const count = $(selector).length;
    if (count === 0) continue;
    result.removedSelectors.push(`${selector}:${count}`);
    $(selector).remove();
  }
}

function removeRelatedSections(
  $: cheerio.CheerioAPI,
  result: ArticleNoiseCleanupResult,
) {
  $("h2, h3, h4, h5, h6").each((_, element) => {
    const headingText = normalizeText($(element).text());
    if (!isRelatedHeading(headingText)) return;

    const level = headingLevel($, element);
    let removedSiblings = 0;
    $(element)
      .nextAll()
      .each((__, sibling) => {
        if (isHeadingElement($, sibling) && headingLevel($, sibling) <= level) {
          return false;
        }
        $(sibling).remove();
        removedSiblings += 1;
        return undefined;
      });
    $(element).remove();
    result.removedContentPatterns.push(
      `related-section:${headingText.slice(0, 80)}:${removedSiblings}`,
    );
  });
}

function removeTextNoise(
  $: cheerio.CheerioAPI,
  sourceHost: string,
  result: ArticleNoiseCleanupResult,
) {
  $("h2, h3, h4, h5, h6, p, li, blockquote, dt, dd").each((_, element) => {
    const text = normalizeText($(element).text());
    let reason: string | null = null;

    if (isSourceNotice(text, sourceHost)) {
      reason = "source-notice";
    } else if (pageNavigationPattern.test(text)) {
      reason = "page-navigation";
    } else if (sharingPattern.test(text)) {
      reason = "sharing";
    }

    if (!reason) return;
    $(element).remove();
    result.removedContentPatterns.push(`${reason}:${text.slice(0, 80)}`);
  });
}

export function cleanArticleNoise(
  html: string,
  options: ArticleNoiseCleanupOptions = {},
): ArticleNoiseCleanupResult {
  const $ = cheerio.load(html, null, false);
  const result: ArticleNoiseCleanupResult = {
    html: "",
    removedSelectors: [],
    removedContentPatterns: [],
  };
  const sourceHost = normalizeHost(options.sourceHost);

  removeSelectors($, result);
  removeRelatedSections($, result);
  removeTextNoise($, sourceHost, result);

  $("p").each((_, element) => {
    const $paragraph = $(element);
    if (
      !normalizeText($paragraph.text()) &&
      $paragraph.children().length === 0
    ) {
      $paragraph.remove();
    }
  });

  result.html = $.html();
  return result;
}
