"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { generateCategorySeoMetadata } from "@fwqgo/ai/category-seo-generator";
import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import { categories } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

const updateCategorySeoSchema = z.object({
  id: z.number().int().positive("分类 ID 不正确"),
  description: z.string().trim().max(800, "中文描述不能超过800个字符"),
  keywords: z.string().trim().max(800, "中文关键词不能超过800个字符"),
  enName: z.string().trim().max(120, "英文分类名不能超过120个字符").optional(),
  enSlug: z.string().trim().max(180, "英文 slug 不能超过180个字符").optional(),
  enDescription: z
    .string()
    .trim()
    .max(800, "英文描述不能超过800个字符")
    .optional(),
  enKeywords: z
    .string()
    .trim()
    .max(800, "英文关键词不能超过800个字符")
    .optional(),
});

const generateCategorySeoSchema = z.object({
  id: z.number().int().positive("分类 ID 不正确"),
});

const batchGenerateCategorySeoSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1, "请先选择要生成的分类")
    .max(20, "一次最多批量生成 20 个分类"),
});

type CategorySeoResultRow = {
  id: number;
  name: string;
  slug: string;
  enName: string | null;
  enSlug: string | null;
  description: string | null;
  keywords: string | null;
  enDescription: string | null;
  enKeywords: string | null;
};

type CategorySeoActionResult = {
  data?: CategorySeoResultRow;
  error?: string;
  message?: string;
};

type CategorySeoBatchActionResult = {
  data?: {
    updated: CategorySeoResultRow[];
    errors: Array<{ id: number; name?: string; reason: string }>;
  };
  error?: string;
  message?: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "输入信息不正确";
  }

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

function normalizeOptionalSlug(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = slugify(trimmed);
  return normalized || null;
}

async function hasEnSlugConflict(enSlug: string, categoryId: number) {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.enSlug, enSlug), ne(categories.id, categoryId)))
    .limit(1);

  return Boolean(existing);
}

async function makeUniqueEnSlug(enSlug: string, categoryId: number) {
  const baseSlug =
    enSlug
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || `category-${categoryId}`;

  let candidate = baseSlug;
  let suffix = 2;

  while (await hasEnSlugConflict(candidate, categoryId)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;

    if (suffix > 50) {
      candidate = `${baseSlug}-${categoryId}`;
      break;
    }
  }

  return candidate;
}

function revalidateCategorySeoPages(category: {
  id: number;
  slug: string;
  enSlug: string | null;
  previousEnSlug?: string | null;
}) {
  revalidateSiteContent([
    cacheTags.categories,
    cacheTags.category(category.id),
    cacheTags.categorySlug(category.slug),
    ...(category.enSlug ? [cacheTags.categorySlug(category.enSlug)] : []),
    ...(category.previousEnSlug && category.previousEnSlug !== category.enSlug
      ? [cacheTags.categorySlug(category.previousEnSlug)]
      : []),
  ]);
  revalidatePath("/seo");
  revalidatePath("/seo/category");
}

async function saveCategorySeo(
  input: z.infer<typeof updateCategorySeoSchema>,
  options: { makeEnSlugUnique?: boolean } = {},
): Promise<CategorySeoActionResult> {
  const [currentCategory] = await db
    .select({
      slug: categories.slug,
      enSlug: categories.enSlug,
    })
    .from(categories)
    .where(eq(categories.id, input.id))
    .limit(1);

  if (!currentCategory) {
    return { error: "分类不存在" };
  }

  let normalizedEnSlug = normalizeOptionalSlug(input.enSlug);

  if (normalizedEnSlug) {
    if (options.makeEnSlugUnique) {
      normalizedEnSlug = await makeUniqueEnSlug(normalizedEnSlug, input.id);
    } else if (await hasEnSlugConflict(normalizedEnSlug, input.id)) {
      return {
        error: "英文 slug 已被其他分类使用",
        message: `${normalizedEnSlug} 已存在，请换一个英文 slug`,
      };
    }
  }

  const [category] = await db
    .update(categories)
    .set({
      description: textOrNull(input.description),
      keywords: textOrNull(normalizeSeoKeywords(input.keywords)),
      enName: textOrNull(input.enName),
      enSlug: normalizedEnSlug,
      enDescription: textOrNull(input.enDescription),
      enKeywords: textOrNull(normalizeSeoKeywords(input.enKeywords ?? "")),
      updatedAt: new Date(),
    })
    .where(eq(categories.id, input.id))
    .returning({
      id: categories.id,
      name: categories.name,
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

  revalidateCategorySeoPages({
    id: category.id,
    slug: category.slug,
    enSlug: category.enSlug,
    previousEnSlug: currentCategory.enSlug,
  });
  await notifyPublicWebCache("taxonomy.changed", {
    categoryIds: [category.id],
  });

  return { data: category };
}

async function getCategoryForSeoGeneration(id: number) {
  const [category] = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      enName: categories.enName,
      enSlug: categories.enSlug,
      description: categories.description,
      keywords: categories.keywords,
      enDescription: categories.enDescription,
      enKeywords: categories.enKeywords,
    })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  return category ?? null;
}

