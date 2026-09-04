import "server-only";

import { cacheLife } from "next/cache";

import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import {
  applyInternalLinksToArticleHtml,
  type RenderableInlineLink,
} from "@fwqgo/core/article-internal-links";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { addIdsToHeadings, generateToc } from "@fwqgo/core/toc";
import { decodeSlug } from "@fwqgo/core/utils";
import {
  getEnglishPostWithTagsBySlug,
  getPostWithTagsBySlug,
} from "@/features/public/data/post";
import type { PublicArticleInternalLinks } from "@/server/posts/internal-links";
import { readPublicPostInternalLinks } from "@/server/posts/internal-links";

const configuredSlowLogMs = Number.parseInt(
  process.env.PUBLIC_ARTICLE_SLOW_LOG_MS ?? "",
  10,
);
const ARTICLE_SLOW_LOG_MS =
  Number.isSafeInteger(configuredSlowLogMs) && configuredSlowLogMs >= 100
    ? Math.min(configuredSlowLogMs, 60_000)
    : 500;

function roundedDuration(start: number, end: number) {
  return Math.max(0, Math.round(end - start));
}

function logSlowArticlePresentation(input: {
  language: "zh" | "en";
  slug: string;
  postId: number;
  startedAt: number;
  postLoadedAt: number;
  linksLoadedAt: number;
  renderedAt: number;
}) {
  const totalMs = roundedDuration(input.startedAt, input.renderedAt);
  if (totalMs < ARTICLE_SLOW_LOG_MS) return;

  console.warn(
    JSON.stringify({
      level: "warn",
      event: "public.article_presentation.slow",
      releaseId: process.env.RELEASE_ID ?? null,
      language: input.language,
      slug: input.slug,
      postId: input.postId,
      thresholdMs: ARTICLE_SLOW_LOG_MS,
      postReadMs: roundedDuration(input.startedAt, input.postLoadedAt),
      internalLinksReadMs: roundedDuration(
        input.postLoadedAt,
        input.linksLoadedAt,
      ),
      contentRenderMs: roundedDuration(input.linksLoadedAt, input.renderedAt),
      totalMs,
    }),
  );
}

export function renderArticlePresentation(
  content: string,
  internalLinks: PublicArticleInternalLinks,
) {
  const inlineLinks: RenderableInlineLink[] = internalLinks.inline.map(
    (link) => ({
      targetKey: link.targetKey,
      anchorText: link.anchorText ?? "",
      href: link.href,
      occurrenceIndex: link.occurrenceIndex,
    }),
  );
  const renderedContent = renderArticleContentHtml(content);
  const linkedContent = applyInternalLinksToArticleHtml(
    renderedContent,
    inlineLinks,
  );
  const contentHtml = addIdsToHeadings(linkedContent.html);

  return {
    contentHtml,
    tocItems: generateToc(contentHtml),
  };
}

export async function getChineseArticlePresentation(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });

  const decodedSlug = decodeSlug(slug);
  tagCache(
    cacheTags.posts,
    cacheTags.tags,
    cacheTags.internalLinks,
    cacheTags.postSlug(decodedSlug),
  );

  const startedAt = performance.now();
  const result = await getPostWithTagsBySlug(decodedSlug);
  const data = result.data;
  const post = data?.post;
  if (!post) return null;
  const postLoadedAt = performance.now();

  tagCache(
    cacheTags.post(post.id),
    cacheTags.postInternalLinks(post.id),
    cacheTags.knowledge,
    cacheTags.categories,
  );

  const internalLinks = await readPublicPostInternalLinks(post.id, "zh", {
    content: post.content,
    language: "zh",
  });
  const linksLoadedAt = performance.now();
  const presentation = renderArticlePresentation(post.content, internalLinks);
  const renderedAt = performance.now();
  logSlowArticlePresentation({
    language: "zh",
    slug: decodedSlug,
    postId: post.id,
    startedAt,
    postLoadedAt,
    linksLoadedAt,
    renderedAt,
  });
  const { content: sourceContent, ...postWithoutContent } = post;
  void sourceContent;

  return {
    post: postWithoutContent,
    ...presentation,
    internalLinks,
    relatedPostLinks: internalLinks.relatedPosts,
  };
}

export async function getEnglishArticlePresentation(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });

  const decodedSlug = decodeSlug(slug);
  tagCache(
    cacheTags.posts,
    cacheTags.tags,
    cacheTags.internalLinks,
    cacheTags.postSlug(decodedSlug),
  );

  const startedAt = performance.now();
  const result = await getEnglishPostWithTagsBySlug(decodedSlug);
  const post = result.data?.post;
  if (!post?.title || !post.content) return null;
  const postLoadedAt = performance.now();

  tagCache(
    cacheTags.post(post.id),
    cacheTags.postInternalLinks(post.id),
    cacheTags.knowledge,
    cacheTags.categories,
  );

  const internalLinks = await readPublicPostInternalLinks(post.id, "en", {
    content: post.content,
    language: "en",
  });
  const linksLoadedAt = performance.now();
  const presentation = renderArticlePresentation(post.content, internalLinks);
  const renderedAt = performance.now();
  logSlowArticlePresentation({
    language: "en",
    slug: decodedSlug,
    postId: post.id,
    startedAt,
    postLoadedAt,
    linksLoadedAt,
    renderedAt,
  });
  const { content: sourceContent, ...postWithoutContent } = post;
  void sourceContent;

  return {
    post: postWithoutContent,
    ...presentation,
    internalLinks,
    relatedPostLinks: internalLinks.relatedPosts,
  };
}
