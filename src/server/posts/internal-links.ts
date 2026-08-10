import { createHash } from "node:crypto";

import { and, eq, inArray, ne, or } from "drizzle-orm";

import {
  findTagAnchorInContent,
  scoreKnowledgeArticle,
  scoreRelatedPost,
  type ArticleLinkLanguage,
  type ArticleRelevanceSource,
  type KnowledgeRelevanceCandidate,
  type RelatedPostRelevanceCandidate,
  type TagRelevanceCandidate,
} from "@fwqgo/core/article-internal-links";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { db, readDb } from "@fwqgo/db";
import {
  categories,
  knowledgeArticles,
  postInternalLinks,
  posts,
  postTags,
  tags,
} from "@fwqgo/db/schema";

const MAX_RELATED_POST_LINKS = 5;
const MAX_RELATED_KNOWLEDGE_LINKS = 3;
const MAX_INLINE_LINKS = 4;
const AUTO_ACTIVATE_INLINE_SCORE = 80;

export type InternalLinkGenerationMode =
  "suggestions-only" | "activate-high-confidence";

export type PublicArticleInternalLink = {
  id: number;
  targetKey: string;
  targetType: string;
  placement: string;
  title: string;
  description: string | null;
  href: string;
  anchorText: string | null;
  occurrenceIndex: number;
  score: number;
  reason: string | null;
};

export type PublicArticleInternalLinks = {
  inline: PublicArticleInternalLink[];
  relatedKnowledge: PublicArticleInternalLink[];
  relatedPosts: PublicArticleInternalLink[];
  nextSteps: PublicArticleInternalLink[];
};

export type AdminPostInternalLink = {
  id: number;
  sourcePostId: number;
  targetKey: string;
  targetType: string;
  placement: string;
  targetTitle: string;
  anchorText: string | null;
  sourceExcerpt: string | null;
  score: number;
  reason: string | null;
  generatedBy: string;
  status: string;
  auditIssues: string[];
  updatedAt: Date | null;
};

function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function keywordList(value: string | null | undefined) {
  return (value ?? "")
    .split(/[,，、;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function nonEmptyOr(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  if (normalized) return normalized;
  return fallback;
}

function excerptForAnchor(content: string, anchor: string) {
  const index = content.toLowerCase().indexOf(anchor.toLowerCase());
  if (index < 0) return null;
  return content
    .slice(Math.max(0, index - 80), index + anchor.length + 120)
    .replace(/\s+/g, " ")
    .trim();
}

async function loadTagsByPostIds(postIds: number[]) {
  if (postIds.length === 0) return new Map<number, TagRelevanceCandidate[]>();

  const rows = await db
    .select({
      postId: postTags.postId,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      enName: tags.enName,
      enSlug: tags.enSlug,
      keywords: tags.keywords,
      enKeywords: tags.enKeywords,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, postIds));
  const result = new Map<number, TagRelevanceCandidate[]>();
  for (const row of rows) {
    const items = result.get(row.postId) ?? [];
    items.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      enName: row.enName,
      enSlug: row.enSlug,
      keywords: row.keywords,
      enKeywords: row.enKeywords,
    });
    result.set(row.postId, items);
  }
  return result;
}

async function loadGenerationContext(postId: number) {
  const [sourcePost] = await db
    .select({
      id: posts.id,
      title: posts.title,
      description: posts.description,
      content: posts.content,
      keywords: posts.keywords,
      categoryId: posts.categoryId,
      recommendedTagId: posts.recommendedTagId,
      language: posts.language,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (
    !sourcePost ||
    (sourcePost.language !== "zh" && sourcePost.language !== "en")
  ) {
    return null;
  }

  const relatedPostRows = await db
    .select({
      id: posts.id,
      title: posts.title,
      description: posts.description,
      keywords: posts.keywords,
      categoryId: posts.categoryId,
      recommendedTagId: posts.recommendedTagId,
    })
    .from(posts)
    .where(
      and(
        eq(posts.language, sourcePost.language),
        eq(posts.published, true),
        ne(posts.id, sourcePost.id),
      ),
    )
    .limit(300);
  const allPostIds = [sourcePost.id, ...relatedPostRows.map((post) => post.id)];
  const tagMap = await loadTagsByPostIds(allPostIds);
  const sourceTags = tagMap.get(sourcePost.id) ?? [];
  const parsedKeywords = keywordList(sourcePost.keywords);
  const source: ArticleRelevanceSource = {
    title: sourcePost.title,
    description: sourcePost.description,
    content: sourcePost.content,
    keywords: sourcePost.keywords,
    categoryId: sourcePost.categoryId,
    recommendedTagId: sourcePost.recommendedTagId,
    tagIds: sourceTags.map((tag) => tag.id),
    tagNames: sourceTags.map((tag) => tag.name),
    primaryKeyword: parsedKeywords[0] ?? null,
    secondaryKeywords: parsedKeywords.slice(1),
  };
  const relatedPosts: Array<
    RelatedPostRelevanceCandidate & { slug: string | null }
  > = relatedPostRows.map((post) => {
    const postTagRows = tagMap.get(post.id) ?? [];
    return {
      ...post,
      slug: null,
      tagIds: postTagRows.map((tag) => tag.id),
      tagNames: postTagRows.map((tag) => tag.name),
    };
  });

  const knowledgeRows = await db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      summary: knowledgeArticles.summary,
      keywords: knowledgeArticles.keywords,
      aliases: knowledgeArticles.aliases,
      retrievalTerms: knowledgeArticles.retrievalTerms,
    })
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.language, sourcePost.language),
        eq(knowledgeArticles.published, true),
        ne(knowledgeArticles.contentRole, "post_purchase_guide"),
      ),
    )
    .limit(300);

  return {
    sourcePost,
    source,
    sourceTags,
    relatedPosts,
    knowledgeRows: knowledgeRows satisfies KnowledgeRelevanceCandidate[],
  };
}

