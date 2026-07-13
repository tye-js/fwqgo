import { cacheTag, revalidatePath, revalidateTag, updateTag } from "next/cache";

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

function getSiteContentTags(tags: string[]) {
  return new Set([
    cacheTags.posts,
    cacheTags.homepage,
    cacheTags.sidebar,
    cacheTags.sitemap,
    cacheTags.serverOffers,
    ...tags,
  ]);
}

function revalidateSitePaths() {
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  revalidatePath("/sitemap-posts.xml");
  revalidatePath("/sitemap-en.xml");
  revalidatePath("/sitemap-categories.xml");
  revalidatePath("/sitemap-tags.xml");
  revalidatePath("/sitemap-servers.xml");
}

export function revalidateSiteContent(tags: string[] = []) {
  for (const tag of getSiteContentTags(tags)) {
    updateTag(tag);
  }

  revalidateSitePaths();
}

export function revalidateSiteContentFromRouteHandler(tags: string[] = []) {
  for (const tag of getSiteContentTags(tags)) {
    revalidateTag(tag, { expire: 0 });
  }

  revalidateSitePaths();
}