async function generateAndSaveCategorySeo(
  category: NonNullable<
    Awaited<ReturnType<typeof getCategoryForSeoGeneration>>
  >,
) {
  const generated = await generateCategorySeoMetadata({
    name: category.name,
    slug: category.slug,
    description: category.description,
    keywords: category.keywords,
    enName: category.enName,
    enSlug: category.enSlug,
    enDescription: category.enDescription,
    enKeywords: category.enKeywords,
  });

  return saveCategorySeo(
    {
      id: category.id,
      description: generated.description,
      keywords: generated.keywords.join(","),
      enName: generated.enName,
      enSlug: generated.enSlug,
      enDescription: generated.enDescription,
      enKeywords: generated.enKeywords.join(","),
    },
    { makeEnSlugUnique: true },
  );
}

export async function updateCategorySeo(
  input: z.infer<typeof updateCategorySeoSchema>,
): Promise<CategorySeoActionResult> {
  try {
    await requireAdminSession();
    return saveCategorySeo(updateCategorySeoSchema.parse(input));
  } catch (error) {
    console.error("更新分类 SEO 失败:", error);
    return {
      error: "更新分类 SEO 失败",
      message: getErrorMessage(error),
    };
  }
}

export async function generateCategorySeoWithAi(
  input: z.infer<typeof generateCategorySeoSchema>,
): Promise<CategorySeoActionResult> {
  try {
    await requireAdminSession();
    const result = generateCategorySeoSchema.parse(input);
    const category = await getCategoryForSeoGeneration(result.id);

    if (!category) {
      return { error: "分类不存在" };
    }

    return generateAndSaveCategorySeo(category);
  } catch (error) {
    console.error("AI 生成分类 SEO 失败:", error);
    return {
      error: "AI 生成分类 SEO 失败",
      message: getErrorMessage(error),
    };
  }
}

export async function batchGenerateCategorySeoWithAi(
  input: z.infer<typeof batchGenerateCategorySeoSchema>,
): Promise<CategorySeoBatchActionResult> {
  try {
    await requireAdminSession();
    const result = batchGenerateCategorySeoSchema.parse(input);
    const ids = [...new Set(result.ids)];
    const categoryRows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        enName: categories.enName,
        enSlug: categories.enSlug,
        description: categories.description,
        keywords: categories.keywords,
        enDescription: categories.enDescription,
        enKeywords: categories.enKeywords,
      })
      .from(categories)
      .where(inArray(categories.id, ids));
    const categoriesById = new Map(
      categoryRows.map((category) => [category.id, category]),
    );
    const updated: CategorySeoResultRow[] = [];
    const errors: Array<{ id: number; name?: string; reason: string }> = [];

    for (const id of ids) {
      const category = categoriesById.get(id);

      if (!category) {
        errors.push({ id, reason: "分类不存在" });
        continue;
      }

      try {
        const generated = await generateAndSaveCategorySeo(category);

        if (generated.error || !generated.data) {
          errors.push({
            id,
            name: category.name,
            reason: generated.message ?? generated.error ?? "生成失败",
          });
          continue;
        }

        updated.push(generated.data);
      } catch (error) {
        errors.push({
          id,
          name: category.name,
          reason: getErrorMessage(error),
        });
      }
    }

    if (updated.length === 0) {
      return {
        error: "批量生成未更新任何分类",
        message:
          errors
            .slice(0, 3)
            .map((item) => `${item.name ?? item.id}: ${item.reason}`)
            .join("；") || "请检查 AI 配置后重试",
        data: { updated, errors },
      };
    }

    return {
      data: { updated, errors },
      message:
        errors.length > 0
          ? `已生成 ${updated.length} 个，失败 ${errors.length} 个`
          : `已生成 ${updated.length} 个分类 SEO`,
    };
  } catch (error) {
    console.error("批量 AI 生成分类 SEO 失败:", error);
    return {
      error: "批量 AI 生成分类 SEO 失败",
      message: getErrorMessage(error),
    };
  }
}
