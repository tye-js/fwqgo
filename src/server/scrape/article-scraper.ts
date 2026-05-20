import * as cheerio from "cheerio";
import puppeteer, { type Browser } from "puppeteer";

import { normalizeArticleHtml } from "@/lib/content";
import { handleAffUrl } from "@/lib/handleAffUrl";
import { slugify } from "@/lib/utils";
import RewriteArticle from "@/langchain/rewrite-article";

export interface ScrapedArticle {
  title: string;
  content: string;
  description: string;
  htmlContent: string;
  keywords: string[];
  recommendTagName: string;
  tagsName: string[];
}

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

function createArticle(input: Partial<ScrapedArticle>): ScrapedArticle {
  const htmlContent = normalizeArticleHtml(input.htmlContent ?? input.content ?? "");

  return {
    title: input.title ?? "",
    htmlContent,
    content: htmlContent,
    description: input.description ?? "",
    keywords: input.keywords ?? [],
    tagsName: input.tagsName ?? [],
    recommendTagName: input.recommendTagName ?? "",
  };
}

function firstParagraphText($: cheerio.CheerioAPI) {
  return $("p").first().text().trim();
}

async function rewriteExternalLinks(
  $: cheerio.CheerioAPI,
  selector: string,
  sourceHost: string,
  options: { removeInternal?: boolean } = {},
) {
  for (const element of $(selector).toArray()) {
    const $link = $(element);
    const href = $link.attr("href");

    if (!href) continue;

    if (href.includes(sourceHost)) {
      $link.replaceWith(options.removeInternal ? "" : $link.text());
      continue;
    }

    $link.attr("href", await handleAffUrl(href));
  }
}

function setAffParam(href: string, param: string, value: string) {
  try {
    const url = new URL(href);
    if (url.searchParams.has(param)) {
      url.searchParams.set(param, value);
    }
    return url.toString();
  } catch {
    return href;
  }
}

async function scrapeLaoliu(url: string, $: cheerio.CheerioAPI) {
  const $content = cheerio.load($(".content").first().html() ?? "");
  const tagsName: string[] = [];

  $content(".wp-block-image").remove();
  $content(".orbui").remove();
  $content("footer").remove();
  $content(".lwptoc").remove();

  $content("a").each((_, element) => {
    const $link = $content(element);
    const href = $link.attr("href");
    if (!href) return;

    if (href.includes("laoliublog.cn")) {
      $link.replaceWith($link.text());
      return;
    }

    $link.attr("href", setAffParam(href, "aff", "5734"));
  });

  $(".article-categories a").each((_, element) => {
    const tagText = $(element).text().trim();
    if (tagText) tagsName.push(tagText);
  });

  return createArticle({
    title: $("h1").first().text().trim(),
    htmlContent: $content.html() ?? "",
    description: firstParagraphText($content).substring(0, 80),
    tagsName,
  });
}

async function scrapeZhujiceping(_url: string, $: cheerio.CheerioAPI) {
  const $articleContent = $(".article-content").first();

  $articleContent.find(".orbui").remove();
  $articleContent.find("img").remove();
  $articleContent.find("noscript").remove();
  $articleContent.find("#toc_container").remove();

  await rewriteExternalLinks($, ".article-content a", "zhujiceping.com", {
    removeInternal: true,
  });

  const result = await RewriteArticle($articleContent.html() ?? "");

  return createArticle({
    htmlContent: result.htmlContent,
    title: result.title,
    description: result.description,
    keywords: result.keywords,
    tagsName: result.tagsName,
    recommendTagName: result.recommendTagName,
  });
}

async function scrapeWalixz(_url: string, $: cheerio.CheerioAPI) {
  const $content = cheerio.load($("article").first().html() ?? "");

  $content(".htoc").remove();
  await rewriteExternalLinks($content, "a", "walixz.com");

  return createArticle({
    title: $("h1").text().trim() || "未采集到标题",
    htmlContent: $content.html() ?? "",
    description: firstParagraphText($content).substring(0, 80),
  });
}

async function scrapeZrblog(_url: string, $: cheerio.CheerioAPI) {
  const $content = cheerio.load($(".article_content").first().html() ?? "");

  $content("a").first().remove();
  $content("img").remove();
  $content(".postcopyright").remove();
  $content(".d-sm-block").remove();
  await rewriteExternalLinks($content, "a", "zrblog.net");

  return createArticle({
    title: $("h1").text().trim() || "未采集到标题",
    htmlContent: $content.html() ?? "",
    description: firstParagraphText($content),
  });
}

async function resolveVpsgongyiRedirect(browser: Browser, href: string) {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(browserHeaders["User-Agent"]);
    await page.goto(href, {
      waitUntil: "networkidle0",
      timeout: 10000,
    });
    return page.url();
  } finally {
    await page.close();
  }
}

async function scrapeVpsgongyi(url: string) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(browserHeaders["User-Agent"]);
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForSelector(".entry-content", { timeout: 30000 });

    const data = await page.evaluate(() => {
      const title =
        document.querySelector("h1.entry-title")?.textContent?.trim() ?? "";
      const htmlContent =
        document.querySelector(".entry-content")?.innerHTML?.trim() ?? "";
      const description =
        document.querySelector(".entry-content p")?.textContent?.trim() ?? "";
      const tags = Array.from(document.querySelectorAll(".tags-links a"))
        .map((tag) => tag.textContent?.trim())
        .filter((tag): tag is string => Boolean(tag));

      return { title, htmlContent, tags, description };
    });

    const $ = cheerio.load(data.htmlContent);
    $("img").remove();
    $("noscript").remove();
    $(".lwptoc").remove();

    $("p").each((_, element) => {
      const $p = $(element);
      const text = $p.text().trim();
      const hasImages = $p.find("img").length > 0;

      if (!text || text === "&nbsp;" || (text === "" && !hasImages)) {
        $p.remove();
      }
    });

    $("h2, h3, h4, h5, h6").each((_, element) => {
      const $heading = $(element);
      const headingText = slugify($heading.text().trim());
      $heading.attr("id", `fwq-${headingText}`);
    });

    for (const element of $("a").toArray()) {
      const $link = $(element);
      const href = $link.attr("href");

      if (!href) continue;

      let finalHref = href;
      if (href.includes("vpsgongyi.net/goto/")) {
        finalHref = await resolveVpsgongyiRedirect(browser, href);
      }

      $link.attr("href", setAffParam(finalHref, "aff", "1317"));
    }

    return createArticle({
      title: data.title,
      htmlContent: $.html(),
      description: data.description,
      tagsName: data.tags,
    });
  } finally {
    await browser.close();
  }
}

export async function scrapeArticle(url: string) {
  if (url.includes("vpsgongyi.net")) {
    return scrapeVpsgongyi(url);
  }

  const response = await fetch(url, { headers: browserHeaders });
  const html = await response.text();
  const $ = cheerio.load(html);

  if (url.includes("laoliublog.cn")) return scrapeLaoliu(url, $);
  if (url.includes("zhujiceping.com")) return scrapeZhujiceping(url, $);
  if (url.includes("walixz.com")) return scrapeWalixz(url, $);
  if (url.includes("zrblog.net")) return scrapeZrblog(url, $);

  return createArticle({});
}
