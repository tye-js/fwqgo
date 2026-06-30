import * as cheerio from "cheerio";
import puppeteer, { type Browser } from "puppeteer";

import { normalizeArticleHtml } from "@/lib/content";
import RewriteArticle from "@/langchain/rewrite-article";
import {
  mergeAffiliateReports,
  rewriteAffiliateLinks,
  type AffiliateRewriteReport,
} from "@/server/scrape/affiliate-link-rewriter";

export interface ScrapeDiagnostics {
  sourceHost: string;
  strategy: string;
  usedPuppeteer: boolean;
  usedFallback: boolean;
  usedAiRewrite: boolean;
  contentLength: number;
  scrapedTitle?: string;
  scrapedDescription?: string;
  cleanedHtmlLength?: number;
  aiInputLength?: number;
  rewriteOutputLength?: number;
  aiInputTruncated?: boolean;
  removedSelectors: string[];
  affiliateReport: AffiliateRewriteReport;
  warnings: string[];
  aiRewriteError?: string;
}

export interface ScrapedArticle {
  title: string;
  content: string;
  description: string;
  htmlContent: string;
  keywords: string[];
  recommendTagName: string;
  tagsName: string[];
  diagnostics: ScrapeDiagnostics;
}

type SiteRule = {
  host: string;
  strategy: string;
  usePuppeteer?: boolean;
  titleSelector: string;
  contentSelector: string;
  descriptionSelector?: string;
  tagSelector?: string;
  removeSelectors?: string[];
  linkSelector?: string;
  removeInternalLinks?: boolean;
  resolveRedirectPattern?: RegExp;
};

const internalRedirectPathPattern =
  /^\/(?:go|goto|out|link|links|redirect|refer|to)(?:\/|$)/i;

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};
const FETCH_TIMEOUT_MS = 15_000;
const MAX_AI_INPUT_HTML_LENGTH = 20_000;

const commonRemoveSelectors = [
  "script",
  "style",
  "iframe",
  "noscript",
  "img",
  ".wp-block-image",
  ".orbui",
  ".lwptoc",
  "#toc_container",
  ".htoc",
  ".postcopyright",
];

const invisibleTextPattern =
  /[\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ue000-\uf8ff\ufeff]/g;
const whitespacePattern = /[ \t\f\v\u00a0]+/g;
const allowedAiInputTags = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);
const removeForAiSelectors = [
  "img",
  "picture",
  "source",
  "svg",
  "video",
  "audio",
  "canvas",
  "figure",
  "figcaption",
  "script",
  "style",
  "iframe",
  "noscript",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  ".wp-block-image",
  ".gallery",
  ".aligncenter",
  ".alignleft",
  ".alignright",
  ".wp-caption",
];

const siteRules: SiteRule[] = [
  {
    host: "laoliublog.cn",
    strategy: "laoliu",
    titleSelector: "h1",
    contentSelector: ".content",
    tagSelector: ".article-categories a",
    removeSelectors: ["footer"],
  },
  {
    host: "zhujiceping.com",
    strategy: "zhujiceping",
    titleSelector: "h1",
    contentSelector: ".article-content",
    removeInternalLinks: true,
  },
  {
    host: "walixz.com",
    strategy: "walixz",
    titleSelector: "h1",
    contentSelector: "article",
  },
  {
    host: "zrblog.net",
    strategy: "zrblog",
    titleSelector: "h1",
    contentSelector: ".article_content",
    removeSelectors: [".d-sm-block", "a:first"],
  },
  {
    host: "vpsgongyi.net",
    strategy: "vpsgongyi",
    usePuppeteer: true,
    titleSelector: "h1.entry-title",
    contentSelector: ".entry-content",
    descriptionSelector: ".entry-content p",
    tagSelector: ".tags-links a",
    resolveRedirectPattern: /vpsgongyi\.net\/goto\//,
  },
];

