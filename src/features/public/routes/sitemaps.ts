import { readDb } from "@fwqgo/db";
import { renderSitemapLastmod } from "@fwqgo/core/sitemap-lastmod";
import { getLatestDateValue } from "@fwqgo/core/date-value";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { cacheTags } from "@fwqgo/cache/tags";
import {
  categories,
  knowledgeArticles,
  posts,
  serverOffers,
  tags,
} from "@fwqgo/db/schema";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
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

function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
    },
  });
}

const SITEMAP_CACHE_REVALIDATE_SECONDS = 60 * 60;

function cachedSitemapXml(
  name: string,
  tags: string[],
  build: () => string | Promise<string>,
) {
  const baseUrl = getBaseUrl();

  return unstable_cache(
    async () => build(),
    ["public-sitemap", name, baseUrl],
    {
      revalidate: SITEMAP_CACHE_REVALIDATE_SECONDS,
      tags: [cacheTags.sitemap, ...tags],
    },
  )();
}

function sitemapEntry(input: { loc: string; lastmod?: Date | null }) {
  const lastmod = renderSitemapLastmod(input.lastmod);

  return `
  <sitemap>
    <loc>${escapeXml(input.loc)}</loc>${lastmod ? `\n    ${lastmod}` : ""}
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
  const lastmod = renderSitemapLastmod(input.lastmod);

  return `
  <url>
    <loc>${escapeXml(input.loc)}</loc>
    ${alternates ? `${alternates}\n    ` : ""}${lastmod ? `${lastmod}\n    ` : ""}<changefreq>${input.changefreq}</changefreq>
    <priority>${input.priority}</priority>
  </url>`;
}

function renderUrlset(entries: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("")}
</urlset>`;
}

export async function sitemapIndexGET() {
  return xmlResponse(await cachedSitemapXml("index", [], buildSitemapIndexXml));
}

