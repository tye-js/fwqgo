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
    console.error("获取分类列表失败:", error);
    return { error: "获取分类列表失败" };
  }
}

export async function getCategoryBySlug(slug: string) {
  try {
    const category = await db.category.findFirst({
      where: {
        slug,
      },
    });
    return { data: category };
  } catch (error) {
    console.error("获取分类失败:", error);
    return { error: "获取分类失败" };
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
    console.error("获取全部分类列表失败:", error);
    return { error: "获取全部分类列表失败" };
  }
}
