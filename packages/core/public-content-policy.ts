export const PUBLIC_ARTICLE_PAGE_SIZE = 10;
export const MIN_PUBLIC_ARTICLE_CONTENT_LENGTH = 200;
export const MIN_INDEXABLE_TAXONOMY_POSTS = 3;

export type CanonicalPageNumber = {
  value: number;
  canonical: boolean;
};

export function parsePublicPageNumber(
  rawValue: string | string[] | number | null | undefined,
): CanonicalPageNumber | null {
  const raw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0
      ? { value: raw, canonical: true }
      : null;
  }

  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) return null;

  return { value, canonical: raw === String(value) };
}

export function getPublicPageCount(
  totalItems: number,
  pageSize = PUBLIC_ARTICLE_PAGE_SIZE,
) {
  if (!Number.isFinite(totalItems) || totalItems <= 0) return 0;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) return 0;
  return Math.ceil(totalItems / pageSize);
}

export function isPublicPageInRange(page: number, totalItems: number) {
  if (!Number.isSafeInteger(page) || page < 1) return false;
  return page <= Math.max(getPublicPageCount(totalItems), 1);
}

export function isPublicCategoryIndexable(publishedPostCount: number) {
  return publishedPostCount >= MIN_INDEXABLE_TAXONOMY_POSTS;
}

export function isPublicTagIndexable(input: {
  indexable: boolean | null | undefined;
  publishedPostCount: number;
}) {
  return (
    Boolean(input.indexable) &&
    input.publishedPostCount >= MIN_INDEXABLE_TAXONOMY_POSTS
  );
}

export function isPublicTaxonomyPageIndexable(input: {
  explicitlyIndexable?: boolean;
  publishedPostCount: number;
  page: number;
}) {
  const taxonomyIsIndexable =
    input.explicitlyIndexable === undefined
      ? isPublicCategoryIndexable(input.publishedPostCount)
      : isPublicTagIndexable({
          indexable: input.explicitlyIndexable,
          publishedPostCount: input.publishedPostCount,
        });

  return (
    taxonomyIsIndexable &&
    input.page === 1 &&
    input.page <= getPublicPageCount(input.publishedPostCount)
  );
}

export function publicTaxonomyAlternates(input: {
  baseUrl: string;
  kind: "category" | "tag";
  zhSlug: string;
  enSlug: string | null | undefined;
  zhPublishedPostCount: number;
  enPublishedPostCount: number;
  explicitlyIndexable?: boolean;
  page: number;
}) {
  const eligible = (publishedPostCount: number) =>
    isPublicTaxonomyPageIndexable({
      publishedPostCount,
      explicitlyIndexable: input.explicitlyIndexable,
      page: input.page,
    });
  const path = input.kind === "tag" ? "/fwq/tags" : "/fwq";
  const zh = `${input.baseUrl}${path}/${encodeURIComponent(input.zhSlug)}/page/${input.page}`;
  const en = input.enSlug
    ? `${input.baseUrl}/en${path}/${encodeURIComponent(input.enSlug)}/page/${input.page}`
    : null;
  // Emit a pair only when both pages qualify; this keeps head and sitemap
  // reciprocal and prevents an indexable page advertising a noindex sibling.
  if (
    !en ||
    !eligible(input.zhPublishedPostCount) ||
    !eligible(input.enPublishedPostCount)
  ) {
    return undefined;
  }
  return { "zh-CN": zh, en, "x-default": zh };
}

export function isPublicArticleSourceRenderable(input: {
  title: string | null | undefined;
  slug: string | null | undefined;
  content: string | null | undefined;
}) {
  return (
    Boolean(input.title?.trim()) &&
    Boolean(input.slug?.trim()) &&
    Array.from(input.content?.trim() ?? "").length >=
      MIN_PUBLIC_ARTICLE_CONTENT_LENGTH
  );
}