export async function regeneratePostInternalLinks(input: {
  postId: number;
  mode?: InternalLinkGenerationMode;
  generatedBy?: "rule" | "ai" | "manual";
}) {
  const context = await loadGenerationContext(input.postId);
  if (!context) throw new Error("文章不存在或语言不受支持");

  const mode = input.mode ?? "activate-high-confidence";
  const generatedBy = input.generatedBy ?? "rule";
  const sourceLanguage: ArticleLinkLanguage =
    context.sourcePost.language === "en" ? "en" : "zh";
  const sourceContentHash = contentHash(context.sourcePost.content);
  const existingProtected = await db
    .select({
      targetKey: postInternalLinks.targetKey,
      placement: postInternalLinks.placement,
      status: postInternalLinks.status,
      generatedBy: postInternalLinks.generatedBy,
    })
    .from(postInternalLinks)
    .where(
      and(
        eq(postInternalLinks.sourcePostId, input.postId),
        or(
          eq(postInternalLinks.status, "rejected"),
          and(
            eq(postInternalLinks.generatedBy, "manual"),
            ne(postInternalLinks.status, "stale"),
          ),
        ),
      ),
    );
  const protectedKeys = new Set(
    existingProtected.map((item) => `${item.targetKey}:${item.placement}`),
  );

  const relatedPostLinks = context.relatedPosts
    .map((candidate) => ({
      candidate,
      relevance: scoreRelatedPost(context.source, candidate),
    }))
    .filter(({ relevance }) => relevance.score >= 15)
    .sort(
      (left, right) =>
        right.relevance.score - left.relevance.score ||
        right.candidate.id - left.candidate.id,
    )
    .slice(0, MAX_RELATED_POST_LINKS)
    .map(
      ({ candidate, relevance }) =>
        ({
          sourcePostId: input.postId,
          targetType: "post",
          targetKey: `post:${candidate.id}`,
          targetPostId: candidate.id,
          language: context.sourcePost.language,
          placement: "related_post",
          score: relevance.score,
          reason: relevance.reasons.join("；"),
          generatedBy,
          status: mode === "suggestions-only" ? "suggested" : "active",
          sourceContentHash,
        }) as const,
    );

  const scoredTags = context.sourceTags
    .filter(
      (candidate) =>
        sourceLanguage !== "en" ||
        Boolean(
          resolveEnglishTagIdentity({
            name: candidate.name,
            slug: candidate.slug ?? "",
            enName: candidate.enName,
            enSlug: candidate.enSlug,
          }),
        ),
    )
    .flatMap((candidate) => {
      const anchorText = findTagAnchorInContent(
        context.sourcePost.content,
        candidate,
        sourceLanguage,
      );
      return anchorText ? [{ candidate, anchorText }] : [];
    })
    .sort(
      (left, right) =>
        right.anchorText.length - left.anchorText.length ||
        right.candidate.id - left.candidate.id,
    );
  const inlineLinks = scoredTags
    .slice(0, MAX_INLINE_LINKS)
    .map(({ candidate, anchorText }) => {
      const isRecommended = candidate.id === context.source.recommendedTagId;
      const score = Math.min(
        100,
        80 + anchorText.length + (isRecommended ? 10 : 0),
      );
      return {
        sourcePostId: input.postId,
        targetType: "tag",
        targetKey: `tag:${candidate.id}`,
        targetTagId: candidate.id,
        language: context.sourcePost.language,
        placement: "inline",
        anchorText,
        sourceExcerpt: excerptForAnchor(context.sourcePost.content, anchorText),
        occurrenceIndex: 0,
        score,
        reason: isRecommended
          ? `正文命中标签：${anchorText}；推荐标签`
          : `正文命中标签：${anchorText}`,
        generatedBy,
        status:
          mode === "activate-high-confidence" &&
          score >= AUTO_ACTIVATE_INLINE_SCORE
            ? "active"
            : "suggested",
        sourceContentHash,
      } as const;
    });

  const scoredKnowledge = context.knowledgeRows
    .map((candidate) => ({
      candidate,
      relevance: scoreKnowledgeArticle(context.source, candidate),
    }))
    .filter(({ relevance }) => relevance.score >= 30)
    .sort(
      (left, right) =>
        right.relevance.score - left.relevance.score ||
        right.candidate.id - left.candidate.id,
    );
  const relatedKnowledgeLinks = scoredKnowledge
    .slice(0, MAX_RELATED_KNOWLEDGE_LINKS)
    .map(
      ({ candidate, relevance }) =>
        ({
          sourcePostId: input.postId,
          targetType: "knowledge",
          targetKey: `knowledge:${candidate.id}`,
          targetKnowledgeArticleId: candidate.id,
          language: context.sourcePost.language,
          placement: "related_knowledge",
          score: relevance.score,
          reason: relevance.reasons.join("；"),
          generatedBy,
          status: mode === "suggestions-only" ? "suggested" : "active",
          sourceContentHash,
        }) as const,
    );

  const generated = [
    ...relatedPostLinks,
    ...inlineLinks,
    ...relatedKnowledgeLinks,
  ].filter((link) => !protectedKeys.has(`${link.targetKey}:${link.placement}`));

  await db.transaction(async (tx) => {
    await tx
      .delete(postInternalLinks)
      .where(
        and(
          eq(postInternalLinks.sourcePostId, input.postId),
          ne(postInternalLinks.status, "rejected"),
          or(
            ne(postInternalLinks.generatedBy, "manual"),
            eq(postInternalLinks.status, "stale"),
          ),
        ),
      );
    if (generated.length > 0) {
      await tx.insert(postInternalLinks).values(generated);
    }
  });

  return {
    generated: generated.length,
    active: generated.filter((link) => link.status === "active").length,
    suggested: generated.filter((link) => link.status === "suggested").length,
    sourceContentHash,
  };
}

