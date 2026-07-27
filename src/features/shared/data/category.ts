"use server";

import { readDb } from "@fwqgo/db";
import { categories, posts } from "@fwqgo/db/schema";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import {
  publicArticleCategoryDescription,
  publicArticleCategoryName,
} from "@/features/shared/lib/public-article-category";
import { asc, eq, isNull, or, sql } from "drizzle-orm";

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
      zhSlug: category.slug,
      name: publicArticleCategoryName(category, language),
      slug: nonEmptyTrim(category.enSlug) ?? category.slug,
      description: publicArticleCategoryDescription(category, language),
      keywords: nonEmptyTrim(category.enKeywords) ?? category.keywords,
    };
  }

  return {
    ...category,
    name: publicArticleCategoryName(category, language),
    description: publicArticleCategoryDescription(category, language),
  };
}

export async function getCategories() {
  "use cache";
  tagCache(cacheTags.categories);

  try {
    const categoriesWithChildren = await readDb.query.categories.findMany({
      where: isNull(categories.parentId),
      orderBy: asc(categories.id),
      with: {
        children: {
          orderBy: asc(categories.id),
        },
      },
    });

    return { data: categoriesWithChildren };
  } catch (error) {
    return { error: "获取分类列表失败", message: error };
  }
}

export async function getNavigationCategories() {
  "use cache";
  tagCache(cacheTags.categories, cacheTags.posts);

  try {
    const rows = await readDb
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        enName: categories.enName,
        enSlug: categories.enSlug,
        enDescription: categories.enDescription,
        parentId: categories.parentId,
        zhPublishedPostCount: sql<number>`count(${posts.id}) filter (where ${posts.published} = true and ${posts.language} = 'zh')::int`,
        enPublishedPostCount: sql<number>`count(${posts.id}) filter (where ${posts.published} = true and ${posts.language} = 'en')::int`,
      })
      .from(categories)
      .leftJoin(posts, eq(posts.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.id));

    const parentIds = new Set(
      rows
        .map((category) => category.parentId)
        .filter((id): id is number => id !== null),
    );

    return {
      data: rows
        .filter((category) => !parentIds.has(category.id))
        .map(({ parentId: _parentId, ...category }) => category),
    };
  } catch (error) {
    console.error("Failed to load navigation categories:", error);
    return { error: "获取导航分类失败" };
  }
}

export async function getCategoryBySlug(
  slug: string,
  language: PublicLanguage = "zh",
) {
  "use cache";
  tagCache(cacheTags.categories, cacheTags.categorySlug(slug));

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
    console.error("Failed to load public category:", error);
    return { error: "获取分类失败" };
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

export async function getLeafCategories(language: PublicLanguage = "zh") {
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
        name:
          language === "en"
            ? (nonEmptyTrim(cat.enName) ??
              (/\p{Script=Han}/u.test(cat.name)
                ? `未配置英文分类 · ${nonEmptyTrim(cat.enSlug) ?? cat.slug}`
                : cat.name))
            : cat.name,
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
