"use server";

import { z } from "zod";

import {
  scrapeArticle,
  type ScrapedArticle,
} from "@/server/scrape/article-scraper";

const urlSchema = z.object({
  url: z.string().url(),
});

export type ScrapeActionState = {
  success: boolean;
  data: ScrapedArticle | null;
  error: string | null;
};

export async function scrapeArticleAction(
  prevState: ScrapeActionState,
  formData: FormData,
): Promise<ScrapeActionState> {
  try {
    const urlString = formData.get("url") as string;
    const { url } = urlSchema.parse({ url: urlString });
    const article = await scrapeArticle(url);

    return { success: true, data: article, error: null };
  } catch (error) {
    console.error("Scraping error:", error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : "抓取失败",
    };
  }
}
