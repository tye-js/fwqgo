import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { decodeSlug } from "@fwqgo/core/utils";
import {
  getPublicPageCount,
  isPublicTaxonomyPageIndexable,
  parsePublicPageNumber,
  publicTaxonomyAlternates,
} from "@fwqgo/core/public-content-policy";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { getCategoryBySlug } from "@/features/shared/data/category";
import { getTagBySlug } from "@/features/public/data/tag";
import { getPostsWithTagsByTagSlug } from "@/features/public/data/tag";
import { getPostsWithTagsByCategoryId } from "@/features/public/data/post";

type Language = "zh" | "en";

function resolvePage(pageNo: string, count: number) {
  const page = parsePublicPageNumber(pageNo);
  if (!page || page.value > getPublicPageCount(count)) notFound();
  return page;
}

export const resolveCategoryPage = cache(
  async (slug: string, pageNo: string, language: Language) => {
    const { data: category, error } = await getCategoryBySlug(
      decodeSlug(slug),
      language,
    );
    if (error) throw new Error(error);
    if (!category) notFound();
    const page = resolvePage(pageNo, category.publishedPostCount);
    const canonicalPath = `${language === "en" ? "/en" : ""}/fwq/${encodeURIComponent(category.slug)}/page/${page.value}`;
    if (!page.canonical || decodeSlug(slug) !== category.slug)
      permanentRedirect(canonicalPath);
    // Metadata waits for the whole listing, so a core query failure cannot be
    // streamed underneath successful indexable metadata.
    await getPostsWithTagsByCategoryId(category.id, page.value, language);
    return {
      taxonomy: category,
      pageNo: page.value,
      totalCount: category.publishedPostCount,
      totalPage: getPublicPageCount(category.publishedPostCount),
    };
  },
);

export const resolveTagPage = cache(
  async (slug: string, pageNo: string, language: Language) => {
    const { data: tag, error } = await getTagBySlug(decodeSlug(slug), language);
    if (error) throw new Error(error);
    if (!tag) notFound();
    const page = resolvePage(pageNo, tag.publishedPostCount);
    const canonicalPath = `${language === "en" ? "/en" : ""}/fwq/tags/${encodeURIComponent(tag.slug)}/page/${page.value}`;
    if (!page.canonical || decodeSlug(slug) !== tag.slug)
      permanentRedirect(canonicalPath);
    await getPostsWithTagsByTagSlug(tag.slug, page.value, language);
    return {
      taxonomy: tag,
      pageNo: page.value,
      totalCount: tag.publishedPostCount,
      totalPage: getPublicPageCount(tag.publishedPostCount),
    };
  },
);

export function taxonomyPageMetadata(input: {
  kind: "category" | "tag";
  language: Language;
  pageNo: number;
  taxonomy: {
    name: string;
    slug: string;
    zhSlug: string;
    enName?: string | null;
    enSlug?: string | null;
    description: string | null;
    keywords: string | null;
    indexable?: boolean;
    publishedPostCount: number;
    zhPublishedPostCount: number;
    enPublishedPostCount: number;
  };
}): Metadata {
  const { taxonomy, kind, language, pageNo } = input;
  const baseUrl = (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
  const segment = kind === "tag" ? "/fwq/tags" : "/fwq";
  const canonical = `${baseUrl}${language === "en" ? "/en" : ""}${segment}/${encodeURIComponent(taxonomy.slug)}/page/${pageNo}`;
  const title = `${taxonomy.name} - ${language === "en" ? "fwqgo" : "服务器go"}`;
  const description = taxonomy.description?.trim()
    ? taxonomy.description
    : language === "en"
      ? `Server deals, reviews and buying guides about ${taxonomy.name}.`
      : `${taxonomy.name}相关的服务器优惠、评测与选购文章。`;
  const enSlug =
    kind === "tag"
      ? resolveEnglishTagIdentity({ ...taxonomy, slug: taxonomy.zhSlug })?.slug
      : taxonomy.enSlug?.trim()
        ? taxonomy.enSlug.trim()
        : taxonomy.zhSlug;
  return {
    title,
    description,
    keywords: taxonomy.keywords ?? undefined,
    robots: {
      index: isPublicTaxonomyPageIndexable({
        publishedPostCount: taxonomy.publishedPostCount,
        explicitlyIndexable: kind === "tag" ? taxonomy.indexable : undefined,
        page: pageNo,
      }),
      follow: true,
    },
    alternates: {
      canonical,
      languages: publicTaxonomyAlternates({
        baseUrl,
        kind,
        zhSlug: taxonomy.zhSlug,
        enSlug,
        zhPublishedPostCount: taxonomy.zhPublishedPostCount,
        enPublishedPostCount: taxonomy.enPublishedPostCount,
        explicitlyIndexable: kind === "tag" ? taxonomy.indexable : undefined,
        page: pageNo,
      }),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: language === "en" ? "fwqgo" : "服务器go",
    },
  };
}
