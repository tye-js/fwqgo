import { inArray } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { readDb } from "@fwqgo/db";
import { categories, tags } from "@fwqgo/db/schema";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import {
  isPublicCategoryIndexable,
  isPublicTagIndexable,
} from "@fwqgo/core/public-content-policy";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { readPublicTaxonomyPostCounts } from "@/server/posts/public-taxonomy-post-counts";

// Exact, reviewed entity identities, in editorial priority order. Counts always
// cover the full public corpus for the requested language, never the home feed.
const REGION_CANDIDATES = [
  { slug: "hk-vps", zh: "中国香港", en: "Hong Kong, China" },
  { slug: "usa-vps", zh: "美国", en: "United States" },
  { slug: "jp-vps", zh: "日本", en: "Japan" },
  { slug: "kr-vps", zh: "韩国", en: "South Korea" },
  { slug: "fuwuqi", zh: "中国内地", en: "Chinese mainland" },
] as const;
const LINE_CANDIDATES = ["cn2-gia", "cmi", "cmin2", "as9929"];

export type HomepageTopic = { label: string; href: string };
export type HomepageTopics = {
  regions: HomepageTopic[];
  lines: HomepageTopic[];
};

export async function getHomepageTopics(
  language: "zh" | "en",
): Promise<HomepageTopics> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(
    cacheTags.homepage,
    cacheTags.posts,
    cacheTags.categories,
    cacheTags.tags,
  );

  const [regionRows, lineRows] = await Promise.all([
    readDb
      .select({
        id: categories.id,
        slug: categories.slug,
        enSlug: categories.enSlug,
      })
      .from(categories)
      .where(
        inArray(
          categories.slug,
          REGION_CANDIDATES.map(({ slug }) => slug),
        ),
      ),
    readDb
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        enName: tags.enName,
        enSlug: tags.enSlug,
        indexable: tags.indexable,
      })
      .from(tags)
      .where(inArray(tags.slug, LINE_CANDIDATES)),
  ]);
  const counts = await readPublicTaxonomyPostCounts({
    language,
    categoryIds: regionRows.map(({ id }) => id),
    tagIds: lineRows.map(({ id }) => id),
  });
  const prefix = language === "en" ? "/en" : "";
  const regions = REGION_CANDIDATES.flatMap((candidate) => {
    const row = regionRows.find(({ slug }) => slug === candidate.slug);
    if (!row || !isPublicCategoryIndexable(counts.categories.get(row.id) ?? 0))
      return [];
    const englishSlug = row.enSlug?.trim();
    const slug =
      language === "en" && englishSlug ? englishSlug : row.slug.trim();
    if (!slug) return [];
    return [
      {
        label: candidate[language],
        href: `${prefix}/fwq/${encodeURIComponent(slug)}/page/1`,
      },
    ];
  }).slice(0, 4);
  const lines = LINE_CANDIDATES.flatMap((candidate) => {
    const row = lineRows.find(({ slug }) => slug === candidate);
    if (
      !row ||
      !isPublicTagIndexable({
        indexable: row.indexable,
        publishedPostCount: counts.tags.get(row.id) ?? 0,
      })
    )
      return [];
    const identity = language === "en" ? resolveEnglishTagIdentity(row) : row;
    if (!identity?.slug.trim() || !identity.name.trim()) return [];
    return [
      {
        label: identity.name,
        href: `${prefix}/fwq/tags/${encodeURIComponent(identity.slug)}/page/1`,
      },
    ];
  }).slice(0, 3);
  return { regions, lines };
}
