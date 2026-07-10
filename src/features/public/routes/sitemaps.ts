import { readDb } from "@fwqgo/db";
import { categories, posts, serverOffers, tags } from "@fwqgo/db/schema";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  getServerOfferCollectionIndex,
  offerTopics,
} from "@/server/offers/server-offers";

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function publishedChinesePostCondition() {
  return and(eq(posts.published, true), eq(posts.language, "zh"));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastmod(value: Date | null | undefined) {
  return (value ?? new Date()).toISOString();
}

function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
    },
  });
}

function sitemapEntry(input: { loc: string; lastmod?: Date | null }) {
  return `
  <sitemap>
    <loc>${escapeXml(input.loc)}</loc>
    <lastmod>${formatLastmod(input.lastmod)}</lastmod>
  </sitemap>`;
}

function urlEntry(input: {
  loc: string;
  lastmod?: Date | null;
  changefreq: "daily" | "weekly" | "monthly";
  priority: string;
  alternates?: Array<{ hreflang: string; href: string }>;
}) {
  const alternates =
    input.alternates
      ?.map(
        (alternate) =>
          `<xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`,
      )
      .join("\n    ") ?? "";

  return `
  <url>
    <loc>${escapeXml(input.loc)}</loc>
    ${alternates ? `${alternates}\n    ` : ""}<lastmod>${formatLastmod(input.lastmod)}</lastmod>
    <changefreq>${input.changefreq}</changefreq>
    <priority>${input.priority}</priority>
  </url>`;
}

function urlset(entries: string[]) {
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("")}
</urlset>`);
}

export async function sitemapIndexGET() {
  const baseUrl = getBaseUrl();
  const [latestPost] = await readDb
    .select({ updatedAt: posts.updatedAt })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.updatedAt))
    .limit(1);
  const [latestOffer] = await readDb
    .select({ updatedAt: serverOffers.updatedAt })
    .from(serverOffers)
    .where(eq(serverOffers.visible, true))
    .orderBy(desc(serverOffers.updatedAt))
    .limit(1);

  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  sitemapEntry({
    loc: `${baseUrl}/sitemap-posts.xml`,
    lastmod: latestPost?.updatedAt,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-en.xml`,
    lastmod: latestPost?.updatedAt,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-categories.xml`,
    lastmod: latestPost?.updatedAt,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-tags.xml`,
    lastmod: latestPost?.updatedAt,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-servers.xml`,
    lastmod: latestOffer?.updatedAt ?? latestPost?.updatedAt,
  }),
].join("")}
</sitemapindex>`);
}

