"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { categories } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

function normalizeSeoKeywords(value: string) {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(",");
}

function textOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function updateCategorySeo(input: {
  id: number;
  description: string;
  keywords: string;
  enName?: string;
  enSlug?: string;
  enDescription?: string;
  enKeywords?: string;
}) {
  try {
    await requireAdminSession();

    if (!Number.isInteger(input.id) || input.id <= 0) {
      return { error: "分类 ID 不正确" };
    }

    const [category] = await db
      .update(categories)
      .set({
        description: textOrNull(input.description),
        keywords: textOrNull(normalizeSeoKeywords(input.keywords)),
        enName: textOrNull(input.enName),
        enSlug: textOrNull(input.enSlug),
        enDescription: textOrNull(input.enDescription),
        enKeywords: textOrNull(normalizeSeoKeywords(input.enKeywords ?? "")),
        updatedAt: new Date(),
      })
      .where(eq(categories.id, input.id))
      .returning({
        id: categories.id,
        slug: categories.slug,
        enName: categories.enName,
        enSlug: categories.enSlug,
        description: categories.description,
        keywords: categories.keywords,
        enDescription: categories.enDescription,
        enKeywords: categories.enKeywords,
      });

    if (!category) {
      return { error: "分类不存在" };
    }

    revalidateSiteContent([
      cacheTags.categories,
      cacheTags.category(category.id),
      cacheTags.categorySlug(category.slug),
    ]);
    revalidatePath("/seo");
    revalidatePath("/seo/category");

    return { data: category };
  } catch (error) {
    console.error("更新分类 SEO 失败:", error);
    return {
      error: "更新分类 SEO 失败",
      message: getErrorMessage(error),
    };
  }
}
