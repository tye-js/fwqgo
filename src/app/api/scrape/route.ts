import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { z } from "zod";

const urlSchema = z.object({
  url: z.string().url(),
});

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url: string };
    const { url } = urlSchema.parse(body);

    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const article = urlAndRules(url, $);

    return NextResponse.json({ success: true, data: article });
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
