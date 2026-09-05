import { inArray, or } from "drizzle-orm";

import {
  getPublicCacheEventTargets,
  type PublicCacheEvent,
  type PublicCacheEventPayload,
} from "@fwqgo/cache/tags";
import { readDb } from "@fwqgo/db";
import { posts, publicSlugRedirects } from "@fwqgo/db/schema";

/** Optional URL purging; never performs a zone-wide purge. */
export async function purgePublicEdgeCache(
  event: PublicCacheEvent,
  payload: PublicCacheEventPayload,
) {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const token = process.env.CLOUDFLARE_CACHE_PURGE_TOKEN?.trim();
  if (!zoneId || !token) return { configured: false, purgedUrls: 0 };
  if (!/^[a-f0-9]{32}$/i.test(zoneId))
    throw new Error("Cloudflare 缓存清理的 Zone ID 格式不正确");

  const baseUrl = (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
  const paths = new Set(getPublicCacheEventTargets(event, payload).paths);
  // Taxonomy, knowledge links and inventory are embedded in cached article HTML.
  // Purge article documents when those shared dependencies change as well.
  const sharedArticleEvent = [
    "post.changed",
    "taxonomy.changed",
    "knowledge.changed",
    "offer.changed",
    "seo.changed",
    "homepage.changed",
  ].includes(event);
  const postIds = [...new Set(payload.postIds ?? [])];
  const rows =
    sharedArticleEvent || postIds.length > 0
      ? await readDb
          .select({ id: posts.id, slug: posts.slug, language: posts.language })
          .from(posts)
          .where(
            sharedArticleEvent
              ? undefined
              : or(
                  inArray(posts.id, postIds),
                  inArray(posts.translationSourcePostId, postIds),
                ),
          )
      : [];
  for (const post of rows) {
    paths.add(
      `${post.language === "en" ? "/en" : ""}/fwq/posts/${encodeURIComponent(post.slug)}`,
    );
  }
  const affectedIds = [
    ...new Set([...postIds, ...rows.map((post) => post.id)]),
  ];
  if (affectedIds.length > 0) {
    const aliases = await readDb
      .select({
        slug: publicSlugRedirects.oldSlug,
        language: publicSlugRedirects.language,
      })
      .from(publicSlugRedirects)
      .where(inArray(publicSlugRedirects.postId, affectedIds));
    for (const alias of aliases) {
      paths.add(
        `${alias.language === "en" ? "/en" : ""}/fwq/posts/${encodeURIComponent(alias.slug)}`,
      );
    }
  }
  const urls = [...paths]
    .filter(
      (path) =>
        path.startsWith("/") && !path.startsWith("//") && !path.includes("["),
    )
    .map((path) => new URL(path, baseUrl).href);
  let purgedUrls = 0;
  for (let offset = 0; offset < urls.length; offset += 30) {
    const files = urls.slice(offset, offset + 30);
    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ files }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );
      const result: unknown = await response.json();
      if (
        response.ok &&
        typeof result === "object" &&
        result !== null &&
        "success" in result &&
        result.success === true
      ) {
        success = true;
        break;
      }
      if (response.status !== 429 && response.status < 500) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    if (!success)
      throw new Error(
        `Cloudflare URL 缓存清理失败，已清理 ${purgedUrls}/${urls.length} 个 URL`,
      );
    purgedUrls += files.length;
  }
  return { configured: true, purgedUrls };
}
