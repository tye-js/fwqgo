import { cacheTag, revalidatePath, updateTag } from "next/cache";

export const cacheTags = {
  categories: "categories",
  tags: "tags",
  posts: "posts",
  homepage: "homepage",
  sidebar: "sidebar",
  sitemap: "sitemap",
  category: (id: number) => `category:${id}`,
  categorySlug: (slug: string) => `category-slug:${slug}`,
  tag: (id: number) => `tag:${id}`,
  tagSlug: (slug: string) => `tag-slug:${slug}`,
  post: (id: number) => `post:${id}`,
  postSlug: (slug: string) => `post-slug:${slug}`,
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
    ...tags,
  ]);

  for (const tag of uniqueTags) {
    updateTag(tag);
  }

  revalidatePath("/");
  revalidatePath("/sitemap.xml");
}
