import { eq } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { siteSeoConfigs } from "@fwqgo/db/schema";
import { isDatabaseFreeBuild } from "@fwqgo/core/build-verification";

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
    // The homepage carries the strongest internal link equity on the site, so
    // its title has to earn a head term instead of repeating the brand alone.
    title: "服务器go - VPS优惠与服务器评测｜香港/美国VPS推荐",
    description:
      "服务器go 汇总 VPS、云服务器与独立服务器优惠，覆盖香港、美国、日本机房与 CN2 GIA、CMIN2、原生IP 等线路，提供价格比价、商家评测与选购指南，帮你选到高性价比服务器。",
    keywords:
      "服务器go,VPS优惠,服务器优惠,香港VPS,美国VPS,日本VPS,CN2 GIA VPS,原生IP服务器,云服务器,独立服务器,VPS推荐,VPS评测,服务器比价,最新优惠码",
  },
  en: {
    language: "en",
    siteName: "fwqgo",
    title: "fwqgo - VPS Deals, Server Reviews & Hosting Comparisons",
    description:
      "fwqgo collects VPS, cloud and dedicated server deals across Hong Kong, the US, Japan and more, including CN2 GIA, residential IP and unmetered options, plus provider reviews, coupons and buying guides.",
    keywords:
      "fwqgo,VPS deals,cheap VPS,Hong Kong VPS,US VPS,CN2 GIA VPS,residential IP VPS,cloud servers,dedicated servers,hosting reviews,server coupons",
  },
};

export async function getSiteSeoConfig(language: SiteSeoLanguage = "zh") {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.siteSeo);

  const fallback = defaultSiteSeoConfigs[language];
  if (isDatabaseFreeBuild()) return { data: fallback };

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
    throw new Error("获取站点 SEO 配置失败", { cause: error });
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
