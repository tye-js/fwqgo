import { readDb } from "@fwqgo/db";
import { posts, categories, tags } from "@fwqgo/db/schema";
import { eq, desc } from "drizzle-orm";
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

export async function GET() {
  const baseUrl = getBaseUrl();

  // 获取所有已发布的文章
  const postsData = await readDb
    .select({
      slug: posts.slug,
      enSlug: posts.enSlug,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt));

  const [changeDate] = await readDb
    .select({ updatedAt: posts.updatedAt })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.updatedAt))
    .limit(1);

  // 获取所有分类
  const categoriesData = await readDb
    .select({
      slug: categories.slug,
      updatedAt: categories.updatedAt,
    })
    .from(categories);

  // 获取所有标签
  const tagsData = await readDb
    .select({
      slug: tags.slug,
      updatedAt: tags.updatedAt,
    })
    .from(tags)
    .where(eq(tags.indexable, true));

  // 生成 XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${urlEntry({
    loc: baseUrl,
    lastmod: changeDate?.updatedAt,
    changefreq: "daily",
    priority: "1.0",
  })}
  ${urlEntry({
    loc: `${baseUrl}/servers`,
    lastmod: new Date(),
    changefreq: "daily",
    priority: "0.9",
  })}
  ${offerTopics
      .map(
        (topic) =>
          urlEntry({
            loc: `${baseUrl}/servers/${topic.slug}`,
            lastmod: new Date(),
            changefreq: "daily",
            priority: "0.85",
          }),
      )
      .join("")}
  ${postsData
      .map(
        (post) =>
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
                ]
              : undefined,
          }),
      )
      .join("")}
  ${categoriesData
      .map(
        (category) =>
          urlEntry({
            loc: `${baseUrl}/fwq/${encodeURIComponent(category.slug)}/page/1`,
            lastmod: category.updatedAt,
            changefreq: "weekly",
            priority: "0.7",
          }),
      )
      .join("")}
  ${tagsData
      .map(
        (tag) =>
          urlEntry({
            loc: `${baseUrl}/fwq/tags/${encodeURIComponent(tag.slug)}/page/1`,
            lastmod: tag.updatedAt,
            changefreq: "weekly",
            priority: "0.6",
          }),
      )
      .join("")}
</urlset>`;

  // 返回 XML 响应
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
    },
  });
}
