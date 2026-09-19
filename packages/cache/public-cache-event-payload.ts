import type { PublicCacheEventPayload } from "./tags";

/**
 * Web 缓存失效请求的字段级容量上限。
 *
 * CMS 发送端（分片）与 Web 接收端（zod `.max()`）必须共用同一常量：
 * 接收端超出上限会返回 400，而发送端对 4xx 不再重试，
 * 结果是公网缓存静默保持旧内容直到时间策略过期。
 */
export const PUBLIC_CACHE_EVENT_ID_LIMIT = 50;
export const PUBLIC_CACHE_EVENT_TOPIC_SLUG_LIMIT = 20;

function chunkField<T>(values: T[] | undefined, limit: number): T[][] {
  if (!values || values.length === 0) return [];
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += limit) {
    groups.push(values.slice(index, index + limit));
  }
  return groups;
}

/**
 * 把可能超出接收端上限的 payload 拆成若干个合法分片。
 *
 * 同一字段的条目只会落在一个分片里，因此所有分片的并集与原 payload 等价，
 * 接收端逐片处理后的标签/路径并集也与单片处理一致。
 */
export function chunkPublicCacheEventPayload(
  payload: PublicCacheEventPayload,
): PublicCacheEventPayload[] {
  const postIds = chunkField(payload.postIds, PUBLIC_CACHE_EVENT_ID_LIMIT);
  const postSlugs = chunkField(payload.postSlugs, PUBLIC_CACHE_EVENT_ID_LIMIT);
  const categoryIds = chunkField(payload.categoryIds, PUBLIC_CACHE_EVENT_ID_LIMIT);
  const tagIds = chunkField(payload.tagIds, PUBLIC_CACHE_EVENT_ID_LIMIT);
  const topicSlugs = chunkField(
    payload.topicSlugs,
    PUBLIC_CACHE_EVENT_TOPIC_SLUG_LIMIT,
  );
  const knowledgeArticleIds = chunkField(
    payload.knowledgeArticleIds,
    PUBLIC_CACHE_EVENT_ID_LIMIT,
  );
  const knowledgeSlugs = chunkField(
    payload.knowledgeSlugs,
    PUBLIC_CACHE_EVENT_ID_LIMIT,
  );

  const chunkCount = Math.max(
    postIds.length,
    postSlugs.length,
    categoryIds.length,
    tagIds.length,
    topicSlugs.length,
    knowledgeArticleIds.length,
    knowledgeSlugs.length,
  );
  if (chunkCount <= 1) return [payload];

  return Array.from({ length: chunkCount }, (_, index) => {
    const chunk: PublicCacheEventPayload = {};
    if (postIds[index]) chunk.postIds = postIds[index];
    if (postSlugs[index]) chunk.postSlugs = postSlugs[index];
    if (categoryIds[index]) chunk.categoryIds = categoryIds[index];
    if (tagIds[index]) chunk.tagIds = tagIds[index];
    if (topicSlugs[index]) chunk.topicSlugs = topicSlugs[index];
    if (knowledgeArticleIds[index]) {
      chunk.knowledgeArticleIds = knowledgeArticleIds[index];
    }
    if (knowledgeSlugs[index]) chunk.knowledgeSlugs = knowledgeSlugs[index];
    return chunk;
  });
}