function localizedCategoryHref(input: {
  language: ArticleLinkLanguage;
  slug: string;
  enSlug: string | null;
}) {
  const slug =
    input.language === "en" ? nonEmptyOr(input.enSlug, input.slug) : input.slug;
  return `${input.language === "en" ? "/en" : ""}/fwq/${encodeURIComponent(slug)}/page/1`;
}

function localizedTagHref(input: {
  language: ArticleLinkLanguage;
  slug: string;
  enSlug: string | null;
}) {
  const slug =
    input.language === "en" ? nonEmptyOr(input.enSlug, input.slug) : input.slug;
  return `${input.language === "en" ? "/en" : ""}/fwq/tags/${encodeURIComponent(slug)}/page/1`;
}

export async function readPublicPostInternalLinks(
  postId: number,
  language: ArticleLinkLanguage,
): Promise<PublicArticleInternalLinks> {
  const [sourcePost] = await readDb
    .select({ content: posts.content, language: posts.language })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (sourcePost?.language !== language) {
    return {
      inline: [],
      relatedKnowledge: [],
      relatedPosts: [],
      nextSteps: [],
    };
  }
  const currentContentHash = contentHash(sourcePost.content);

  const rows = await readDb
    .select({
      id: postInternalLinks.id,
      targetKey: postInternalLinks.targetKey,
      targetType: postInternalLinks.targetType,
      placement: postInternalLinks.placement,
      anchorText: postInternalLinks.anchorText,
      occurrenceIndex: postInternalLinks.occurrenceIndex,
      score: postInternalLinks.score,
      reason: postInternalLinks.reason,
      generatedBy: postInternalLinks.generatedBy,
      targetPath: postInternalLinks.targetPath,
      sourceContentHash: postInternalLinks.sourceContentHash,
      postTitle: posts.title,
      postDescription: posts.description,
      postSlug: posts.slug,
      postLanguage: posts.language,
      postPublished: posts.published,
      knowledgeTitle: knowledgeArticles.title,
      knowledgeSummary: knowledgeArticles.summary,
      knowledgeSlug: knowledgeArticles.slug,
      knowledgeLanguage: knowledgeArticles.language,
      knowledgePublished: knowledgeArticles.published,
      knowledgeContentRole: knowledgeArticles.contentRole,
      categoryName: categories.name,
      categoryEnName: categories.enName,
      categorySlug: categories.slug,
      categoryEnSlug: categories.enSlug,
      tagName: tags.name,
      tagEnName: tags.enName,
      tagSlug: tags.slug,
      tagEnSlug: tags.enSlug,
    })
    .from(postInternalLinks)
    .leftJoin(posts, eq(postInternalLinks.targetPostId, posts.id))
    .leftJoin(
      knowledgeArticles,
      eq(postInternalLinks.targetKnowledgeArticleId, knowledgeArticles.id),
    )
    .leftJoin(categories, eq(postInternalLinks.targetCategoryId, categories.id))
    .leftJoin(tags, eq(postInternalLinks.targetTagId, tags.id))
    .where(
      and(
        eq(postInternalLinks.sourcePostId, postId),
        eq(postInternalLinks.language, language),
        eq(postInternalLinks.status, "active"),
      ),
    );

  const links = rows.flatMap((row): PublicArticleInternalLink[] => {
    if (row.sourceContentHash !== currentContentHash) return [];
    if (
      row.placement === "inline" &&
      row.targetType === "knowledge" &&
      row.generatedBy !== "manual"
    ) {
      return [];
    }
    if (
      row.targetType === "post" &&
      row.postPublished &&
      row.postLanguage === language &&
      row.postTitle &&
      row.postSlug
    ) {
      return [
        {
          id: row.id,
          targetKey: row.targetKey,
          targetType: row.targetType,
          placement: row.placement,
          title: row.postTitle,
          description: row.postDescription,
          href: `${language === "en" ? "/en" : ""}/fwq/posts/${encodeURIComponent(row.postSlug)}`,
          anchorText: row.anchorText,
          occurrenceIndex: row.occurrenceIndex,
          score: row.score,
          reason: row.reason,
        },
      ];
    }
    if (
      row.targetType === "knowledge" &&
      row.knowledgePublished &&
      row.knowledgeLanguage === language &&
      row.knowledgeContentRole !== "post_purchase_guide" &&
      row.knowledgeTitle &&
      row.knowledgeSlug
    ) {
      return [
        {
          id: row.id,
          targetKey: row.targetKey,
          targetType: row.targetType,
          placement: row.placement,
          title: row.knowledgeTitle,
          description: row.knowledgeSummary,
          href: `${language === "en" ? "/en" : ""}/knowledge/${encodeURIComponent(row.knowledgeSlug)}`,
          anchorText: row.anchorText,
          occurrenceIndex: row.occurrenceIndex,
          score: row.score,
          reason: row.reason,
        },
      ];
    }
    if (row.targetType === "category" && row.categoryName && row.categorySlug) {
      return [
        {
          id: row.id,
          targetKey: row.targetKey,
          targetType: row.targetType,
          placement: row.placement,
          title:
            language === "en"
              ? nonEmptyOr(row.categoryEnName, row.categoryName)
              : row.categoryName,
          description: null,
          href: localizedCategoryHref({
            language,
            slug: row.categorySlug,
            enSlug: row.categoryEnSlug,
          }),
          anchorText: row.anchorText,
          occurrenceIndex: row.occurrenceIndex,
          score: row.score,
          reason: row.reason,
        },
      ];
    }
    if (row.targetType === "tag" && row.tagName && row.tagSlug) {
      return [
        {
          id: row.id,
          targetKey: row.targetKey,
          targetType: row.targetType,
          placement: row.placement,
          title:
            language === "en"
              ? nonEmptyOr(row.tagEnName, row.tagName)
              : row.tagName,
          description: null,
          href: localizedTagHref({
            language,
            slug: row.tagSlug,
            enSlug: row.tagEnSlug,
          }),
          anchorText: row.anchorText,
          occurrenceIndex: row.occurrenceIndex,
          score: row.score,
          reason: row.reason,
        },
      ];
    }
    if (
      (row.targetType === "tool" || row.targetType === "server_topic") &&
      row.targetPath?.startsWith("/") &&
      !row.targetPath?.startsWith("//")
    ) {
      return [
        {
          id: row.id,
          targetKey: row.targetKey,
          targetType: row.targetType,
          placement: row.placement,
          title: row.anchorText ?? row.targetKey,
          description: null,
          href: row.targetPath,
          anchorText: row.anchorText,
          occurrenceIndex: row.occurrenceIndex,
          score: row.score,
          reason: row.reason,
        },
      ];
    }
    return [];
  });
  const byPlacement = (placement: string) =>
    links
      .filter((link) => link.placement === placement)
      .sort((left, right) => right.score - left.score);

  return {
    inline: byPlacement("inline").slice(0, MAX_INLINE_LINKS),
    relatedKnowledge: byPlacement("related_knowledge").slice(
      0,
      MAX_RELATED_KNOWLEDGE_LINKS,
    ),
    relatedPosts: byPlacement("related_post").slice(0, MAX_RELATED_POST_LINKS),
    nextSteps: byPlacement("next_step").slice(0, 2),
  };
}