async function buildSitemapIndexXml() {
  const baseUrl = getBaseUrl();

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  sitemapEntry({
    loc: `${baseUrl}/sitemap-posts.xml`,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-en.xml`,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-categories.xml`,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-tags.xml`,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-servers.xml`,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-knowledge.xml`,
  }),
  sitemapEntry({
    loc: `${baseUrl}/sitemap-tools.xml`,
  }),
].join("")}
</sitemapindex>`;
}

export async function sitemapToolsGET() {
  return xmlResponse(
    await cachedSitemapXml(
      "tools",
      [cacheTags.networkExperience, cacheTags.serverSizing],
      buildSitemapToolsXml,
    ),
  );
}

async function buildSitemapToolsXml() {
  const baseUrl = getBaseUrl();
  const zhSizing = `${baseUrl}/tools/server-sizing`;
  const enSizing = `${baseUrl}/en/tools/server-sizing`;
  const zhLines = `${baseUrl}/tools/network-lines`;
  const enLines = `${baseUrl}/en/tools/network-lines`;
  const sizingAlternates = [
    { hreflang: "zh-CN", href: zhSizing },
    { hreflang: "en", href: enSizing },
    { hreflang: "x-default", href: zhSizing },
  ];
  const linesAlternates = [
    { hreflang: "zh-CN", href: zhLines },
    { hreflang: "en", href: enLines },
    { hreflang: "x-default", href: zhLines },
  ];
  return renderUrlset([
    urlEntry({
      loc: zhSizing,
      changefreq: "monthly",
      priority: "0.65",
      alternates: sizingAlternates,
    }),
    urlEntry({
      loc: enSizing,
      changefreq: "monthly",
      priority: "0.6",
      alternates: sizingAlternates,
    }),
    urlEntry({
      loc: zhLines,
      changefreq: "weekly",
      priority: "0.65",
      alternates: linesAlternates,
    }),
    urlEntry({
      loc: enLines,
      changefreq: "weekly",
      priority: "0.6",
      alternates: linesAlternates,
    }),
  ]);
}

export async function sitemapPostsGET() {
  await connection();
  return xmlResponse(
    await cachedSitemapXml("posts", [cacheTags.posts], buildSitemapPostsXml),
  );
}

async function buildSitemapPostsXml() {
  const baseUrl = getBaseUrl();
  const [rows, englishRows] = await Promise.all([
    readDb
      .select({
        id: posts.id,
        slug: posts.slug,
        updatedAt: posts.updatedAt,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(publishedChinesePostCondition())
      .orderBy(desc(posts.createdAt), desc(posts.id)),
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

  return renderUrlset(
    rows.map((post) => {
      const englishSlug = englishSlugBySourcePostId.get(post.id) ?? null;

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
  await connection();
  return xmlResponse(
    await cachedSitemapXml("english", [cacheTags.posts], buildSitemapEnglishXml),
  );
}

async function buildSitemapEnglishXml() {
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
  ];

  return renderUrlset(entries);
}

export async function sitemapKnowledgeGET() {
  await connection();
  return xmlResponse(
    await cachedSitemapXml(
      "knowledge",
      [cacheTags.knowledge],
      buildSitemapKnowledgeXml,
    ),
  );
}

async function buildSitemapKnowledgeXml() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({
      id: knowledgeArticles.id,
      slug: knowledgeArticles.slug,
      language: knowledgeArticles.language,
      translationSourceArticleId: knowledgeArticles.translationSourceArticleId,
      contentUpdatedAt: knowledgeArticles.contentUpdatedAt,
    })
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.published, true),
        ne(knowledgeArticles.contentRole, "post_purchase_guide"),
      ),
    )
    .orderBy(
      desc(knowledgeArticles.contentUpdatedAt),
      desc(knowledgeArticles.id),
    );
  const chineseRows = rows.filter((row) => row.language === "zh");
  const englishRows = rows.filter((row) => row.language === "en");
  const chineseById = new Map(chineseRows.map((row) => [row.id, row]));
  const englishBySourceId = new Map(
    englishRows.flatMap((row) =>
      row.translationSourceArticleId
        ? [[row.translationSourceArticleId, row] as const]
        : [],
    ),
  );
  const latestChineseDate = getLatestDateValue(
    chineseRows.map((row) => row.contentUpdatedAt),
  );
  const latestEnglishDate = getLatestDateValue(
    englishRows.map((row) => row.contentUpdatedAt),
  );
  const indexAlternates = [
    { hreflang: "zh-CN", href: `${baseUrl}/knowledge` },
    { hreflang: "en", href: `${baseUrl}/en/knowledge` },
    { hreflang: "x-default", href: `${baseUrl}/knowledge` },
  ];

  return renderUrlset([
    urlEntry({
      loc: `${baseUrl}/knowledge`,
      lastmod: latestChineseDate,
      changefreq: "weekly",
      priority: "0.75",
      alternates: indexAlternates,
    }),
    urlEntry({
      loc: `${baseUrl}/en/knowledge`,
      lastmod: latestEnglishDate,
      changefreq: "weekly",
      priority: "0.7",
      alternates: indexAlternates,
    }),
    ...rows.map((article) => {
      const isEnglish = article.language === "en";
      const articleUrl = `${baseUrl}${isEnglish ? "/en" : ""}/knowledge/${encodeURIComponent(article.slug)}`;
      const pairedArticle = isEnglish
        ? article.translationSourceArticleId
          ? chineseById.get(article.translationSourceArticleId)
          : null
        : englishBySourceId.get(article.id);
      const chineseUrl = isEnglish
        ? pairedArticle
          ? `${baseUrl}/knowledge/${encodeURIComponent(pairedArticle.slug)}`
          : null
        : articleUrl;
      const englishUrl = isEnglish
        ? articleUrl
        : pairedArticle
          ? `${baseUrl}/en/knowledge/${encodeURIComponent(pairedArticle.slug)}`
          : null;
      const alternates =
        chineseUrl && englishUrl
          ? [
              { hreflang: "zh-CN", href: chineseUrl },
              { hreflang: "en", href: englishUrl },
              { hreflang: "x-default", href: chineseUrl },
            ]
          : undefined;

      return urlEntry({
        loc: articleUrl,
        lastmod: article.contentUpdatedAt,
        changefreq: "monthly",
        priority: isEnglish ? "0.65" : "0.7",
        alternates,
      });
    }),
  ]);
}

export async function sitemapCategoriesGET() {
  await connection();
  return xmlResponse(
    await cachedSitemapXml(
      "categories",
      [cacheTags.categories],
      buildSitemapCategoriesXml,
    ),
  );
}

async function buildSitemapCategoriesXml() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({
      slug: categories.slug,
      enSlug: categories.enSlug,
      updatedAt: categories.updatedAt,
    })
    .from(categories)
    .orderBy(desc(categories.updatedAt));

  return renderUrlset(
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
  await connection();
  return xmlResponse(
    await cachedSitemapXml("tags", [cacheTags.tags], buildSitemapTagsXml),
  );
}

async function buildSitemapTagsXml() {
  const baseUrl = getBaseUrl();
  const rows = await readDb
    .select({
      name: tags.name,
      slug: tags.slug,
      enName: tags.enName,
      enSlug: tags.enSlug,
      updatedAt: tags.updatedAt,
    })
    .from(tags)
    .where(eq(tags.indexable, true))
    .orderBy(desc(tags.updatedAt));

  return renderUrlset(
    rows.flatMap((tag) => {
      const englishIdentity = resolveEnglishTagIdentity(tag);
      const zhUrl = `${baseUrl}/fwq/tags/${encodeURIComponent(tag.slug)}/page/1`;
      const enUrl = englishIdentity
        ? `${baseUrl}/en/fwq/tags/${encodeURIComponent(englishIdentity.slug)}/page/1`
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
  await connection();
  return xmlResponse(
    await cachedSitemapXml(
      "servers",
      [cacheTags.serverOffers],
      buildSitemapServersXml,
    ),
  );
}

async function buildSitemapServersXml() {
  const baseUrl = getBaseUrl();
  const [[latestOffer], collections] = await Promise.all([
    readDb
      .select({
        updatedAt: serverOffers.updatedAt,
        createdAt: serverOffers.createdAt,
      })
      .from(serverOffers)
      .where(eq(serverOffers.visible, true))
      .orderBy(
        desc(
          sql`coalesce(${serverOffers.updatedAt}, ${serverOffers.createdAt})`,
        ),
      )
      .limit(1),
    getServerOfferCollectionIndex(120),
  ]);
  const lastmod = getLatestDateValue([
    latestOffer?.updatedAt,
    latestOffer?.createdAt,
  ]);
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

  return renderUrlset([
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
