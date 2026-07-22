import { cacheTag, revalidatePath, revalidateTag, updateTag } from "next/cache";

export const cacheTags = {
  categories: "categories",
  tags: "tags",
  posts: "posts",
  homepage: "homepage",
  homepageSlots: "homepage-slots",
  sidebar: "sidebar",
  sitemap: "sitemap",
  siteSeo: "site-seo",
  serverOffers: "server-offers",
  knowledge: "knowledge",
  category: (id: number) => `category:${id}`,
  categorySlug: (slug: string) => `category-slug:${slug}`,
  tag: (id: number) => `tag:${id}`,
  tagSlug: (slug: string) => `tag-slug:${slug}`,
  post: (id: number) => `post:${id}`,
  postSlug: (slug: string) => `post-slug:${slug}`,
  serverOfferTopic: (slug: string) => `server-offer-topic:${slug}`,
  knowledgeArticle: (id: number) => `knowledge-article:${id}`,
  knowledgeSlug: (slug: string) => `knowledge-slug:${slug}`,
};

export const publicCacheEvents = [
  "post.changed",
  "homepage.changed",
  "offer.changed",
  "seo.changed",
  "taxonomy.changed",
  "image.changed",
  "knowledge.changed",
] as const;

export type PublicCacheEvent = (typeof publicCacheEvents)[number];
export type PublicCacheEventPayload = {
  postIds?: number[];
  postSlugs?: string[];
  categoryIds?: number[];
  tagIds?: number[];
  topicSlugs?: string[];
  knowledgeArticleIds?: number[];
  knowledgeSlugs?: string[];
};

export function tagCache(...tags: string[]) {
  cacheTag(...tags);
}

function uniquePositiveIds(values: number[] | undefined) {
  return [...new Set(values ?? [])].filter(
    (value) => Number.isInteger(value) && value > 0,
  );
}

