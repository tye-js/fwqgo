"use server";

import { readDb } from "@fwqgo/db";
import { categories } from "@fwqgo/db/schema";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { asc, eq, isNull, or } from "drizzle-orm";

type PublicLanguage = "zh" | "en";

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function localizeCategory<
  T extends {
    name: string;
    slug: string;
    description: string | null;
    keywords: string | null;
    enName?: string | null;
    enSlug?: string | null;
    enDescription?: string | null;
    enKeywords?: string | null;
  },
>(category: T, language: PublicLanguage) {
  if (language === "en") {
    return {
      ...category,
      name: nonEmptyTrim(category.enName) ?? category.name,
      slug: nonEmptyTrim(category.enSlug) ?? category.slug,
      description:
        nonEmptyTrim(category.enDescription) ?? category.description,
      keywords: nonEmptyTrim(category.enKeywords) ?? category.keywords,
    };
  }

  return category;
}

export async function getCategories() {
  "use cache";
  tagCache(cacheTags.categories);

  try {
    const categoriesWithChildren = await readDb.query.categories.findMany({
      where: isNull(categories.parentId),
      orderBy: asc(categories.id),
      with: { children: true },
    });

    return { data: categoriesWithChildren };
  } catch (error) {
    return { error: "获取分类列表失败", message: error };
  }
}

export async function getCategoryBySlug(
  slug: string,
  language: PublicLanguage = "zh",
) {
  try {
    const [category] = await readDb
      .select()
      .from(categories)
      .where(
        language === "en"
          ? or(eq(categories.enSlug, slug), eq(categories.slug, slug))
          : eq(categories.slug, slug),
      )
      .limit(1);

    return { data: category ? localizeCategory(category, language) : null };
  } catch (error) {
    return { error: "获取分类失败", message: error };
  }
}

export async function getAllCategories() {
  try {
    const categoriesData = await readDb
      .select({
        id: categories.id,
        name: categories.name,
      })
      .from(categories)
      .orderBy(asc(categories.id));

    return { data: categoriesData };
  } catch (error) {
    return { error: "获取全部分类列表失败", message: error };
  }
}

export async function getLeafCategories() {
  try {
    // 获取所有分类
    const allCategories = await readDb.select().from(categories);

    // 找出所有有子分类的分类ID
    const parentIds = new Set(
      allCategories
        .filter((cat) => cat.parentId !== null)
        .map((cat) => cat.parentId),
    );

    // 过滤出叶子分类（没有子分类的分类）
    const leafCategories = allCategories
      .filter((cat) => !parentIds.has(cat.id))
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
      }))
      .sort((a, b) => a.id - b.id);

    return { data: leafCategories };
  } catch (error) {
    return { error: "获取叶子分类列表失败", message: error };
  }
}

export async function getLeafCategoriesAllData() {
  try {
    // 获取所有分类
    const allCategories = await readDb.select().from(categories);

    // 找出所有有子分类的分类ID
    const parentIds = new Set(
      allCategories
        .filter((cat) => cat.parentId !== null)
        .map((cat) => cat.parentId),
    );

    // 过滤出叶子分类（没有子分类的分类）
    const leafCategories = allCategories
      .filter((cat) => !parentIds.has(cat.id))
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        enName: cat.enName,
        enSlug: cat.enSlug,
        description: cat.description,
        keywords: cat.keywords,
        enDescription: cat.enDescription,
        enKeywords: cat.enKeywords,
      }))
      .sort((a, b) => a.id - b.id);

    return { data: leafCategories };
  } catch (error) {
    return { error: "获取叶子分类列表失败", message: error };
  }
}
