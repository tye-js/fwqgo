"use server";

import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { eq, asc } from "drizzle-orm";

export async function getCategories() {
  "use cache";
  try {
    const categoriesWithChildren = await db.query.categories.findMany({
      where: eq(categories.parentId, 0), // 只查询顶级分类
      orderBy: asc(categories.id),
      with: {
        children: true, // 自动获取子分类
      },
    });

    return { data: categoriesWithChildren };
  } catch (error) {
    return { error: "获取分类列表失败", message: error };
  }
}

export async function getCategoryBySlug(slug: string) {
  "use cache";

  try {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    return { data: category ?? null };
  } catch (error) {
    return { error: "获取分类失败", message: error };
  }
}

export async function getAllCategories() {
  try {
    const categoriesData = await db
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
    const allCategories = await db.select().from(categories);

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
    const allCategories = await db.select().from(categories);

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
        description: cat.description,
        keywords: cat.keywords,
      }))
      .sort((a, b) => a.id - b.id);

    return { data: leafCategories };
  } catch (error) {
    return { error: "获取叶子分类列表失败", message: error };
  }
}
