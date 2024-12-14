import { db } from "@/server/db";
import { type MetadataRoute } from "next";

type ChangeFreq =
  | "daily"
  | "weekly"
  | "always"
  | "hourly"
  | "monthly"
  | "yearly"
  | "never";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 获取所有文章
  const posts = await db.post.findMany({
    where: {
      published: true, // 只包含已发布的文章
    },
    select: {
      slug: true,
      updatedAt: true,
    },
  });

  // 获取所有分类
  const categories = await db.category.findMany({
    select: {
      slug: true,
      updatedAt: true,
    },
  });

  // 获取所有标签
  const tags = await db.tag.findMany({
    select: {
      slug: true,
      updatedAt: true,
    },
  });

  // 基础 URL
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com";

  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date().toISOString(),
      changeFrequency: "daily" satisfies ChangeFreq,
      priority: 1,
    },
  ];

  // 文章页面
  const postPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/fwq/posts/${post.slug}`,
    lastModified: post.updatedAt ? post.updatedAt.toISOString() : undefined,
    changeFrequency: "weekly" satisfies ChangeFreq,
    priority: 0.9,
  }));

  // 分类页面
  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/fwq/categories/${category.slug}/page/1`,
    lastModified: category.updatedAt
      ? category.updatedAt.toISOString()
      : undefined,
    changeFrequency: "weekly" satisfies ChangeFreq,
    priority: 0.7,
  }));

  // 标签页面
  const tagPages: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${baseUrl}/fwq/tags/${tag.slug}/page/1`,
    lastModified: tag.updatedAt ? tag.updatedAt.toISOString() : undefined,
    changeFrequency: "weekly" satisfies ChangeFreq,
    priority: 0.6,
  }));

  return [...staticPages, ...postPages, ...categoryPages, ...tagPages];
}
