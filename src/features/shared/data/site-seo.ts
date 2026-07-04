import { eq } from "drizzle-orm";

import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { siteSeoConfigs } from "@fwqgo/db/schema";

export type SiteSeoLanguage = "zh" | "en";

export const defaultSiteSeoConfigs: Record<
  SiteSeoLanguage,
  {
    language: SiteSeoLanguage;
    siteName: string;
    title: string;
    description: string;
    keywords: string;
  }
> = {
  zh: {
    language: "zh",
    siteName: "服务器go",
    title: "服务器go",
    description:
      "服务器go为您汇总国内国外VPS、云服务器、独立服务器、原生IP云服务器的最新促销信息，更有商家背景、售后服务全面解析，助您轻松选购高性价比服务器！",
    keywords:
      "服务器go,VPS,云服务器,独立服务器,原生IP云服务器,CN2 GIA VPS,最新优惠码,服务器商家推荐,服务器购买指南",
  },
  en: {
    language: "en",
    siteName: "fwqgo",
    title: "fwqgo",
    description:
      "fwqgo collects VPS, cloud server, dedicated server, native IP hosting deals, provider reviews, coupons, and buying guides for global hosting users.",
    keywords:
      "fwqgo,VPS deals,cloud servers,dedicated servers,native IP VPS,server coupons,hosting reviews",
  },
};

export async function getSiteSeoConfig(language: SiteSeoLanguage = "zh") {
  "use cache";
  tagCache(cacheTags.siteSeo);

  const fallback = defaultSiteSeoConfigs[language];

  try {
    const [config] = await readDb
      .select({
        language: siteSeoConfigs.language,
        siteName: siteSeoConfigs.siteName,
        title: siteSeoConfigs.title,
        description: siteSeoConfigs.description,
        keywords: siteSeoConfigs.keywords,
      })
      .from(siteSeoConfigs)
      .where(eq(siteSeoConfigs.language, language))
      .limit(1);

    if (!config) {
      return { data: fallback };
    }

    return {
      data: {
        language,
        siteName: config.siteName.trim()
          ? config.siteName.trim()
          : fallback.siteName,
        title: config.title.trim() ? config.title.trim() : fallback.title,
        description: config.description?.trim()
          ? config.description.trim()
          : fallback.description,
        keywords: config.keywords?.trim()
          ? config.keywords.trim()
          : fallback.keywords,
      },
    };
  } catch (error) {
    return { data: fallback, error: "获取站点 SEO 配置失败", message: error };
  }
}

export async function getSiteSeoConfigs() {
  const [zh, en] = await Promise.all([
    getSiteSeoConfig("zh"),
    getSiteSeoConfig("en"),
  ]);

  return {
    data: [
      zh.data ?? defaultSiteSeoConfigs.zh,
      en.data ?? defaultSiteSeoConfigs.en,
    ],
  };
}
