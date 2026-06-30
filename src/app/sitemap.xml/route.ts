import { db } from "@/server/db";
import { posts, categories, tags } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { offerTopics } from "@/server/offers/server-offers";



export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com";

  // 获取所有已发布的文章
  const postsData = await db
    .select({
      slug: posts.slug,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt));

  const [changeDate] = await db
    .select({ updatedAt: posts.updatedAt })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.updatedAt))
    .limit(1);

  // 获取所有分类
  const categoriesData = await db
    .select({
      slug: categories.slug,
      updatedAt: categories.updatedAt,
    })
    .from(categories);

  // 获取所有标签
  const tagsData = await db
    .select({
      slug: tags.slug,
      updatedAt: tags.updatedAt,
    })
    .from(tags)
    .where(eq(tags.indexable, true));

  // 生成 XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${changeDate?.updatedAt?.toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/servers</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  ${offerTopics
      .map(
        (topic) => `
    <url>
      <loc>${baseUrl}/servers/${topic.slug}</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.85</priority>
    </url>
  `,
      )
      .join("")}
  ${postsData
      .map(
        (post) => `
    <url>
      <loc>${baseUrl}/fwq/posts/${post.slug}</loc>
      <lastmod>${post.updatedAt?.toISOString()}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.9</priority>
    </url>
  `,
      )
      .join("")}
  ${categoriesData
      .map(
        (category) => `
    <url>
      <loc>${baseUrl}/fwq/categories/${category.slug}/page/1</loc>
      <lastmod>${category.updatedAt?.toISOString()}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.7</priority>
    </url>
  `,
      )
      .join("")}
  ${tagsData
      .map(
        (tag) => `
    <url>
      <loc>${baseUrl}/fwq/tags/${tag.slug}/page/1</loc>
      <lastmod>${tag.updatedAt?.toISOString()}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.6</priority>
    </url>
  `,
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
