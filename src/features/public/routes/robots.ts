import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/private/",
        "/admin/",
        "/api/",
        "/ai-rewrite/",
        "/ai-tasks/",
        "/collect/",
        "/images/",
        "/posts/",
        "/seo/",
        "/settings/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
