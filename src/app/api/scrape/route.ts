import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { z } from "zod";
import { slugify } from "@/lib/utils";

const urlSchema = z.object({
  url: z.string().url(),
});

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url: string };
    const { url } = urlSchema.parse(body);

    // 添加请求头模拟浏览器
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    };
    if (url.includes("vpsgongyi.net")) {
      const data = await puppeteerScrape(url);
      return NextResponse.json({ success: true, data });
    } else {
      const response = await fetch(url, { headers });
      const html = await response.text();
      const $ = cheerio.load(html);

      const article = urlAndRules(url, $);

      return NextResponse.json({ success: true, data: article });
    }
  } catch (error) {
    console.error("Scraping error:", error);
    return NextResponse.json(
      { success: false, error: "抓取失败" },
      { status: 500 },
    );
  }
}
// 根据url和规则获取文章信息
function urlAndRules(url: string, $: cheerio.CheerioAPI) {
  let title = "";
  let htmlContent = "";
  let description = "";
  const tags: string[] = [];
  // 判断是否是老刘博客
  if (url.includes("laoliublog.cn")) {
    // 获取文章主体内容（保留HTML结构）
    const articleHtml = $(".content").first().html();
    // 处理文章内容
    const $content = cheerio.load(articleHtml ?? "");

    // 移除指定 class 的 div
    $content(".wp-block-image").remove();
    $content(".orbui").remove();
    $content("footer").remove();
    $content(".lwptoc").remove();

    // 处理文章中的链接
    $content("a").each((_, element) => {
      const $link = $content(element);
      const href = $link.attr("href");

      if (href) {
        if (href.includes("laoliublog.cn")) {
          // 如果链接包含 laoliublog，保留文本内容但移除 a 标签
          $link.replaceWith($link.text());
          return;
        }

        try {
          // TODO 此处要处理不同云服务商对应的返利链接
          const url = new URL(href);
          // 检查并替换 aff 参数
          const searchParams = new URLSearchParams(url.search);
          if (searchParams.has("aff")) {
            searchParams.set("aff", "5734");
            url.search = searchParams.toString();
            $link.attr("href", url.toString());
          }
        } catch (error) {
          console.error("Failed to parse URL:", href, error);
        }
      }
    });

    // 获取文章标题
    title = $("h1").first().text().trim();

    // 获取文章标签
    $(".article-categories a").each((_, element) => {
      const tagText = $(element).text().trim();
      if (tagText) tags.push(tagText);
    });

    // 获取文章内容
    htmlContent = $content.html() || "";
    // 获取第一段作为描述
    const firstParagraph = $content("p").first();
    const text = firstParagraph.text().trim();
    if (text.length > 0) {
      description = text.substring(0, 80);
    }
    // 去除开头和结尾的 HTML 标签
    htmlContent = htmlContent
      .replace(/^<html><head><\/head><body>\t*\n/, "")
      .replace(/<\/body><\/html>$/, "");
  } else if (url.includes("zhujiceping.com")) {
    // 获取文章主体内容（保留HTML结构）
    const articleHtml = $(".article-content").first().html();
    // 处理文章内容
    const $content = cheerio.load(articleHtml ?? "");
    // 移除指定 class 的 div
    $content(".orbui").remove();
    $content("img").remove();
    $content("noscript").remove();
    $content("#toc_container").remove();

    // 获取文章标题
    title = $("h1").first().text().trim();
    // 处理文章中的链接
    $content("a").each((_, element) => {
      const $link = $content(element);
      const href = $link.attr("href");

      if (href) {
        if (href.includes("zhujiceping.com")) {
          // 如果链接包含 laoliublog，保留文本内容但移除 a 标签
          $link.replaceWith($link.text());
          return;
        }

        try {
          // TODO 此处要处理不同云服务商对应的返利链接
          const url = new URL(href);
          // 检查并替换 aff 参数
          const searchParams = new URLSearchParams(url.search);
          if (href.includes("zgovps.com") && searchParams.has("affid")) {
            searchParams.set("affid", "33");
          } else if (href.includes("raksmart.com") && searchParams.has("aff")) {
            searchParams.set("aff", "5734");
          } else if (href.includes("casbay.com") && searchParams.has("aff")) {
            searchParams.set("aff", "44");
          } else if (href.includes("vmiss.com") && searchParams.has("aff")) {
            searchParams.set("aff", "849");
          } else if (href.includes("clawcloudsingaporeprivatelimited.sjv.io")) {
            // 替换为新的链接
            $link.attr(
              "href",
              "https://clawcloudsingaporeprivatelimited.sjv.io/yqqo4G",
            );
            return;
          }
          url.search = searchParams.toString();
          $link.attr("href", url.toString());
        } catch (error) {
          console.error("Failed to parse URL:", href, error);
        }
      }
    });

    // 获取文章标签
    $(".article-tags a").each((_, element) => {
      const tagText = $(element).text().trim();
      if (tagText) tags.push(tagText);
    });

    // 获取文章内容
    htmlContent = $content.html() ?? "";
    // 获取第一段作为描述
    const firstParagraph = $content("p").first();
    const text = firstParagraph.text().trim();
    if (text.length > 0) {
      description = text.substring(0, 80);
    }
    // 去除空段落标签
    htmlContent = htmlContent
      .replace(/^<html><head><\/head><body>/, "")
      .replace(/<\/body><\/html>$/, "")
      .replace(/<p>&nbsp;<\/p>/g, "")
      .replace(/<p><\/p>/g, "")
      // 去除包含图片的段落
      .replace(/<p>\s*<img[^>]*>(?:<noscript>.*?<\/noscript>)?\s*<\/p>/g, "")
      .trim();
  }
  // 返回文章信息
  return { title, htmlContent, description, tags };
}