const fallbackRule: SiteRule = {
  host: "*",
  strategy: "fallback",
  titleSelector: "h1, title",
  contentSelector:
    "article, main article, .entry-content, .article-content, .content, main",
  tagSelector: 'a[rel="tag"], .tags a, .tag a, .post-tags a',
};

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function findRule(url: URL) {
  const host = normalizeHost(url.hostname);
  return (
    siteRules.find(
      (rule) => host === rule.host || host.endsWith(`.${rule.host}`),
    ) ?? fallbackRule
  );
}

function createEmptyDiagnostics(input: {
  sourceHost: string;
  strategy: string;
  usedPuppeteer: boolean;
  usedFallback: boolean;
  usedAiRewrite: boolean;
}): ScrapeDiagnostics {
  return {
    ...input,
    contentLength: 0,
    removedSelectors: [],
    affiliateReport: mergeAffiliateReports([]),
    warnings: [],
  };
}

function createArticle(input: {
  title?: string;
  htmlContent?: string;
  description?: string;
  keywords?: string[];
  tagsName?: string[];
  recommendTagName?: string;
  diagnostics: ScrapeDiagnostics;
}): ScrapedArticle {
  const htmlContent = normalizeArticleHtml(input.htmlContent ?? "");

  return {
    title: input.title ?? "",
    htmlContent,
    content: htmlContent,
    description: input.description ?? "",
    keywords: input.keywords ?? [],
    tagsName: input.tagsName ?? [],
    recommendTagName: input.recommendTagName ?? "",
    diagnostics: {
      ...input.diagnostics,
      contentLength: htmlContent.length,
    },
  };
}

function firstParagraphText($: cheerio.CheerioAPI) {
  return $("p").first().text().trim();
}

function selectedText($: cheerio.CheerioAPI, selector?: string) {
  return selector ? $(selector).first().text().trim() : "";
}

function collectTags($: cheerio.CheerioAPI, selector?: string) {
  if (!selector) return [];

  return $(selector)
    .toArray()
    .map((element) => $(element).text().trim())
    .filter(Boolean);
}

function removeNoise(
  $: cheerio.CheerioAPI,
  selectors: string[],
  diagnostics: ScrapeDiagnostics,
) {
  for (const selector of selectors) {
    const count = $(selector).length;
    if (count > 0) {
      diagnostics.removedSelectors.push(`${selector}:${count}`);
      $(selector).remove();
    }
  }

  $("p").each((_, element) => {
    const $p = $(element);
    const text = $p.text().replace(/\u00a0/g, " ").trim();
    if (!text && $p.children().length === 0) {
      $p.remove();
    }
  });
}

function cleanInvisibleText($: cheerio.CheerioAPI) {
  $("*")
    .contents()
    .each((_, node) => {
      if (!("data" in node) || typeof node.data !== "string") {
        return;
      }

      node.data = node.data.replace(invisibleTextPattern, "");
    });
}

function normalizeTextNode(value: string) {
  return value.replace(invisibleTextPattern, "").replace(whitespacePattern, " ");
}

