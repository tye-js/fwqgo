"use server";

import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import { requireAdminSession } from "@fwqgo/auth/session";
import { isPublicHttpUrl } from "@fwqgo/core/network-url";
import { db } from "@fwqgo/db";
import { aiRewriteConfigs, aiSourceSites, categories } from "@fwqgo/db/schema";
import { enqueueAiSourceSiteBackgroundJob } from "@/server/ai/source-site-background";

const sourceSiteSchema = z.object({
  name: z.string().trim().min(1, "请输入站点名称").max(120),
  siteUrl: z.string().trim().url("请输入有效站点 URL").refine(isPublicHttpUrl, {
    message: "站点 URL 只允许公网 http/https 地址",
  }),
  feedUrl: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    z
      .string()
      .url("请输入有效 Feed URL")
      .refine(isPublicHttpUrl, {
        message: "Feed URL 只允许公网 http/https 地址",
      })
      .nullable(),
  ),
  categoryId: z.coerce.number().int().positive("请选择分类"),
  rewriteStyleId: z.coerce.number().int().positive().optional().nullable(),
  limit: z.coerce.number().int().min(1).max(50),
  enabled: z.coerce.boolean().default(true),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

function revalidateAiTaskPages() {
  revalidatePath("/ai-rewrite/tasks");
  revalidatePath("/ai-tasks");
}

function parseSourceSiteFormData(formData: FormData) {
  const rewriteStyleId = formData.get("rewriteStyleId");

  return sourceSiteSchema.parse({
    name: formData.get("name"),
    siteUrl: formData.get("siteUrl"),
    feedUrl: formData.get("feedUrl"),
    categoryId: formData.get("categoryId"),
    rewriteStyleId:
      typeof rewriteStyleId === "string" && rewriteStyleId
        ? rewriteStyleId
        : null,
    limit: formData.get("limit"),
    enabled: formData.get("enabled") === "true",
  });
}

async function assertCategoryExists(categoryId: number) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!category) {
    throw new Error("分类不存在");
  }
}

async function assertRewriteStyleAvailable(rewriteStyleId?: number | null) {
  const style = await getActiveAiRewriteConfig(rewriteStyleId ?? undefined);

  if (!style) {
    throw new Error(
      rewriteStyleId
        ? "AI 改写配置不存在或已停用"
        : "当前没有已启用的默认 AI 改写配置",
    );
  }
}

export async function getAiSourceSiteList() {
  await requireAdminSession();

  return db
    .select({
      id: aiSourceSites.id,
      name: aiSourceSites.name,
      siteUrl: aiSourceSites.siteUrl,
      feedUrl: aiSourceSites.feedUrl,
      categoryId: aiSourceSites.categoryId,
      categoryName: categories.name,
      rewriteStyleId: aiSourceSites.rewriteStyleId,
      rewriteStyleName: aiRewriteConfigs.styleName,
      limit: aiSourceSites.limit,
      enabled: aiSourceSites.enabled,
      lastRunAt: aiSourceSites.lastRunAt,
      lastDiscoveredCount: aiSourceSites.lastDiscoveredCount,
      lastCreatedCount: aiSourceSites.lastCreatedCount,
      lastSkippedCount: aiSourceSites.lastSkippedCount,
      lastRunDetails: aiSourceSites.lastRunDetails,
      lastError: aiSourceSites.lastError,
      createdAt: aiSourceSites.createdAt,
      updatedAt: aiSourceSites.updatedAt,
    })
    .from(aiSourceSites)
    .leftJoin(categories, eq(aiSourceSites.categoryId, categories.id))
    .leftJoin(
      aiRewriteConfigs,
      eq(aiSourceSites.rewriteStyleId, aiRewriteConfigs.id),
    )
    .orderBy(desc(aiSourceSites.enabled), asc(aiSourceSites.id));
}

export async function createAiSourceSiteAction(formData: FormData) {
  try {
    await requireAdminSession();
    const input = parseSourceSiteFormData(formData);

    await assertCategoryExists(input.categoryId);
    await assertRewriteStyleAvailable(input.rewriteStyleId);

    await db.insert(aiSourceSites).values({
      ...input,
      siteUrl: new URL(input.siteUrl).toString(),
      feedUrl: input.feedUrl ? new URL(input.feedUrl).toString() : null,
    });

    revalidateAiTaskPages();
    return { data: true };
  } catch (error) {
    console.error("创建来源站配置失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function updateAiSourceSiteAction(id: number, formData: FormData) {
  try {
    await requireAdminSession();
    const input = parseSourceSiteFormData(formData);

    await assertCategoryExists(input.categoryId);
    await assertRewriteStyleAvailable(input.rewriteStyleId);

    const [updated] = await db
      .update(aiSourceSites)
      .set({
        ...input,
        siteUrl: new URL(input.siteUrl).toString(),
        feedUrl: input.feedUrl ? new URL(input.feedUrl).toString() : null,
        updatedAt: new Date(),
      })
      .where(eq(aiSourceSites.id, id))
      .returning({ id: aiSourceSites.id });

    if (!updated) {
      return { error: "来源站配置不存在" };
    }

    revalidateAiTaskPages();
    return { data: updated };
  } catch (error) {
    console.error("更新来源站配置失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function deleteAiSourceSiteAction(id: number) {
  try {
    await requireAdminSession();

    if (!Number.isSafeInteger(id) || id <= 0) {
      return { error: "来源站 ID 不正确" };
    }

    const [deleted] = await db
      .delete(aiSourceSites)
      .where(eq(aiSourceSites.id, id))
      .returning({ id: aiSourceSites.id });

    if (!deleted) {
      return { error: "来源站配置不存在或已被删除" };
    }

    revalidateAiTaskPages();
    return { data: deleted };
  } catch (error) {
    console.error("删除来源站配置失败:", error);
    return { error: getErrorMessage(error) };
  }
}

export async function runAiSourceSiteAction(id: number) {
  try {
    await requireAdminSession();

    const [site] = await db
      .select()
      .from(aiSourceSites)
      .where(eq(aiSourceSites.id, id))
      .limit(1);

    if (!site) {
      return { error: "来源站配置不存在" };
    }

    if (!site.enabled) {
      return { error: "来源站已停用" };
    }

    await assertCategoryExists(site.categoryId);
    await assertRewriteStyleAvailable(site.rewriteStyleId);

    await db
      .update(aiSourceSites)
      .set({
        lastRunAt: new Date(),
        lastDiscoveredCount: 0,
        lastCreatedCount: 0,
        lastSkippedCount: 0,
        lastRunDetails: JSON.stringify({
          runAt: new Date().toISOString(),
          queued: true,
          message: "来源站抓取已进入后台队列",
        }),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(aiSourceSites.id, id));

    await enqueueAiSourceSiteBackgroundJob({
      sourceSiteId: site.id,
      siteName: site.name,
    });
    revalidateAiTaskPages();

    return {
      data: {
        queued: true,
        discoveredCount: 0,
        createdCount: 0,
        skippedCount: 0,
        discoveredUrls: [],
        skippedUrls: [],
        tasks: [],
      },
    };
  } catch (error) {
    console.error("执行来源站抓取失败:", error);
    await db
      .update(aiSourceSites)
      .set({
        lastRunAt: new Date(),
        lastError: getErrorMessage(error),
        lastRunDetails: JSON.stringify({
          runAt: new Date().toISOString(),
          error: getErrorMessage(error),
        }),
        updatedAt: new Date(),
      })
      .where(eq(aiSourceSites.id, id));
    revalidateAiTaskPages();
    return { error: getErrorMessage(error) };
  }
}
