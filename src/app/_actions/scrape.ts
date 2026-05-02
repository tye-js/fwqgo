"use server";

import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import { z } from "zod";
import { slugify } from "@/lib/utils";
import { handleAffUrl } from "@/lib/handleAffUrl";
import RewriteArticle from "@/langchain/rewrite-article";

const urlSchema = z.object({
    url: z.string().url(),
});

interface ScrapedArticle {
    title: string;
    content: string;
    description: string;
    htmlContent: string;
    keywords: string[];
    recommendTagName: string;
    tagsName: string[];
}

export type ScrapeActionState = {
    success: boolean;
    data: ScrapedArticle | null;
    error: string | null;
};

// 暴露一个新的 Server Action 给前端调用
export async function scrapeArticleAction(
    prevState: ScrapeActionState,
    formData: FormData,
): Promise<ScrapeActionState> {
    try {
        const urlString = formData.get("url") as string;
        const { url } = urlSchema.parse({ url: urlString });

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
            return { success: true, data: data as unknown as ScrapedArticle, error: null };
        } else {
            const response = await fetch(url, { headers });
            const html = await response.text();
            const $ = cheerio.load(html);

            const article = await urlAndRules(url, $);

            return { success: true, data: article, error: null };
        }
    } catch (error) {
        console.error("Scraping error:", error);
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : "抓取失败",
        };
    }
}

// 根据url和规则获取文章信息
async function urlAndRules(url: string, $: cheerio.CheerioAPI): Promise<ScrapedArticle> {
    let title = "";
    let htmlContent = "";
    let description = "";
    let keywords: string[] = [];
    let tagsName: string[] = [];
    let recommendTagName = "";
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
                    const urlObj = new URL(href);
                    // 检查并替换 aff 参数
                    const searchParams = new URLSearchParams(urlObj.search);
                    if (searchParams.has("aff")) {
                        searchParams.set("aff", "5734");
                        urlObj.search = searchParams.toString();
                        $link.attr("href", urlObj.toString());
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
        const $articleContent = $(".article-content").first();
        // 移除指定 class 的 div
        $articleContent.find(".orbui").remove();
        $articleContent.find("img").remove();
        $articleContent.find("noscript").remove();
        $articleContent.find("#toc_container").remove();

        // 处理文章中的链接
        for (const element of $articleContent.find("a").toArray()) {
            const $link = $(element);
            const href = $link.attr("href");

            if (href) {
                if (href.includes("zhujiceping.com")) {
                    $link.replaceWith("");
                    continue;
                }
                const newHref = await handleAffUrl(href);
                $link.attr("href", newHref);
            }
        }
        htmlContent = $articleContent.html() ?? "";

        // 使用ai对获取的文章进行重写（这里需要引入google ai）
        const result = await RewriteArticle(htmlContent);
        htmlContent = result.htmlContent;
        title = result.title;
        description = result.description;
        keywords = result.keywords;
        tagsName = result.tagsName;
        recommendTagName = result.recommendTagName;

    } else if (url.includes("walixz.com")) {
        const articleHtml = $("article").first().html();
        title = $("h1").text().trim() ?? "未采集到标题";
        // 处理文章内容
        const $content = cheerio.load(articleHtml ?? "");
        $content(".htoc").remove();
        // 处理文章中的链接
        for (const element of $content("a").toArray()) {
            const $link = $content(element);
            const href = $link.attr("href");

            if (href) {
                if (href.includes("walixz.com")) {
                    $link.replaceWith($link.text());
                    continue;
                }
                const newHref = await handleAffUrl(href);
                $link.attr("href", newHref);
            }
        }
        // 获取第一段作为描述
        const firstParagraph = $content("p").first();
        const text = firstParagraph.text().trim();
        if (text.length > 0) {
            description = text.substring(0, 80);
        }
        htmlContent = $content.html() ?? "";
    } else if (url.includes("zrblog.net")) {
        title = $("h1").text().trim() ?? "未采集到标题";
        const articleHtml = $(".article_content").first().html();
        const $content = cheerio.load(articleHtml ?? "");
        $content("a").first().remove();
        $content("img").remove();
        $content(".postcopyright").remove();
        $content(".d-sm-block").remove();
        for (const element of $content("a").toArray()) {
            const $link = $content(element);
            const href = $link.attr("href");

            if (href) {
                if (href.includes("zrblog.net")) {
                    $link.replaceWith($link.text());
                    continue;
                }
                const newHref = await handleAffUrl(href);
                $link.attr("href", newHref);
            }
        }

        description = $content("p").first().text().trim();
        htmlContent = $content.html() ?? "";
    }
    // 返回文章信息
    return {
        title,
        htmlContent,
        content: htmlContent,
        description,
        keywords,
        tagsName,
        recommendTagName,
    };
}

// 处理gongyi.net的抓取问题，需要使用puppeteer
async function puppeteerScrape(url: string) {
    const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
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
        const title = document.querySelector("h1.entry-title")?.textContent?.trim() ?? "";
        const htmlContent =
            document.querySelector(".entry-content")?.innerHTML?.trim() ?? "";
        const description = document
            .querySelector(".entry-content p")
            ?.textContent?.trim() ?? "";
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
    for (const element of $("a").toArray()) {
        const $link = $(element);
        const href = $link.attr("href");

        if (href) {
            if (href.includes("vpsgongyi.net/goto/")) {
                try {
                    // 创建新页面获取重定向链接
                    const newPage = await browser.newPage();
                    await newPage.setUserAgent(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    );

                    // 监听请求重定向
                    let finalUrl = href;
                    newPage.on("response", (response) => {
                        if (response.status() === 301 || response.status() === 302) {
                            finalUrl = response.headers().location ?? href;
                        }
                    });

                    await newPage.goto(href, {
                        waitUntil: "networkidle0",
                        timeout: 10000,
                    });
                    finalUrl = newPage.url(); // 获取最终URL
                    await newPage.close();

                    // 更新链接
                    $link.attr("href", finalUrl);
                    console.log("更新链接:", finalUrl);
                } catch (error) {
                    console.error("获取重定向链接失败:", error);
                }
            }

            try {
                const urlObj = new URL($link.attr("href") ?? "");
                const searchParams = new URLSearchParams(urlObj.search);
                if (searchParams.has("aff")) {
                    searchParams.set("aff", "1317");
                    urlObj.search = searchParams.toString();
                    $link.attr("href", urlObj.toString());
                }
            } catch (error) {
                console.error("Failed to parse URL:", href, error);
            }
        }
    }

    data.htmlContent = $.html();
    await browser.close();
    return {
        ...data,
        content: data.htmlContent,
        keywords: [],
        tagsName: data.tags as string[],
        recommendTagName: "",
    };
}