function prepareHtmlForAiRewrite(content: string) {
  const $ = cheerio.load(content, null, false);

  $(removeForAiSelectors.join(",")).remove();
  $("h1").remove();

  $("*").each((_, element) => {
    const $element = $(element);
    const tagName = String($element.prop("tagName") ?? "").toLowerCase();

    if (!tagName) {
      return;
    }

    if (!allowedAiInputTags.has(tagName)) {
      $element.replaceWith($element.contents());
      return;
    }

    const href = tagName === "a" ? $element.attr("href") : undefined;
    for (const attribute of Object.keys($element.attr() ?? {})) {
      $element.removeAttr(attribute);
    }

    if (href) {
      $element.attr("href", href);
    }
  });

  $("*")
    .contents()
    .each((_, node) => {
      if (!("data" in node) || typeof node.data !== "string") {
        return;
      }

      node.data = normalizeTextNode(node.data);
    });

  $("br").replaceWith("\n");

  $("*").each((_, element) => {
    const $element = $(element);
    const tagName = String($element.prop("tagName") ?? "").toLowerCase();
    const text = $element.text().replace(/\s+/g, "").trim();

    if (!text && tagName !== "br") {
      $element.remove();
    }
  });

  return ($.html() ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function limitHtmlForAiRewrite(content: string) {
  if (content.length <= MAX_AI_INPUT_HTML_LENGTH) {
    return { html: content, truncated: false };
  }

  const $ = cheerio.load(content, null, false);
  const output: string[] = [];
  let length = 0;

  for (const element of $.root().children().toArray()) {
    const html = $.html(element);
    if (!html) {
      continue;
    }

    if (length + html.length > MAX_AI_INPUT_HTML_LENGTH) {
      break;
    }

    output.push(html);
    length += html.length;
  }

  const html = output.join("").trim();

  return {
    html: html || content.slice(0, MAX_AI_INPUT_HTML_LENGTH),
    truncated: true,
  };
}

async function fetchWithCheerio(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: browserHeaders,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`抓取失败：HTTP ${response.status}`);
    }
    return cheerio.load(await response.text());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("抓取页面超时，请稍后重试");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithPuppeteer(url: string, rule: SiteRule) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(browserHeaders["User-Agent"]);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForSelector(rule.contentSelector, { timeout: 30000 });

    const html = await page.content();
    return { $: cheerio.load(html), browser };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function resolveRedirect(browser: Browser, href: string) {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(browserHeaders["User-Agent"]);
    await page.goto(href, { waitUntil: "networkidle0", timeout: 10000 });
    return page.url();
  } finally {
    await page.close();
  }
}

