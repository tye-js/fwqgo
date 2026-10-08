import type { Metadata } from "next";
import { load, type CheerioAPI } from "cheerio";

import { hasRenderableCover } from "@fwqgo/core/article-cover";
import { isRenderableImageSrc } from "@fwqgo/core/image-src";
import type { ArticleImageDimensions } from "./article-images";
import {
  buildOrganizationJsonLd,
  buildPublisherJsonLd,
  getSiteUrl,
} from "./site-structured-data";

type ArticleSeoImage = {
  url: string;
  alt: string;
  width?: number;
  height?: number;
};

export type ArticleSeoContent = {
  excerpt: string;
  images: ArticleSeoImage[];
};

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

/** 从已经净化的正文提取素材，复用图片尺寸索引，不新增数据库查询。 */
export function extractArticleSeoContent(
  html: string,
  dimensions: ArticleImageDimensions,
  cover?: string | null,
): ArticleSeoContent {
  const $ = load(html, null, false);
  const excerpt = extractExcerpt($);
  const candidates: Array<{ src: string; alt: string }> = [];
  const coverSrc = cover?.trim();
  if (hasRenderableCover(coverSrc)) {
    candidates.push({ src: coverSrc, alt: "" });
  }
  $("img[src]").each((_, node) => {
    const src = $(node).attr("src");
    if (src) candidates.push({ src, alt: cleanText($(node).attr("alt")) });
  });
  const images: ArticleSeoImage[] = [];
  const seen = new Set<string>();
  const origin = new URL(getSiteUrl()).origin;
  for (const { src, alt } of candidates) {
    if (!isRenderableImageSrc(src)) continue;
    const url = new URL(src, getSiteUrl());
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const size = url.origin === origin ? dimensions[url.pathname] : undefined;
    images.push({ url: url.href, alt, ...size });
    if (images.length === 4) break;
  }
  return { excerpt, images };
}

/**
 * 抽取可读的正文摘要。
 *
 * 优先用正文段落——这是唯一能保证「与文章内容相关且成句」的来源。
 * 但本站的主力内容形态是 VPS 套餐类文章，首屏往往是规格表格而正文段落很少或没有
 * （实测「只有 h2 + 表格」与「表格 + 列表」两种正文的段落数为 0）。此时若只认段落，
 * 摘要会为空，description 只能回落到标题，导致 `<meta name="description">`
 * 与 `<title>` 完全相同——而这个副标题同时会显示在页头 `<h1>` 下方。
 *
 * 因此在没有可用段落时逐级降级：
 * 1. 列表项 `<li>`：通常是「CN2 GIA 优质线路」这类完整短语，可读。
 * 2. 表格的表头行 `<th>`：只取表头，不取数据单元格——「CPU / 内存 / 带宽」
 *    是规格名，而「2 核 / 4 GB」这类值拼在一起不成句。
 *
 * 三级都取不到才返回空串，由 `buildArticleSeo` 回落到标题。
 */
function extractExcerpt($: CheerioAPI): string {
  const paragraphs = $("p")
    .filter(
      (_, node) =>
        $(node).parents("table, pre, blockquote, figure").length === 0,
    )
    .map((_, node) => cleanText($(node).text()))
    .get()
    .filter(Boolean)
    .slice(0, 3);
  if (paragraphs.length > 0) return paragraphs.join(" ");

  const listItems = $("li")
    .filter((_, node) => $(node).parents("table, pre, figure").length === 0)
    .map((_, node) => cleanText($(node).text()))
    .get()
    .filter(Boolean)
    .slice(0, 3);
  if (listItems.length > 0) return listItems.join(" ");

  const headers = $("th")
    .map((_, node) => cleanText($(node).text()))
    .get()
    .filter(Boolean)
    .slice(0, 8);
  return headers.join(" ");
}