export async function markPostInternalLinksStale(postId: number) {
  await db
    .update(postInternalLinks)
    .set({ status: "stale", updatedAt: new Date() })
    .where(
      and(
        eq(postInternalLinks.sourcePostId, postId),
        inArray(postInternalLinks.status, ["suggested", "approved", "active"]),
      ),
    );
}

export async function readAdminPostInternalLinks(
  postId: number,
): Promise<AdminPostInternalLink[]> {
  const [sourcePost] = await readDb
    .select({
      content: posts.content,
      language: posts.language,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!sourcePost) return [];
  const currentContentHash = contentHash(sourcePost.content);

  const rows = await readDb
    .select({
      id: postInternalLinks.id,
      sourcePostId: postInternalLinks.sourcePostId,
      targetKey: postInternalLinks.targetKey,
      targetType: postInternalLinks.targetType,
      placement: postInternalLinks.placement,
      anchorText: postInternalLinks.anchorText,
      sourceExcerpt: postInternalLinks.sourceExcerpt,
      score: postInternalLinks.score,
      reason: postInternalLinks.reason,
      generatedBy: postInternalLinks.generatedBy,
      status: postInternalLinks.status,
      updatedAt: postInternalLinks.updatedAt,
      postTitle: posts.title,
      knowledgeTitle: knowledgeArticles.title,
      categoryName: categories.name,
      tagName: tags.name,
      targetPath: postInternalLinks.targetPath,
      language: postInternalLinks.language,
      sourceContentHash: postInternalLinks.sourceContentHash,
      targetPostId: postInternalLinks.targetPostId,
      postLanguage: posts.language,
      postPublished: posts.published,
      knowledgeLanguage: knowledgeArticles.language,
      knowledgePublished: knowledgeArticles.published,
    })
    .from(postInternalLinks)
    .leftJoin(posts, eq(postInternalLinks.targetPostId, posts.id))
    .leftJoin(
      knowledgeArticles,
      eq(postInternalLinks.targetKnowledgeArticleId, knowledgeArticles.id),
    )
    .leftJoin(categories, eq(postInternalLinks.targetCategoryId, categories.id))
    .leftJoin(tags, eq(postInternalLinks.targetTagId, tags.id))
    .where(eq(postInternalLinks.sourcePostId, postId));

  return rows
    .map((row) => {
      const auditIssues: string[] = [];
      if (row.language !== sourcePost.language) auditIssues.push("跨语言");
      if (row.sourceContentHash !== currentContentHash)
        auditIssues.push("正文已变化");
      if (row.targetPostId === postId) auditIssues.push("指向自身");
      if (row.targetType === "post" && !row.postPublished) {
        auditIssues.push("目标文章未发布或已删除");
      }
      if (
        row.targetType === "post" &&
        row.postLanguage !== sourcePost.language
      ) {
        auditIssues.push("目标文章语言不一致");
      }
      if (row.targetType === "knowledge" && !row.knowledgePublished) {
        auditIssues.push("目标知识未发布或已删除");
      }
      if (
        row.targetType === "knowledge" &&
        row.knowledgeLanguage !== sourcePost.language
      ) {
        auditIssues.push("目标知识语言不一致");
      }
      if (
        row.placement === "inline" &&
        (!row.anchorText ||
          !sourcePost.content
            .toLowerCase()
            .includes(row.anchorText.toLowerCase()))
      ) {
        auditIssues.push("正文中找不到锚文本");
      }
      return {
        id: row.id,
        sourcePostId: row.sourcePostId,
        targetKey: row.targetKey,
        targetType: row.targetType,
        placement: row.placement,
        targetTitle:
          row.postTitle ??
          row.knowledgeTitle ??
          row.categoryName ??
          row.tagName ??
          row.targetPath ??
          row.targetKey,
        anchorText: row.anchorText,
        sourceExcerpt: row.sourceExcerpt,
        score: row.score,
        reason: row.reason,
        generatedBy: row.generatedBy,
        status: row.status,
        auditIssues,
        updatedAt: row.updatedAt,
      };
    })
    .sort((left, right) => right.score - left.score || right.id - left.id);
}

export async function updatePostInternalLink(input: {
  id: number;
  status: "suggested" | "active" | "rejected" | "stale";
  anchorText?: string | null;
}) {
  const [current] = await db
    .select({
      id: postInternalLinks.id,
      sourcePostId: postInternalLinks.sourcePostId,
      placement: postInternalLinks.placement,
      anchorText: postInternalLinks.anchorText,
      content: posts.content,
      language: posts.language,
      status: postInternalLinks.status,
      sourceContentHash: postInternalLinks.sourceContentHash,
      targetPostId: postInternalLinks.targetPostId,
      targetKnowledgeArticleId: postInternalLinks.targetKnowledgeArticleId,
    })
    .from(postInternalLinks)
    .innerJoin(posts, eq(postInternalLinks.sourcePostId, posts.id))
    .where(eq(postInternalLinks.id, input.id))
    .limit(1);
  if (!current) throw new Error("内链记录不存在");

  if (input.status === "active" && current.status === "stale") {
    throw new Error("正文已变化，请重新生成内链后再启用");
  }

  if (input.status === "active") {
    if (current.sourceContentHash !== contentHash(current.content)) {
      throw new Error("正文已变化，请重新生成内链后再启用");
    }
    if (current.targetPostId) {
      const [target] = await db
        .select({ language: posts.language, published: posts.published })
        .from(posts)
        .where(eq(posts.id, current.targetPostId))
        .limit(1);
      if (!target?.published || target.language !== current.language) {
        throw new Error("目标文章未发布或语言不一致，不能启用");
      }
    }
    if (current.targetKnowledgeArticleId) {
      const [target] = await db
        .select({
          language: knowledgeArticles.language,
          published: knowledgeArticles.published,
        })
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.id, current.targetKnowledgeArticleId))
        .limit(1);
      if (!target?.published || target.language !== current.language) {
        throw new Error("目标知识未发布或语言不一致，不能启用");
      }
    }
  }

  const normalizedAnchorText = input.anchorText?.trim();
  let anchorText = current.anchorText;
  if (normalizedAnchorText) anchorText = normalizedAnchorText;
  if (
    input.status === "active" &&
    current.placement === "inline" &&
    (!anchorText ||
      !current.content.toLowerCase().includes(anchorText.toLowerCase()))
  ) {
    throw new Error("正文中找不到该锚文本，不能启用正文内链");
  }

  const [updated] = await db
    .update(postInternalLinks)
    .set({
      status: input.status,
      anchorText,
      sourceContentHash: contentHash(current.content),
      generatedBy: "manual",
      updatedAt: new Date(),
    })
    .where(eq(postInternalLinks.id, input.id))
    .returning({
      id: postInternalLinks.id,
      sourcePostId: postInternalLinks.sourcePostId,
    });
  if (!updated) throw new Error("内链更新失败");
  return updated;
}
