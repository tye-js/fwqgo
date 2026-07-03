import { readDb } from "@fwqgo/db";
import { categories, posts, serverOffers, tags } from "@fwqgo/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { offerTopics } from "@/server/offers/server-offers";

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
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
  sitemapEntry({ loc: `${baseUrl}/sitemap-posts.xml`, lastmod: latestPost?.updatedAt }),
  sitemapEntry({ loc: `${baseUrl}/sitemap-en.xml`, lastmod: latestPost?.updatedAt }),
  sitemapEntry({ loc: `${baseUrl}/sitemap-categories.xml`, lastmod: latestPost?.updatedAt }),
  sitemapEntry({ loc: `${baseUrl}/sitemap-tags.xml`, lastmod: latestPost?.updatedAt }),
  sitemapEntry({ loc: `${baseUrl}/sitemap-servers.xml`, lastmod: latestOffer?.updatedAt ?? latestPost?.updatedAt }),
].join("")}
</sitemapindex>`);
}

export async function sitemapPostsGET() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({
      slug: posts.slug,
      enSlug: posts.enSlug,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt));

  return urlset(
    rows.map((post) =>
      urlEntry({
        loc: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
        lastmod: post.updatedAt ?? post.createdAt,
        changefreq: "weekly",
        priority: "0.9",
        alternates: post.enSlug
          ? [
              {
                hreflang: "zh-CN",
                href: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
              },
              {
                hreflang: "en",
                href: `${baseUrl}/en/fwq/posts/${encodeURIComponent(post.enSlug)}`,
              },
              {
                hreflang: "x-default",
                href: `${baseUrl}/fwq/posts/${encodeURIComponent(post.slug)}`,
              },
            ]
          : undefined,
      }),
    ),
  );
}

export async function sitemapEnglishGET() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({
      slug: posts.slug,
      enSlug: posts.enSlug,
      enUpdatedAt: posts.enUpdatedAt,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(eq(posts.published, true), isNotNull(posts.enSlug), isNotNull(posts.enContent)))
    .orderBy(desc(posts.enUpdatedAt));

  return urlset(
    rows
      .filter((post) => post.enSlug)
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
  );
}

export async function sitemapCategoriesGET() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({ slug: categories.slug, updatedAt: categories.updatedAt })
    .from(categories)
    .orderBy(desc(categories.updatedAt));

  return urlset(
    rows.map((category) =>
      urlEntry({
        loc: `${baseUrl}/fwq/${encodeURIComponent(category.slug)}/page/1`,
        lastmod: category.updatedAt,
        changefreq: "weekly",
        priority: "0.7",
      }),
    ),
  );
}

export async function sitemapTagsGET() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({ slug: tags.slug, updatedAt: tags.updatedAt })
    .from(tags)
    .where(eq(tags.indexable, true))
    .orderBy(desc(tags.updatedAt));

  return urlset(
    rows.map((tag) =>
      urlEntry({
        loc: `${baseUrl}/fwq/tags/${encodeURIComponent(tag.slug)}/page/1`,
        lastmod: tag.updatedAt,
        changefreq: "weekly",
        priority: "0.6",
      }),
    ),
  );
}

export async function sitemapServersGET() {
  const baseUrl = getBaseUrl();
  const [latestOffer] = await readDb
    .select({ updatedAt: serverOffers.updatedAt })
    .from(serverOffers)
    .where(eq(serverOffers.visible, true))
    .orderBy(desc(serverOffers.updatedAt))
    .limit(1);
  const lastmod = latestOffer?.updatedAt ?? new Date();

  return urlset([
    urlEntry({
      loc: `${baseUrl}/servers`,
      lastmod,
      changefreq: "daily",
      priority: "0.9",
    }),
    ...offerTopics.map((topic) =>
      urlEntry({
        loc: `${baseUrl}/servers/${topic.slug}`,
        lastmod,
        changefreq: "daily",
        priority: "0.85",
      }),
    ),
  ]);
}
