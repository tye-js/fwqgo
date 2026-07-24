import * as cheerio from "cheerio";
import puppeteer, { type Browser, type Page } from "puppeteer";

import {
  htmlToArticleMarkdown,
  looksLikeHtmlContent,
  normalizeArticleHtml,
} from "@fwqgo/core/content";
import {
  assertPublicHttpUrl,
  fetchPublicHttpUrl,
  parsePublicHttpUrl,
  requirePublicHttpUrl,
} from "@fwqgo/core/network-url";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import type {
  ArticleRewriteProgress,
  ArticleRewriteQuality,
} from "@fwqgo/ai/article-rewriter";
import RewriteArticle from "@/langchain/rewrite-article";
import {
  getMatchedAffiliateProviderNames,
  mergeAffiliateReports,
  repairMarkdownAffiliateLinks,
  rewriteAffiliateLinks,
  type AffiliateRewriteReport,
} from "@/server/links/affiliate-link-rewriter";

export interface ScrapeDiagnostics {
  sourceHost: string;
  strategy: string;
  usedPuppeteer: boolean;
  usedFallback: boolean;
  usedAiRewrite: boolean;
  contentLength: number;
  scrapedTitle?: string;
  scrapedDescription?: string;
  contentSelector?: string;
  cleanedHtmlLength?: number;
  aiInputLength?: number;
  rewriteOutputLength?: number;
  aiInputTruncated?: boolean;
  removedSelectors: string[];
  affiliateReport: AffiliateRewriteReport;
  warnings: string[];
  aiRewriteError?: string;
  rewriteQuality?: ArticleRewriteQuality;
}

export interface ScrapedArticle {
  title: string;
  content: string;
  description: string;
  htmlContent: string;
  cleanedHtmlContent: string;
  keywords: string[];
  recommendTagName: string;
  tagsName: string[];
  diagnostics: ScrapeDiagnostics;
}

export interface ArticleProcessingSnapshot {
  title: string;
  description: string;
  cleanedHtmlContent: string;
  diagnostics: ScrapeDiagnostics;
}

export type ArticleProcessingProgress =
  | {
      stage: "content_prepared";
      snapshot: ArticleProcessingSnapshot;
    }
  | {
      stage: "ai_progress";
      snapshot: ArticleProcessingSnapshot;
      ai: ArticleRewriteProgress;
    }
  | {
      stage: "ai_failed";
      snapshot: ArticleProcessingSnapshot;
      error: string;
    };

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
const MAX_SCRAPED_HTML_BYTES = 8 * 1024 * 1024;
const MAX_AI_INPUT_MARKDOWN_LENGTH = 14_000;

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
const fallbackContentSelectors = [
  "article",
  "main article",
  ".entry-content",
  ".article-content",
  ".content",
  "main",
  "body",
];