function uniqueSlugs(values: string[] | undefined) {
  return [...new Set(values ?? [])]
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getPublicCacheEventTargets(
  event: PublicCacheEvent,
  payload: PublicCacheEventPayload = {},
) {
  const tags = new Set<string>();
  const paths = new Set<string>();

  if (event === "post.changed") {
    [
      cacheTags.posts,
      cacheTags.homepage,
      cacheTags.sidebar,
      cacheTags.sitemap,
    ].forEach((tag) => tags.add(tag));
    [
      "/",
      "/en",
      "/sitemap.xml",
      "/sitemap-posts.xml",
      "/sitemap-en.xml",
    ].forEach((path) => paths.add(path));
    uniquePositiveIds(payload.postIds).forEach((id) =>
      tags.add(cacheTags.post(id)),
    );
    uniqueSlugs(payload.postSlugs).forEach((slug) => {
      tags.add(cacheTags.postSlug(slug));
      paths.add(`/fwq/posts/${encodeURIComponent(slug)}`);
      paths.add(`/en/fwq/posts/${encodeURIComponent(slug)}`);
    });
    uniquePositiveIds(payload.categoryIds).forEach((id) =>
      tags.add(cacheTags.category(id)),
    );
  } else if (event === "homepage.changed") {
    [cacheTags.homepage, cacheTags.homepageSlots, cacheTags.sidebar].forEach(
      (tag) => tags.add(tag),
    );
    ["/", "/en"].forEach((path) => paths.add(path));
  } else if (event === "offer.changed") {
    [cacheTags.serverOffers, cacheTags.homepage, cacheTags.sitemap].forEach(
      (tag) => tags.add(tag),
    );
    ["/", "/en", "/servers", "/sitemap-servers.xml"].forEach((path) =>
      paths.add(path),
    );
    uniqueSlugs(payload.topicSlugs).forEach((slug) => {
      tags.add(cacheTags.serverOfferTopic(slug));
      paths.add(`/servers/${encodeURIComponent(slug)}`);
    });
  } else if (event === "seo.changed") {
    [cacheTags.siteSeo, cacheTags.homepage].forEach((tag) => tags.add(tag));
    ["/", "/en"].forEach((path) => paths.add(path));
  } else if (event === "taxonomy.changed") {
    [
      cacheTags.categories,
      cacheTags.tags,
      cacheTags.posts,
      cacheTags.sitemap,
    ].forEach((tag) => tags.add(tag));
    [
      "/",
      "/en",
      "/sitemap.xml",
      "/sitemap-categories.xml",
      "/sitemap-tags.xml",
      "/sitemap-en.xml",
    ].forEach((path) => paths.add(path));
    uniquePositiveIds(payload.categoryIds).forEach((id) =>
      tags.add(cacheTags.category(id)),
    );
    uniquePositiveIds(payload.tagIds).forEach((id) =>
      tags.add(cacheTags.tag(id)),
    );
  } else if (event === "image.changed") {
    [cacheTags.posts, cacheTags.homepage, cacheTags.homepageSlots].forEach(
      (tag) => tags.add(tag),
    );
    ["/", "/en"].forEach((path) => paths.add(path));
    uniquePositiveIds(payload.postIds).forEach((id) =>
      tags.add(cacheTags.post(id)),
    );
  } else if (event === "knowledge.changed") {
    [cacheTags.knowledge, cacheTags.sitemap].forEach((tag) => tags.add(tag));
    ["/knowledge", "/sitemap.xml", "/sitemap-knowledge.xml"].forEach((path) =>
      paths.add(path),
    );
    uniquePositiveIds(payload.knowledgeArticleIds).forEach((id) =>
      tags.add(cacheTags.knowledgeArticle(id)),
    );
    uniqueSlugs(payload.knowledgeSlugs).forEach((slug) => {
      tags.add(cacheTags.knowledgeSlug(slug));
      paths.add(`/knowledge/${encodeURIComponent(slug)}`);
    });
  }

  return { tags: [...tags], paths: [...paths] };
}

function expandLegacyTags(inputTags: string[]) {
  const tags = new Set(inputTags);
  if (inputTags.length === 0) {
    tags.add(cacheTags.posts);
    tags.add(cacheTags.homepage);
    tags.add(cacheTags.sidebar);
    tags.add(cacheTags.sitemap);
    return tags;
  }

  const hasPostTag = inputTags.some(
    (tag) => tag === cacheTags.posts || tag.startsWith("post:"),
  );
  const hasOfferTag = inputTags.some(
    (tag) =>
      tag === cacheTags.serverOffers || tag.startsWith("server-offer-topic:"),
  );
  if (hasPostTag) {
    tags.add(cacheTags.posts);
    tags.add(cacheTags.homepage);
    tags.add(cacheTags.sidebar);
    tags.add(cacheTags.sitemap);
  }
  if (hasOfferTag) {
    tags.add(cacheTags.serverOffers);
    tags.add(cacheTags.homepage);
    tags.add(cacheTags.sitemap);
  }
  return tags;
}

function legacyPathsForTags(tags: Set<string>) {
  const paths = new Set<string>();
  if (
    tags.has(cacheTags.posts) ||
    tags.has(cacheTags.homepage) ||
    tags.has(cacheTags.sidebar)
  ) {
    paths.add("/");
    paths.add("/en");
  }
  if (tags.has(cacheTags.posts) || tags.has(cacheTags.sitemap)) {
    paths.add("/sitemap.xml");
    paths.add("/sitemap-posts.xml");
    paths.add("/sitemap-en.xml");
  }
  if (tags.has(cacheTags.categories)) paths.add("/sitemap-categories.xml");
  if (tags.has(cacheTags.tags)) paths.add("/sitemap-tags.xml");
  if (tags.has(cacheTags.serverOffers)) {
    paths.add("/servers");
    paths.add("/sitemap-servers.xml");
  }
  if (tags.has(cacheTags.knowledge)) {
    paths.add("/knowledge");
    paths.add("/sitemap-knowledge.xml");
  }
  return paths;
}

export function revalidateSiteContent(tags: string[] = []) {
  const expandedTags = expandLegacyTags(tags);
  for (const tag of expandedTags) updateTag(tag);
  for (const path of legacyPathsForTags(expandedTags)) revalidatePath(path);
}

export function revalidateSiteContentFromRouteHandler(tags: string[] = []) {
  const expandedTags = expandLegacyTags(tags);
  for (const tag of expandedTags) revalidateTag(tag, { expire: 0 });
  for (const path of legacyPathsForTags(expandedTags)) revalidatePath(path);
}

export function revalidatePublicCacheEventFromRouteHandler(
  event: PublicCacheEvent,
  payload: PublicCacheEventPayload = {},
) {
  const targets = getPublicCacheEventTargets(event, payload);
  for (const tag of targets.tags) revalidateTag(tag, { expire: 0 });
  for (const path of targets.paths) revalidatePath(path);
  return targets;
}
