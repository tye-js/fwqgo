import "server-only";

import { readDb } from "@fwqgo/db";
import { posts } from "@fwqgo/db/schema";
import { desc } from "drizzle-orm";
import { publicPostCondition } from "@/server/posts/public-post-policy";

export type PublicArticleLanguage = "zh" | "en";

/**
 * Cache Components requires at least one generated parameter. This value is
 * only used when the build cannot reach the database. Both route layers reject
 * it before data access, and the public proxy guarantees a real noindex 404.
 */
export const PUBLIC_ARTICLE_STATIC_PARAMS_PLACEHOLDER =
  "__fwqgo_article_static_shell__";

const DEFAULT_PRERENDER_LIMIT = 50;
const MAX_PRERENDER_LIMIT = 100;

function getPrerenderLimit() {
  const rawValue = process.env.PUBLIC_ARTICLE_PRERENDER_LIMIT?.trim() ?? "";
  if (!/^\d+$/.test(rawValue)) return DEFAULT_PRERENDER_LIMIT;
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return DEFAULT_PRERENDER_LIMIT;
  }

  return Math.min(parsed, MAX_PRERENDER_LIMIT);
}

export function isPublicArticleStaticParamsPlaceholder(value: string) {
  return value === PUBLIC_ARTICLE_STATIC_PARAMS_PLACEHOLDER;
}

/**
 * Pre-render a bounded hot set. Long-tail article slugs remain valid and are
 * generated on demand by Cache Components/ISR after their first request.
 */
export async function getPublicArticleStaticParams(
  language: PublicArticleLanguage,
) {
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    return [{ slug: PUBLIC_ARTICLE_STATIC_PARAMS_PLACEHOLDER }];
  }

  const limit = getPrerenderLimit();
  const latestLimit = Math.max(1, Math.ceil(limit / 2));

  try {
    const condition = publicPostCondition(language);
    const [latest, popular] = await Promise.all([
      readDb
        .select({ slug: posts.slug })
        .from(posts)
        .where(condition)
        .orderBy(desc(posts.createdAt), desc(posts.id))
        .limit(latestLimit),
      readDb
        .select({ slug: posts.slug })
        .from(posts)
        .where(condition)
        .orderBy(desc(posts.views), desc(posts.updatedAt), desc(posts.id))
        .limit(limit),
    ]);

    const slugs = [
      ...new Set(
        [...latest, ...popular].map((row) => row.slug.trim()).filter(Boolean),
      ),
    ].slice(0, limit);

    if (slugs.length > 0) {
      return slugs.map((slug) => ({ slug }));
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `Public ${language} article pre-render list unavailable; using a build placeholder: ${reason}`,
    );
  }

  // Keep the cacheComponents build contract valid in PR/local builds where
  // no production database is intentionally available.
  return [{ slug: PUBLIC_ARTICLE_STATIC_PARAMS_PLACEHOLDER }];
}
