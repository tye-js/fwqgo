import { cacheTag, revalidatePath, updateTag } from "next/cache";

export const cacheTags = {
  categories: "categories",
  tags: "tags",
  posts: "posts",
  homepage: "homepage",
  sidebar: "sidebar",
  sitemap: "sitemap",
  siteSeo: "site-seo",
  serverOffers: "server-offers",
  category: (id: number) => `category:${id}`,
  categorySlug: (slug: string) => `category-slug:${slug}`,
  tag: (id: number) => `tag:${id}`,
  tagSlug: (slug: string) => `tag-slug:${slug}`,
  post: (id: number) => `post:${id}`,
  postSlug: (slug: string) => `post-slug:${slug}`,
  serverOfferTopic: (slug: string) => `server-offer-topic:${slug}`,
};

export function tagCache(...tags: string[]) {
  cacheTag(...tags);
}

export function revalidateSiteContent(tags: string[] = []) {
  const uniqueTags = new Set([
    cacheTags.posts,
    cacheTags.homepage,
    cacheTags.sidebar,
    cacheTags.sitemap,
    cacheTags.serverOffers,
    ...tags,
  ]);

  for (const tag of uniqueTags) {
    updateTag(tag);
  }

  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  revalidatePath("/sitemap-posts.xml");
  revalidatePath("/sitemap-en.xml");
  revalidatePath("/sitemap-categories.xml");
  revalidatePath("/sitemap-tags.xml");
  revalidatePath("/sitemap-servers.xml");
}
