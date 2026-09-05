export type KnowledgeIndexLanguage = "zh" | "en";

export const KNOWLEDGE_PAGE_SIZE = 18;
export const KNOWLEDGE_INDEX_VARIANT = "index";
export const KNOWLEDGE_INDEX_BUILD_PLACEHOLDER =
  "__fwqgo_knowledge_static_shell__";

const indexParameters = ["q", "category", "page"] as const;

export function knowledgeIndexPath(language: KnowledgeIndexLanguage) {
  return language === "en" ? "/en/knowledge" : "/knowledge";
}

export function knowledgeIndexRenderPath(language: KnowledgeIndexLanguage) {
  return `${knowledgeIndexPath(language)}/index-render/${KNOWLEDGE_INDEX_VARIANT}`;
}

/** Keep the existing public URL while separating its static and search routes. */
export function getKnowledgeIndexRewritePath(
  url: Pick<URL, "pathname" | "searchParams">,
) {
  const language =
    url.pathname === "/knowledge"
      ? "zh"
      : url.pathname === "/en/knowledge"
        ? "en"
        : null;
  if (!language || indexParameters.some((key) => url.searchParams.has(key))) {
    return null;
  }
  return knowledgeIndexRenderPath(language);
}

/** Render routes are implementation details and must never be public aliases. */
export function isKnowledgeIndexRenderPath(pathname: string) {
  try {
    return /^\/(?:en\/)?knowledge\/index-render(?:\/|$)/.test(
      decodeURIComponent(pathname),
    );
  } catch {
    return false;
  }
}

export function normalizeKnowledgeQuery(input: {
  language: KnowledgeIndexLanguage;
  query?: string;
  categorySlug?: string;
  page?: number;
}) {
  return {
    language: input.language,
    query: input.query?.trim().slice(0, 120) ?? "",
    categorySlug: input.categorySlug?.trim().slice(0, 160) ?? "",
    page:
      Number.isSafeInteger(input.page) && (input.page ?? 0) > 0
        ? input.page!
        : 1,
  };
}

type KnowledgeCategoryCount = {
  id: number;
  slug: string;
  enSlug: string | null;
  zhArticleCount: number;
  enArticleCount: number;
};

/** Resolve real category IDs and clamp pages before admitting a cache key. */
export function resolveKnowledgeBrowsePage(
  categories: readonly KnowledgeCategoryCount[],
  input: ReturnType<typeof normalizeKnowledgeQuery>,
) {
  const category = input.categorySlug
    ? categories.find(
        (item) =>
          (input.language === "en" ? item.enSlug : item.slug) ===
          input.categorySlug,
      )
    : undefined;
  if (input.categorySlug && !category) return null;

  const countKey =
    input.language === "en" ? "enArticleCount" : "zhArticleCount";
  const total = category
    ? category[countKey]
    : categories.reduce((sum, item) => sum + item[countKey], 0);
  const totalPages = Math.max(1, Math.ceil(total / KNOWLEDGE_PAGE_SIZE));
  return {
    categoryId: category?.id ?? null,
    total,
    totalPages,
    page: Math.min(input.page, totalPages),
  };
}
