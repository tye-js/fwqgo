import {
  publicArticleCategoryDescription,
  publicArticleCategoryName,
  type PublicArticleCategoryLanguage,
} from "@/features/shared/lib/public-article-category";

export type PublicNavigationLanguage = PublicArticleCategoryLanguage;

export type ArticleNavigationSource = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  enName: string | null;
  enSlug: string | null;
  enDescription: string | null;
  zhPublishedPostCount: number;
  enPublishedPostCount: number;
};

export type ArticleNavigationItem = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
};

const categoryPriority = [
  "ddos-vps",
  "export-vps",
  "isp-vps",
  "cheap-vps",
  "hk-vps",
  "usa-vps",
  "jp-vps",
  "kr-vps",
  "unlimited-traffic-vps",
  "large-bandwidth-vps",
  "free-vps",
  "fuwuqi",
  "zztj",
] as const;

const categoryPriorityBySlug: ReadonlyMap<string, number> = new Map(
  categoryPriority.map((slug, index) => [slug, index]),
);

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function publishedCount(
  category: ArticleNavigationSource,
  language: PublicNavigationLanguage,
) {
  return language === "en"
    ? category.enPublishedPostCount
    : category.zhPublishedPostCount;
}

export function buildArticleNavigation(
  categories: ArticleNavigationSource[],
  language: PublicNavigationLanguage,
): ArticleNavigationItem[] {
  return categories
    .filter((category) => publishedCount(category, language) > 0)
    .map((category) => ({
      id: category.id,
      name: publicArticleCategoryName(category, language),
      slug:
        language === "en"
          ? nonEmptyTrim(category.enSlug) ?? category.slug
          : category.slug,
      description: publicArticleCategoryDescription(category, language),
      canonicalSlug: category.slug,
    }))
    .sort((left, right) => {
      const leftPriority =
        categoryPriorityBySlug.get(left.canonicalSlug) ??
        categoryPriority.length;
      const rightPriority =
        categoryPriorityBySlug.get(right.canonicalSlug) ??
        categoryPriority.length;
      return leftPriority - rightPriority || left.id - right.id;
    })
    .map(({ canonicalSlug: _canonicalSlug, ...category }) => category);
}
