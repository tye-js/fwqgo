import { db } from "@/server/db";
import { type MetadataRoute } from "next";
import { posts, categories, tags } from "@/server/db/schema";
import { eq, desc, asc } from "drizzle-orm";

type ChangeFreq =
  | "daily"
  | "weekly"
  | "always"
  | "hourly"
  | "monthly"
  | "yearly"
  | "never";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 获取所有已发布的文章及其分页
  const postsData = await db
    .select({
      slug: posts.slug,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(asc(posts.createdAt));

  const [changeDate] = await db
    .select({ updatedAt: posts.updatedAt })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.updatedAt))
    .limit(1);
  const mainPage: MetadataRoute.Sitemap = [
    {
      url: process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com",
      lastModified: changeDate?.updatedAt?.toISOString(),
      changeFrequency: "daily" satisfies ChangeFreq,
      priority: 1,
    },
  ];

  // 文章详情页 URLs
  const postDetailPages: MetadataRoute.Sitemap = postsData.map((post) => ({
    url: `${process.env.NEXT_PUBLIC_URL}/fwq/posts/${post.slug}`,
    lastModified: post.updatedAt?.toISOString(),
    changeFrequency: "always" satisfies ChangeFreq,
    priority: 0.9,
  }));

  // 分类页面
  const categoriesData = await db
    .select({
      slug: categories.slug,
      updatedAt: categories.updatedAt,
    })
    .from(categories);

  const categoryPages: MetadataRoute.Sitemap = categoriesData.map(
    (category) => {
      return {
        url: `${process.env.NEXT_PUBLIC_URL}/fwq/categories/${category.slug}/page/1`,
        lastModified: category.updatedAt?.toISOString(),
        changeFrequency: "weekly" satisfies ChangeFreq,
        priority: 0.7,
      };
    },
  );

  // 标签页面，包含分页
  const tagsData = await db
    .select({
      slug: tags.slug,
      updatedAt: tags.updatedAt,
    })
    .from(tags);

  const tagPages: MetadataRoute.Sitemap = tagsData.map((tag) => {
    return {
      url: `${process.env.NEXT_PUBLIC_URL}/fwq/tags/${tag.slug}/page/1`,
      lastModified: tag.updatedAt?.toISOString(),
      changeFrequency: "weekly" satisfies ChangeFreq,
      priority: 0.6,
    };
  });

  return [...mainPage, ...postDetailPages, ...categoryPages, ...tagPages];
}
