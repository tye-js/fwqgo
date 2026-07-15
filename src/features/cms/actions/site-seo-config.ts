"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";
import { db } from "@fwqgo/db";
import { siteSeoConfigs } from "@fwqgo/db/schema";

const siteSeoConfigSchema = z.object({
  language: z.enum(["zh", "en"]),
  siteName: z.string().trim().min(1, "站点名不能为空").max(120),
  title: z.string().trim().min(1, "标题不能为空").max(180),
  description: z.string().trim().max(800).optional(),
  keywords: z.string().trim().max(800).optional(),
});

function normalizeSeoKeywords(value: string | undefined) {
  return (value ?? "")
    .replace(/，/g, ",")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join(",");
}

function textOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function updateSiteSeoConfig(
  input: z.infer<typeof siteSeoConfigSchema>,
) {
  try {
    await requireAdminSession();

    const result = siteSeoConfigSchema.parse(input);
    const now = new Date();

    const [config] = await db
      .insert(siteSeoConfigs)
      .values({
        language: result.language,
        siteName: result.siteName,
        title: result.title,
        description: textOrNull(result.description),
        keywords: textOrNull(normalizeSeoKeywords(result.keywords)),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: siteSeoConfigs.language,
        set: {
          siteName: result.siteName,
          title: result.title,
          description: textOrNull(result.description),
          keywords: textOrNull(normalizeSeoKeywords(result.keywords)),
          updatedAt: now,
        },
      })
      .returning({
        language: siteSeoConfigs.language,
        siteName: siteSeoConfigs.siteName,
        title: siteSeoConfigs.title,
        description: siteSeoConfigs.description,
        keywords: siteSeoConfigs.keywords,
      });

    revalidateSiteContent([cacheTags.siteSeo, cacheTags.homepage]);
    await notifyPublicWebCache("seo.changed");
    revalidatePath("/seo");
    revalidatePath("/en");

    return { data: config };
  } catch (error) {
    console.error("更新站点 SEO 配置失败:", error);
    return {
      error: "更新站点 SEO 配置失败",
      message: error instanceof Error ? error.message : "未知错误",
    };
  }
}
