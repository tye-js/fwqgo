"use server";

import { db } from "@/server/db";

export async function getCategories() {
  try {
    const categories = await db.category.findMany({
      where: {
        parentId: null, // 只查询顶级分类
      },
      include: {
        children: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    return { data: categories };
  } catch (error) {
    return { error: "获取分类列表失败", message: error };
  }
}

export async function getCategoryBySlug(slug: string) {
  try {
    const category = await db.category.findUnique({
      where: {
        slug,
      },
    });
    return { data: category };
  } catch (error) {
    return { error: "获取分类失败", message: error };
  }
}

export async function getAllCategories() {
  try {
    const categories = await db.category.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    return { data: categories };
  } catch (error) {
    return { error: "获取全部分类列表失败", message: error };
  }
}

export async function getLeafCategories() {
  try {
    const leafCategories = await db.category.findMany({
      select: {
        id: true,
        name: true,
      },
      where: {
        children: {
          none: {}, // 没有任何子分类的分类
        },
      },
      orderBy: {
        id: "asc",
      },
    });
    return { data: leafCategories };
  } catch (error) {
    return { error: "获取叶子分类列表失败", message: error };
  }
}
