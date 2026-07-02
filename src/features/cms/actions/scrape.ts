"use server";

import { z } from "zod";

import {
  scrapeArticleWithOptions,
  type ScrapedArticle,
} from "@fwqgo/scrape/article-scraper";
import { getAiRewriteConfigs } from "@fwqgo/ai/rewrite-config";
import { requireAdminSession } from "@fwqgo/auth/session";

const urlSchema = z.object({
  url: z.string().url(),
  rewriteStyleId: z.coerce.number().int().positive().optional(),
});
const SCRAPE_ACTION_TIMEOUT_MS = 330_000;

export type ScrapeActionState = {
  success: boolean;
  data: ScrapedArticle | null;
  error: string | null;
};

function withTimeout<T>(promise: Promise<T>, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, SCRAPE_ACTION_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export async function scrapeArticleAction(
  prevState: ScrapeActionState,
  formData: FormData,
): Promise<ScrapeActionState> {
  try {
    await requireAdminSession();

    const urlString = formData.get("url") as string;
    const rewriteStyleIdString = formData.get("rewriteStyleId");
    const { url, rewriteStyleId } = urlSchema.parse({
      url: urlString,
      rewriteStyleId:
        typeof rewriteStyleIdString === "string" && rewriteStyleIdString
          ? rewriteStyleIdString
          : undefined,
    });
    const article = await withTimeout(
      scrapeArticleWithOptions({
        url,
        rewriteStyleId,
      }),
      "抓取改写超时，请稍后重试或换一个内容更短的来源",
    );

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

export async function getAiRewriteStyleOptions() {
  await requireAdminSession();

  const configs = await getAiRewriteConfigs();
  return configs
    .filter((config) => config.enabled)
    .map((config) => ({
      id: config.id,
      name: config.name,
      provider: config.provider,
      model: config.model,
      styleName: config.styleName,
      isDefault: config.isDefault,
      hasApiKey: config.hasApiKey,
    }));
}