export async function sitemapPostsGET() {
  const baseUrl = getBaseUrl();
  const [rows, englishRows] = await Promise.all([
    readDb
      .select({
        id: posts.id,
        slug: posts.slug,
        enSlug: posts.enSlug,
        enContent: posts.enContent,
        updatedAt: posts.updatedAt,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(publishedChinesePostCondition())
      .orderBy(desc(posts.createdAt)),
    readDb
      .select({
        slug: posts.slug,
        translationSourcePostId: posts.translationSourcePostId,
      })
      .from(posts)
      .where(
        and(
          eq(posts.published, true),
          eq(posts.language, "en"),
          isNotNull(posts.translationSourcePostId),
        ),
      ),
  ]);
  const englishSlugBySourcePostId = new Map(
    englishRows
      .filter((post) => post.translationSourcePostId)
      .map((post) => [post.translationSourcePostId!, post.slug]),
  );

  return urlset(
    rows.map((post) => {
      const englishSlug =
        englishSlugBySourcePostId.get(post.id) ??
        (post.enSlug && post.enContent ? post.enSlug : null);

      return urlEntry({
        loc: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
        lastmod: post.updatedAt ?? post.createdAt,
        changefreq: "weekly",
        priority: "0.9",
        alternates: englishSlug
          ? [
              {
                hreflang: "zh-CN",
                href: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
              },
              {
                hreflang: "en",
                href: `${baseUrl}/en/fwq/posts/${encodeURIComponent(englishSlug)}`,
              },
              {
                hreflang: "x-default",
                href: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
              },
            ]
          : undefined,
      });
    }),
  );
}

export async function sitemapEnglishGET() {
  const baseUrl = getBaseUrl();
  const englishRows = await readDb
    .select({
      id: posts.id,
      slug: posts.slug,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
      translationSourcePostId: posts.translationSourcePostId,
    })
    .from(posts)
    .where(and(eq(posts.published, true), eq(posts.language, "en")))
    .orderBy(desc(posts.updatedAt), desc(posts.createdAt));
  const sourcePostIds = [
    ...new Set(
      englishRows
        .map((post) => post.translationSourcePostId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  const sourcePosts =
    sourcePostIds.length > 0
      ? await readDb
          .select({ id: posts.id, slug: posts.slug })
          .from(posts)
          .where(
            and(
              inArray(posts.id, sourcePostIds),
              publishedChinesePostCondition(),
            ),
          )
      : [];
  const sourceSlugById = new Map(
    sourcePosts.map((post) => [post.id, post.slug]),
  );
  const independentSourcePostIds = new Set(sourcePostIds);
  const legacyRows = await readDb
    .select({
      id: posts.id,
      slug: posts.slug,
      enSlug: posts.enSlug,
      enUpdatedAt: posts.enUpdatedAt,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      and(
        publishedChinesePostCondition(),
        isNotNull(posts.enSlug),
        isNotNull(posts.enContent),
      ),
    )
    .orderBy(desc(posts.enUpdatedAt));
  const entries = [
    ...englishRows.map((post) => {
      const sourceSlug = post.translationSourcePostId
        ? sourceSlugById.get(post.translationSourcePostId)
        : null;

      return urlEntry({
        loc: `${baseUrl}/en/fwq/posts/${encodeURIComponent(post.slug)}`,
        lastmod: post.updatedAt ?? post.createdAt,
        changefreq: "weekly",
        priority: "0.8",
        alternates: sourceSlug
          ? [
              {
                hreflang: "zh-CN",
                href: `${baseUrl}/fwq/posts/${encodeURIComponent(sourceSlug)}`,
              },
              {
                hreflang: "en",
                href: `${baseUrl}/en/fwq/posts/${encodeURIComponent(post.slug)}`,
              },
              {
                hreflang: "x-default",
                href: `${baseUrl}/fwq/posts/${encodeURIComponent(sourceSlug)}`,
              },
            ]
          : [
              {
                hreflang: "en",
                href: `${baseUrl}/en/fwq/posts/${encodeURIComponent(post.slug)}`,
              },
            ],
      });
    }),
    ...legacyRows
      .filter((post) => !independentSourcePostIds.has(post.id))
      .map((post) =>
        urlEntry({
          loc: `${baseUrl}/en/fwq/posts/${encodeURIComponent(post.enSlug!)}`,
          lastmod: post.enUpdatedAt ?? post.updatedAt ?? post.createdAt,
          changefreq: "weekly",
          priority: "0.8",
          alternates: [
            {
              hreflang: "zh-CN",
              href: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
            },
            {
              hreflang: "en",
              href: `${baseUrl}/en/fwq/posts/${encodeURIComponent(post.enSlug!)}`,
            },
            {
              hreflang: "x-default",
              href: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
            },
          ],
        }),
      ),
  ];

  return urlset(entries);
}

export async function sitemapCategoriesGET() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({
      slug: categories.slug,
      enSlug: categories.enSlug,
      updatedAt: categories.updatedAt,
    })
    .from(categories)
    .orderBy(desc(categories.updatedAt));

  return urlset(
    rows.flatMap((category) => {
      const enSlug = category.enSlug?.trim();
      const zhUrl = `${baseUrl}/fwq/${encodeURIComponent(category.slug)}/page/1`;
      const enUrl = enSlug
        ? `${baseUrl}/en/fwq/${encodeURIComponent(enSlug)}/page/1`
        : null;
      const alternates = enUrl
        ? [
            { hreflang: "zh-CN", href: zhUrl },
            { hreflang: "en", href: enUrl },
            { hreflang: "x-default", href: zhUrl },
          ]
        : undefined;

      return [
        urlEntry({
          loc: zhUrl,
          lastmod: category.updatedAt,
          changefreq: "weekly",
          priority: "0.7",
          alternates,
        }),
        ...(enUrl
          ? [
              urlEntry({
                loc: enUrl,
                lastmod: category.updatedAt,
                changefreq: "weekly",
                priority: "0.65",
                alternates,
              }),
            ]
          : []),
      ];
    }),
  );
}

export async function sitemapTagsGET() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({ slug: tags.slug, enSlug: tags.enSlug, updatedAt: tags.updatedAt })
    .from(tags)
    .where(eq(tags.indexable, true))
    .orderBy(desc(tags.updatedAt));

  return urlset(
    rows.flatMap((tag) => {
      const enSlug = tag.enSlug?.trim();
      const zhUrl = `${baseUrl}/fwq/tags/${encodeURIComponent(tag.slug)}/page/1`;
      const enUrl = enSlug
        ? `${baseUrl}/en/fwq/tags/${encodeURIComponent(enSlug)}/page/1`
        : null;
      const alternates = enUrl
        ? [
            { hreflang: "zh-CN", href: zhUrl },
            { hreflang: "en", href: enUrl },
            { hreflang: "x-default", href: zhUrl },
          ]
        : undefined;

      return [
        urlEntry({
          loc: zhUrl,
          lastmod: tag.updatedAt,
          changefreq: "weekly",
          priority: "0.6",
          alternates,
        }),
        ...(enUrl
          ? [
              urlEntry({
                loc: enUrl,
                lastmod: tag.updatedAt,
                changefreq: "weekly",
                priority: "0.55",
                alternates,
              }),
            ]
          : []),
      ];
    }),
  );
}

export async function sitemapServersGET() {
  const baseUrl = getBaseUrl();
  const [[latestOffer], collections] = await Promise.all([
    readDb
      .select({ updatedAt: serverOffers.updatedAt })
      .from(serverOffers)
      .where(eq(serverOffers.visible, true))
      .orderBy(desc(serverOffers.updatedAt))
      .limit(1),
    getServerOfferCollectionIndex(120),
  ]);
  const lastmod = latestOffer?.updatedAt ?? new Date();
  const collectionEntries = [
    ...collections.providers.map((item) => ({
      loc: `${baseUrl}/servers/providers/${encodeURIComponent(item.value)}`,
      lastmod: item.updatedAt ?? lastmod,
      priority: "0.72",
    })),
    ...collections.regions.map((item) => ({
      loc: `${baseUrl}/servers/regions/${encodeURIComponent(item.value)}`,
      lastmod: item.updatedAt ?? lastmod,
      priority: "0.74",
    })),
    ...collections.lines.map((item) => ({
      loc: `${baseUrl}/servers/lines/${encodeURIComponent(item.value)}`,
      lastmod: item.updatedAt ?? lastmod,
      priority: "0.72",
    })),
  ];

  return urlset([
    urlEntry({
      loc: `${baseUrl}/servers`,
      lastmod,
      changefreq: "daily",
      priority: "0.9",
    }),
    ...offerTopics.map((topic) =>
      urlEntry({
        loc: `${baseUrl}/servers/${encodeURIComponent(topic.slug)}`,
        lastmod,
        changefreq: "daily",
        priority: "0.85",
      }),
    ),
    ...collectionEntries.map((entry) =>
      urlEntry({
        loc: entry.loc,
        lastmod: entry.lastmod,
        changefreq: "daily",
        priority: entry.priority,
      }),
    ),
  ]);
}
