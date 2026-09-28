import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";

import { readDb } from "@fwqgo/db";
import {
  affServiceProviders,
  postTags,
  posts,
  serverNetworkLines,
  serverOffers,
  serverRegions,
  tags,
} from "@fwqgo/db/schema";
import { MIN_PUBLIC_ARTICLE_CONTENT_LENGTH } from "@fwqgo/core/public-content-policy";
import { resolveServerEntity } from "@fwqgo/core/server-entity";
import { publicPostCondition } from "@/server/posts/public-post-policy";

if (process.argv.includes("--apply"))
  throw new Error("此命令只生成复核清单，不修改数据。");

const [invalidPosts, tagSets, unmappedOffers, providers, regions, lines, duplicateTitles] =
  await Promise.all([
    readDb
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        language: posts.language,
      })
      .from(posts)
      .where(
        and(
          eq(posts.published, true),
          or(
            sql`char_length(btrim(${posts.content})) < ${MIN_PUBLIC_ARTICLE_CONTENT_LENGTH}`,
            sql`char_length(btrim(${posts.title})) = 0`,
            sql`char_length(btrim(${posts.slug})) = 0`,
          ),
        ),
      ),
    readDb
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        postIds: sql<number[]>`array_agg(${posts.id} order by ${posts.id})`,
      })
      .from(tags)
      .innerJoin(postTags, eq(postTags.tagId, tags.id))
      .innerJoin(posts, eq(postTags.postId, posts.id))
      .where(and(eq(tags.indexable, true), publicPostCondition("zh")))
      .groupBy(tags.id)
      .having(sql`count(*) >= 3`),
    readDb
      .select({
        id: serverOffers.id,
        provider: serverOffers.providerName,
        providerId: serverOffers.providerId,
        region: serverOffers.region,
        regionId: serverOffers.regionId,
        line: serverOffers.lineType,
        lineId: serverOffers.lineId,
      })
      .from(serverOffers)
      .where(
        and(
          eq(serverOffers.visible, true),
          or(
            and(
              isNull(serverOffers.providerId),
              isNotNull(serverOffers.providerName),
            ),
            and(isNull(serverOffers.regionId), isNotNull(serverOffers.region)),
            and(isNull(serverOffers.lineId), isNotNull(serverOffers.lineType)),
          ),
        ),
      ),
    readDb
      .select({
        id: affServiceProviders.id,
        name: affServiceProviders.name,
        slug: affServiceProviders.slug,
        aliases: affServiceProviders.aliases,
      })
      .from(affServiceProviders),
    readDb.select().from(serverRegions).where(eq(serverRegions.active, true)),
    readDb
      .select()
      .from(serverNetworkLines)
      .where(eq(serverNetworkLines.active, true)),
    /**
     * 同一语言下**标题逐字相同**的已发布文章。
     *
     * 2026-09-28 用 sitemap 横向比对时发现的：`posts` id=1 与 id=7 标题完全一样、
     * 两个 URL 都 200 —— 同一篇发了两次，是典型的重复内容。当时只能靠一次性脚本发现，
     * 这里补进审计入口，让它变成可重复的复核清单（本命令只出清单，不改数据）。
     */
    readDb
      .select({
        language: posts.language,
        title: posts.title,
        count: sql<number>`count(*)::int`,
        postIds: sql<number[]>`array_agg(${posts.id} order by ${posts.id})`,
        slugs: sql<string[]>`array_agg(${posts.slug} order by ${posts.id})`,
      })
      .from(posts)
      .where(eq(posts.published, true))
      .groupBy(posts.language, posts.title)
      .having(sql`count(*) > 1`)
      .orderBy(sql`count(*) desc`, posts.title),
  ]);

const overlapReview: Array<{
  left: { id: number; name: string };
  right: { id: number; name: string };
  sharedPosts: number;
  overlap: number;
}> = [];
for (let i = 0; i < tagSets.length; i++) {
  const left = tagSets[i]!;
  const leftIds = new Set(left.postIds);
  for (const right of tagSets.slice(i + 1)) {
    const shared = right.postIds.filter((id) => leftIds.has(id)).length;
    const overlap = shared / new Set([...left.postIds, ...right.postIds]).size;
    if (shared >= 3 && overlap >= 0.8)
      overlapReview.push({
        left: { id: left.id, name: left.name },
        right: { id: right.id, name: right.name },
        sharedPosts: shared,
        overlap: Math.round(overlap * 100) / 100,
      });
  }
}
const entityReview = unmappedOffers.flatMap((offer) => {
  return (["provider", "region", "line"] as const).flatMap((kind) => {
    const raw = offer[kind];
    if (offer[`${kind}Id`] || !raw?.trim()) return [];
    const entity = resolveServerEntity(
      kind === "provider" ? providers : kind === "region" ? regions : lines,
      raw,
    );
    return [
      {
        offerId: offer.id,
        kind,
        raw,
        canonicalId: entity?.id ?? null,
        canonicalSlug: entity?.slug ?? null,
      },
    ];
  });
});
console.log(
  JSON.stringify(
    {
      readOnly: true,
      invalidPublishedPosts: invalidPosts,
      duplicatePublishedTitlesForReview: duplicateTitles,
      overlappingTagsForIntentReview: overlapReview,
      entityAssignmentsForReview: entityReview,
      note: "文章重叠不等于搜索意图相同。原生 IP 与住宅 IP 等不同概念不能自动合并；无可信实体映射的抓取文本不生成公开集合页。标题重复的已发布文章是重复内容，需要人工决定合并（保留一条 + 另一条走 slug 历史重定向）还是差异化，本命令不自动处理。",
    },
    null,
    2,
  ),
);
process.exit(0);