// 处理gongyi.net的抓取问题，需要使用puppeteer
async function puppeteerScrape(url: string) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // 设置更真实的浏览器特征
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  );
  await page.setViewport({ width: 1920, height: 1080 });

  // 访问页面并等待 Cloudflare 验证完成
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

  // 等待内容加载
  await page.waitForSelector(".entry-content", { timeout: 30000 });

  // 提取内容
  const data = await page.evaluate(() => {
    const title = document.querySelector("h1.entry-title")?.textContent?.trim();
    const htmlContent =
      document.querySelector(".entry-content")?.innerHTML?.trim() ?? "1";
    const description = document
      .querySelector(".entry-content p")
      ?.textContent?.trim();
    const tags = Array.from(document.querySelectorAll(".tags-links a"))
      .map((tag) => tag.textContent?.trim())
      .filter(Boolean);
    return { title, htmlContent, tags, description };
  });
  const $ = cheerio.load(data.htmlContent);
  $("img").remove();
  $("noscript").remove();
  $(".lwptoc").remove();
  // 移除空的p标签
  $("p").each((_, element) => {
    const $p = $(element);
    const text = $p.text().trim();
    const hasImages = $p.find("img").length > 0;
    // 如果段落内容只包含空格、&nbsp;或者只包含图片，则移除该段落
    if (!text || text === "&nbsp;" || (text === "" && !hasImages)) {
      $p.remove();
    }
  });

  // 处理h2-h6标题标签
  $("h2, h3, h4, h5, h6").each((_, element) => {
    const $heading = $(element);
    const headingText = slugify($heading.text().trim());
    const headingId = `fwq-${headingText}`;
    $heading.attr("id", headingId);
  });
  // 处理文章中的链接
  $("a").each((_, element) => {
    const $link = $(element);
    const href = $link.attr("href");

    if (href) {
      if (href.includes("vpsgongyi.net")) {
        // 如果链接包含，保留文本内容但移除 a 标签
        $link.replaceWith($link.text());
        return;
      }

      try {
        // TODO 此处要处理不同云服务商对应的返利链接
        const url = new URL(href);
        // 检查并替换 aff 参数
        const searchParams = new URLSearchParams(url.search);
        if (searchParams.has("aff")) {
          searchParams.set("aff", "1317");
          url.search = searchParams.toString();
          $link.attr("href", url.toString());
        }
      } catch (error) {
        console.error("Failed to parse URL:", href, error);
      }
    }
  });
  data.htmlContent = $.html();
  console.log(data.htmlContent);
  await browser.close();
  return data;
}
