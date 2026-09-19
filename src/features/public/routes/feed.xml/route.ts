import { unstable_cache } from "next/cache";
import { connection } from "next/server";

import { getPublishedPostsPage } from "@/features/public/data/post";
import { getSiteSeoConfig } from "@/features/shared/data/site-seo";
import { cacheTags } from "@fwqgo/cache/tags";
import { isDatabaseFreeBuild } from "@fwqgo/core/build-verification";

const FEED_ITEM_PAGES = [1, 2] as const;
const FEED_REVALIDATE_SECONDS = 60 * 30;
const FEED_ITEM_LIMIT = 20;

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * RFC 822 requires an explicit zone. `toUTCString` emits GMT, which is the
 * convention feed readers expect and avoids the UTC-stored-timestamp trap the
 * rest of the site works around for display dates.
 */
function toRfc822(value: Date | string | null | undefined) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toUTCString();
}

async function buildFeedXml() {
  const baseUrl = getBaseUrl();
  const feedUrl = `${baseUrl}/feed.xml`;
  const { data: seo } = await getSiteSeoConfig("zh");

  // A database-free verification build has no posts to publish; serve a valid
  // empty channel rather than failing the route.
  const pages = isDatabaseFreeBuild()
    ? []
    : await Promise.all(
        FEED_ITEM_PAGES.map((page) => getPublishedPostsPage(page, "zh")),
      );

  const items = pages
    .flatMap((page) => page.data ?? [])
    .sort(
      (left, right) =>
        new Date(right.createdAt ?? 0).getTime() -
        new Date(left.createdAt ?? 0).getTime(),
    )
    .slice(0, FEED_ITEM_LIMIT);

  const lastBuildDate =
    toRfc822(items[0]?.createdAt) ?? new Date(0).toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(seo.siteName)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(seo.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items
  .map((post) => {
    const url = `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`;
    const pubDate = toRfc822(post.createdAt);
    return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>${
        pubDate ? `\n      <pubDate>${escapeXml(pubDate)}</pubDate>` : ""
      }${
        post.description
          ? `\n      <description>${escapeXml(post.description)}</description>`
          : ""
      }
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>`;
}

/**
 * `connection()` keeps the feed out of the prerender pass. Without it the
 * channel would be frozen at deploy time and never surface new articles, which
 * defeats the point of publishing a feed.
 */
export async function GET() {
  await connection();

  const xml = await unstable_cache(
    buildFeedXml,
    ["public-rss-feed", getBaseUrl()],
    {
      revalidate: FEED_REVALIDATE_SECONDS,
      tags: [cacheTags.posts, cacheTags.siteSeo],
    },
  )();

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": `public, s-maxage=${FEED_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
}