function excerptDescription(text: string, inLanguage: "zh-CN" | "en") {
  const limit = inLanguage === "en" ? 160 : 110;
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  let excerpt = characters.slice(0, limit - 1).join("");
  if (inLanguage === "en") {
    const space = excerpt.lastIndexOf(" ");
    if (space > limit * 0.6) excerpt = excerpt.slice(0, space);
  }
  return `${excerpt.trimEnd()}…`;
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

type ArticleSeoPost = {
  title: string;
  description: string | null;
  keywords: string | null;
  createdAt: Date | string;
  updatedAt: Date | string | null;
  categoryName: string;
  tags: ReadonlyArray<{ tag: { name: string } }>;
};

/** 首屏 metadata、正文说明和 BlogPosting 使用同一份事实，保持两种语言一致。 */
export function buildArticleSeo(input: {
  inLanguage: "zh-CN" | "en";
  slug: string;
  alternateSlug?: string | null;
  categoryName?: string;
  post: ArticleSeoPost;
  content: ArticleSeoContent;
}) {
  const { post, content, inLanguage } = input;
  const english = inLanguage === "en";
  const siteUrl = getSiteUrl();
  const siteName = english ? "fwqgo" : "服务器go";
  const articleUrl = `${siteUrl}${english ? "/en" : ""}/fwq/posts/${encodeURIComponent(input.slug)}`;
  const alternateUrl = input.alternateSlug
    ? `${siteUrl}${english ? "" : "/en"}/fwq/posts/${encodeURIComponent(input.alternateSlug)}`
    : undefined;
  // 与集合页（`public-content-policy.ts` 的 articleAlternates）保持同一约定：
  // 只有中英文两侧都存在时才输出 hreflang 集合，x-default 指向中文（主语言）页。
  //
  // 早期实现在无配对时也输出 `x-default` 指向本页自己，英文侧因此产出只含自引用的
  // 集合（如 `{en: 本页, x-default: 本页}`）——等于向搜索引擎声明「英文是所有语言的
  // 兜底」，而这些文章根本没有中文版本。这类集合会被忽略或告警，损害的恰恰是
  // 最需要良好信号的内容。
  const languageAlternates = alternateUrl
    ? {
        [inLanguage]: articleUrl,
        [english ? "zh-CN" : "en"]: alternateUrl,
        "x-default": english ? alternateUrl : articleUrl,
      }
    : undefined;
  const title = cleanText(post.title);
  const description =
    cleanText(post.description) ||
    excerptDescription(content.excerpt, inLanguage) ||
    title;
  const publishedTime = isoDate(post.createdAt);
  const updatedTime = isoDate(post.updatedAt);
  // 历史导入数据可能出现更新时间早于创建时间，不能输出自相矛盾的日期或使用当前时间兜底。
  const modifiedTime =
    updatedTime && (!publishedTime || updatedTime >= publishedTime)
      ? updatedTime
      : publishedTime;
  const section = cleanText(input.categoryName ?? post.categoryName);
  const tags = [
    ...new Set(post.tags.map(({ tag }) => cleanText(tag.name)).filter(Boolean)),
  ];
  const keywordText = cleanText(post.keywords);
  const keywords = [
    ...new Set(
      (keywordText ? keywordText.split(/[,，;；]+/) : tags)
        .map(cleanText)
        .filter(Boolean),
    ),
  ];
  const images = content.images.map((image) => ({
    ...image,
    alt: image.alt || title,
  }));
  const authorUrl = `${siteUrl}${english ? "/en" : ""}/about`;
  const metadata: Metadata = {
    title: `${title} - ${siteName}`,
    description,
    keywords: keywords.length ? keywords : undefined,
    authors: [{ name: siteName, url: authorUrl }],
    robots: { index: true, follow: true, "max-image-preview": "large" },
    alternates: {
      canonical: articleUrl,
      languages: languageAlternates,
    },
    openGraph: {
      type: "article",
      title: `${title} - ${siteName}`,
      description,
      url: articleUrl,
      siteName,
      locale: english ? "en_US" : "zh_CN",
      alternateLocale: alternateUrl ? [english ? "zh_CN" : "en_US"] : undefined,
      publishedTime,
      modifiedTime,
      authors: [authorUrl],
      section: section || undefined,
      tags,
      images: images.length ? images : undefined,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: `${title} - ${siteName}`,
      description,
      images: images.length
        ? images.map(({ url, alt }) => ({ url, alt }))
        : undefined,
    },
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${articleUrl}#article`,
    url: articleUrl,
    headline: title,
    description,
    inLanguage,
    datePublished: publishedTime,
    dateModified: modifiedTime,
    articleSection: section || undefined,
    keywords: keywords.length ? keywords : undefined,
    image: images.length
      ? images.map(({ url, width, height, alt }) => ({
          "@type": "ImageObject",
          url,
          contentUrl: url,
          width,
          height,
          description: alt,
        }))
      : undefined,
    author: buildOrganizationJsonLd({ name: siteName }),
    publisher: buildPublisherJsonLd({ name: siteName }),
    mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    isPartOf: { "@id": `${siteUrl}/#website` },
  };
  return {
    metadata,
    jsonLd,
    articleUrl,
    description,
    publishedTime,
    modifiedTime,
  };
}
