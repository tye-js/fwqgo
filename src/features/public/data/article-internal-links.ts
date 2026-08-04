import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import type { ArticleLinkLanguage } from "@fwqgo/core/article-internal-links";
import { readPublicPostInternalLinks } from "@/server/posts/internal-links";

export async function getPublicPostInternalLinks(
  postId: number,
  language: ArticleLinkLanguage,
) {
  "use cache";
  tagCache(
    cacheTags.internalLinks,
    cacheTags.postInternalLinks(postId),
    cacheTags.post(postId),
    cacheTags.knowledge,
    cacheTags.categories,
    cacheTags.tags,
  );

  return readPublicPostInternalLinks(postId, language);
}