async function resolveHttpRedirect(href: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headResponse = await fetch(href, {
      headers: browserHeaders,
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    if (headResponse.url) {
      return headResponse.url;
    }
  } catch {
    // Some redirect endpoints do not support HEAD. Fall back to GET below.
  } finally {
    clearTimeout(timeout);
  }

  const getController = new AbortController();
  const getTimeout = setTimeout(() => getController.abort(), 10000);

  try {
    const response = await fetch(href, {
      headers: browserHeaders,
      method: "GET",
      redirect: "follow",
      signal: getController.signal,
    });

    await response.body?.cancel();
    return response.url || href;
  } finally {
    clearTimeout(getTimeout);
  }
}

function shouldResolveRedirectHref(input: {
  href: string;
  sourceUrl: URL;
  rule: SiteRule;
}) {
  if (input.rule.resolveRedirectPattern?.test(input.href)) {
    return true;
  }

  let parsedHref: URL;
  try {
    parsedHref = new URL(input.href, input.sourceUrl);
  } catch {
    return false;
  }

  const hrefHost = normalizeHost(parsedHref.hostname);
  const sourceHost = normalizeHost(input.sourceUrl.hostname);

  return (
    (hrefHost === sourceHost || hrefHost.endsWith(`.${sourceHost}`)) &&
    internalRedirectPathPattern.test(parsedHref.pathname)
  );
}

async function scrapeByRule(input: {
  url: string;
  rule: SiteRule;
  rewriteStyleId?: number;
  allowAiFallback?: boolean;
}) {
  const parsedUrl = new URL(input.url);
  const diagnostics = createEmptyDiagnostics({
    sourceHost: normalizeHost(parsedUrl.hostname),
    strategy: input.rule.strategy,
    usedPuppeteer: Boolean(input.rule.usePuppeteer),
    usedFallback: input.rule.strategy === "fallback",
    usedAiRewrite: false,
  });

  let browser: Browser | null = null;
  let page$: cheerio.CheerioAPI;

  if (input.rule.usePuppeteer) {
    const result = await fetchWithPuppeteer(input.url, input.rule);
    page$ = cheerio.load(result.$.html());
    browser = result.browser;
  } else {
    page$ = await fetchWithCheerio(input.url);
  }

  try {
    const $content = cheerio.load(
      page$(input.rule.contentSelector).first().html() ?? "",
      null,
      false,
    );

    if (!$content.root().children().length) {
      diagnostics.warnings.push("未匹配到正文选择器");
    }

    removeNoise(
      $content,
      [...commonRemoveSelectors, ...(input.rule.removeSelectors ?? [])],
      diagnostics,
    );
    cleanInvisibleText($content);

    const redirectBrowser = browser;
    const resolveHref = async (href: string) => {
      if (
        !shouldResolveRedirectHref({
          href,
          sourceUrl: parsedUrl,
          rule: input.rule,
        })
      ) {
        return href;
      }

      try {
        if (redirectBrowser) {
          return await resolveRedirect(redirectBrowser, href);
        }

        return await resolveHttpRedirect(href);
      } catch (error) {
        diagnostics.warnings.push(`跳转链接解析失败：${href}`);
        console.error("Failed to resolve redirect link:", error);
        return href;
      }
    };

    const affiliateReport = await rewriteAffiliateLinks({
      $: $content,
      selector: input.rule.linkSelector ?? "a",
      baseUrl: input.url,
      sourceHost: parsedUrl.hostname,
      removeInternal: input.rule.removeInternalLinks,
      resolveHref,
    });

    diagnostics.affiliateReport = affiliateReport;

    const rawHtml = $content.html() ?? "";
    const preparedAiInput = limitHtmlForAiRewrite(
      prepareHtmlForAiRewrite(rawHtml),
    );
    const scrapedTitle =
      selectedText(page$, input.rule.titleSelector) ||
      selectedText(page$, "title") ||
      "未采集到标题";
    const scrapedDescription =
      selectedText(page$, input.rule.descriptionSelector) ||
      firstParagraphText($content).substring(0, 120);

    diagnostics.scrapedTitle = scrapedTitle;
    diagnostics.scrapedDescription = scrapedDescription;
    diagnostics.cleanedHtmlLength = rawHtml.length;
    diagnostics.aiInputLength = preparedAiInput.html.length;
    diagnostics.aiInputTruncated = preparedAiInput.truncated;

    if (preparedAiInput.truncated) {
      diagnostics.warnings.push("AI 输入过长，已截取前半部分核心内容改写");
    }

    if (preparedAiInput.html.trim()) {
      try {
        const rewritten = await RewriteArticle(preparedAiInput.html, {
          styleId: input.rewriteStyleId,
        });
        diagnostics.usedAiRewrite = true;
        diagnostics.rewriteOutputLength = rewritten.htmlContent.length;
        return createArticle({
          htmlContent: rewritten.htmlContent,
          title: rewritten.title,
          description: rewritten.description,
          keywords: rewritten.keywords,
          tagsName: rewritten.tagsName,
          recommendTagName: rewritten.recommendTagName,
          diagnostics,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "AI 改写失败";
        console.error("AI rewrite failed:", error);
        diagnostics.usedAiRewrite = false;
        diagnostics.aiRewriteError = message;

        if (!input.allowAiFallback) {
          throw new Error(message);
        }

        diagnostics.warnings.push(`AI 改写失败，已回退为原始采集内容：${message}`);
      }
    }

    return createArticle({
      title: scrapedTitle,
      htmlContent: rawHtml,
      description: scrapedDescription,
      tagsName: collectTags(page$, input.rule.tagSelector),
      diagnostics,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function scrapeArticle(url: string) {
  const parsedUrl = new URL(url);
  const rule = findRule(parsedUrl);
  return scrapeByRule({ url, rule });
}

export async function scrapeArticleWithOptions(input: {
  url: string;
  rewriteStyleId?: number;
  allowAiFallback?: boolean;
}) {
  const parsedUrl = new URL(input.url);
  const rule = findRule(parsedUrl);
  return scrapeByRule({
    url: input.url,
    rule,
    rewriteStyleId: input.rewriteStyleId,
    allowAiFallback: input.allowAiFallback,
  });
}