const invisibleTextPattern =
  /[\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ue000-\uf8ff\ufeff]/g;

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
  cleanedHtmlContent?: string;
  description?: string;
  keywords?: string[];
  tagsName?: string[];
  recommendTagName?: string;
  diagnostics: ScrapeDiagnostics;
}): ScrapedArticle {
  const content =
    [input.htmlContent, input.cleanedHtmlContent]
      .find((value) => value?.trim())
      ?.trim() ?? "";
  const htmlContent = looksLikeHtmlContent(content)
    ? normalizeArticleHtml(content)
    : content.trim();

  return {
    title: input.title ?? "",
    htmlContent,
    cleanedHtmlContent: input.cleanedHtmlContent ?? htmlContent,
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
    const text = $p
      .text()
      .replace(/\u00a0/g, " ")
      .trim();
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

async function fetchWithCheerio(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchPublicHttpUrl(
      url,
      {
        headers: browserHeaders,
        signal: controller.signal,
      },
      "抓取页面",
    );
    if (!response.ok) {
      throw new Error(`抓取失败：HTTP ${response.status}`);
    }
    const html = await readResponseTextWithLimit(
      response,
      MAX_SCRAPED_HTML_BYTES,
    );
    if (html === null) {
      throw new Error("抓取失败：网页内容超过 8 MB 限制");
    }
    return cheerio.load(html);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("抓取页面超时，请稍后重试");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function installSafePuppeteerRequestGuard(page: Page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const safeUrl = parsePublicHttpUrl(request.url());

    if (!safeUrl) {
      void request.abort();
      return;
    }

    void request.continue();
  });
}

function textToHtml(value: string) {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

function selectContentHtml(
  page$: cheerio.CheerioAPI,
  rule: SiteRule,
  diagnostics: ScrapeDiagnostics,
) {
  const selectors = [rule.contentSelector, ...fallbackContentSelectors];
  const seen = new Set<string>();

  for (const selector of selectors) {
    if (seen.has(selector)) continue;
    seen.add(selector);

    const html = page$(selector).first().html()?.trim() ?? "";
    if (!html) continue;

    const probe$ = cheerio.load(html, null, false);
    const probeRemoveSelectors = [
      ...commonRemoveSelectors,
      ...(rule.removeSelectors ?? []),
      ...(selector === "body"
        ? ["header", "nav", "footer", "aside", "form"]
        : []),
    ];
    probe$(probeRemoveSelectors.join(",")).remove();
    cleanInvisibleText(probe$);
    const visibleText = probe$.root().text().replace(/\s+/g, " ").trim();
    if (!visibleText) continue;

    diagnostics.contentSelector = selector;
    if (selector !== rule.contentSelector) {
      diagnostics.warnings.push(
        `正文选择器未命中，已回退到 ${selector}，请检查站点采集规则`,
      );
    }
    return { html, selector };
  }

  diagnostics.warnings.push(
    "未找到包含可读文字的正文区域，页面可能需要登录或正文选择器已失效",
  );
  return { html: "", selector: null };
}

async function fetchWithPuppeteer(url: string, rule: SiteRule) {
  await assertPublicHttpUrl(url, "抓取页面");
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await installSafePuppeteerRequestGuard(page);
    await page.setUserAgent(browserHeaders["User-Agent"]);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    try {
      await page.waitForSelector(rule.contentSelector, { timeout: 10000 });
    } catch {
      // The selector fallback below can still recover pages whose layout changed.
    }

    const html = await page.content();
    if (Buffer.byteLength(html) > MAX_SCRAPED_HTML_BYTES) {
      throw new Error("抓取失败：动态网页内容超过 8 MB 限制");
    }
    return { $: cheerio.load(html), browser };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function resolveRedirect(browser: Browser, href: string) {
  const safeHref = await assertPublicHttpUrl(href, "跳转链接");
  const page = await browser.newPage();

  try {
    await installSafePuppeteerRequestGuard(page);
    await page.setUserAgent(browserHeaders["User-Agent"]);
    await page.goto(safeHref.toString(), {
      waitUntil: "networkidle0",
      timeout: 10000,
    });
    return page.url();
  } finally {
    await page.close();
  }
}

async function resolveHttpRedirect(href: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const headResponse = await fetchPublicHttpUrl(
      href,
      {
        headers: browserHeaders,
        method: "HEAD",
        signal: controller.signal,
      },
      "跳转链接",
    );

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
    const response = await fetchPublicHttpUrl(
      href,
      {
        headers: browserHeaders,
        method: "GET",
        signal: getController.signal,
      },
      "跳转链接",
    );

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
  aiInputMaxLength?: number;
  onProgress?: (progress: ArticleProcessingProgress) => void | Promise<void>;
}) {
  const parsedUrl = requirePublicHttpUrl(input.url, "抓取 URL");
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
    const contentSelection = selectContentHtml(
      page$,
      input.rule,
      diagnostics,
    );
    let $content = cheerio.load(contentSelection.html, null, false);

    removeNoise(
      $content,
      [
        ...commonRemoveSelectors,
        ...(input.rule.removeSelectors ?? []),
        ...(contentSelection.selector === "body"
          ? ["header", "nav", "footer", "aside", "form"]
          : []),
      ],
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

    let rawHtml = $content.html() ?? "";
    let preparedAiInput = htmlToArticleMarkdown(rawHtml, {
      maxLength: input.aiInputMaxLength ?? MAX_AI_INPUT_MARKDOWN_LENGTH,
    });
    if (!preparedAiInput.markdown.trim()) {
      const visibleText = $content.root().text().replace(/\s+/g, " ").trim();
      if (visibleText) {
        rawHtml = normalizeArticleHtml(textToHtml(visibleText));
        $content = cheerio.load(rawHtml, null, false);
        preparedAiInput = htmlToArticleMarkdown(rawHtml, {
          maxLength: input.aiInputMaxLength ?? MAX_AI_INPUT_MARKDOWN_LENGTH,
        });
        diagnostics.warnings.push(
          "正文结构无法转换为 Markdown，已使用可读纯文本回退",
        );
      }
    }
    const scrapedTitle =
      selectedText(page$, input.rule.titleSelector) ||
      selectedText(page$, "title") ||
      "未采集到标题";
    const scrapedDescription =
      selectedText(page$, input.rule.descriptionSelector) ||
      firstParagraphText($content).substring(0, 120);

    diagnostics.scrapedTitle = scrapedTitle;
    diagnostics.scrapedDescription = scrapedDescription;
    diagnostics.contentLength = rawHtml.length;
    diagnostics.cleanedHtmlLength = rawHtml.length;
    diagnostics.aiInputLength = preparedAiInput.markdown.length;
    diagnostics.aiInputTruncated = preparedAiInput.truncated;
    const progressSnapshot = (): ArticleProcessingSnapshot => ({
      title: scrapedTitle,
      description: scrapedDescription,
      cleanedHtmlContent: rawHtml,
      diagnostics,
    });

    if (preparedAiInput.truncated) {
      diagnostics.warnings.push(
        "AI Markdown 输入过长，已按正文结构截取前半部分核心内容改写",
      );
    }

    await input.onProgress?.({
      stage: "content_prepared",
      snapshot: progressSnapshot(),
    });

    if (!preparedAiInput.markdown.trim()) {
      throw new Error(
        "正文提取失败：未找到可读正文，请检查正文选择器、页面访问权限或登录状态",
      );
    }

    if (preparedAiInput.markdown.trim()) {
      try {
        const rewritten = await RewriteArticle(preparedAiInput.markdown, {
          styleId: input.rewriteStyleId,
          providerNames: getMatchedAffiliateProviderNames(affiliateReport),
          onProgress: async (ai) => {
            await input.onProgress?.({
              stage: "ai_progress",
              snapshot: progressSnapshot(),
              ai,
            });
          },
        });
        const repairedMarkdown = repairMarkdownAffiliateLinks(
          rewritten.markdownContent,
          affiliateReport,
        );
        const finalMarkdown =
          repairedMarkdown.trim() || preparedAiInput.markdown;
        if (!repairedMarkdown.trim()) {
          diagnostics.warnings.push(
            "AI 返回空正文，已回退到清洗后的原始正文",
          );
        }
        diagnostics.usedAiRewrite = true;
        diagnostics.rewriteOutputLength = finalMarkdown.length;
        diagnostics.rewriteQuality = rewritten.quality;
        return createArticle({
          htmlContent: finalMarkdown,
          cleanedHtmlContent: rawHtml,
          title: rewritten.title,
          description: rewritten.description,
          keywords: rewritten.keywords,
          tagsName: rewritten.tagsName,
          recommendTagName: rewritten.recommendTagName,
          diagnostics,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 改写失败";
        console.error("AI rewrite failed:", error);
        diagnostics.usedAiRewrite = false;
        diagnostics.aiRewriteError = message;
        await input.onProgress?.({
          stage: "ai_failed",
          snapshot: progressSnapshot(),
          error: message,
        });

        if (!input.allowAiFallback) {
          throw new Error(message);
        }

        diagnostics.warnings.push(
          `AI 改写失败，已回退为原始采集内容：${message}`,
        );
      }
    }

    return createArticle({
      title: scrapedTitle,
      htmlContent: rawHtml,
      cleanedHtmlContent: rawHtml,
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
  const parsedUrl = requirePublicHttpUrl(url, "抓取 URL");
  const rule = findRule(parsedUrl);
  return scrapeByRule({ url, rule });
}

export async function scrapeArticleWithOptions(input: {
  url: string;
  rewriteStyleId?: number;
  allowAiFallback?: boolean;
  aiInputMaxLength?: number;
  onProgress?: (progress: ArticleProcessingProgress) => void | Promise<void>;
}) {
  const parsedUrl = requirePublicHttpUrl(input.url, "抓取 URL");
  const rule = findRule(parsedUrl);
  return scrapeByRule({
    url: input.url,
    rule,
    rewriteStyleId: input.rewriteStyleId,
    allowAiFallback: input.allowAiFallback,
    aiInputMaxLength: input.aiInputMaxLength,
    onProgress: input.onProgress,
  });
}
