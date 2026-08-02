import { and, asc, eq, max } from "drizzle-orm";

import { db, readDb } from "@fwqgo/db";
import {
  knowledgeArticleSources,
  knowledgeArticles,
  knowledgeSourceRevisions,
  knowledgeSources,
} from "@fwqgo/db/schema";

export type SourceAuthorityTier = "A" | "B" | "C";
export type KnowledgeSourceStatus =
  "active" | "superseded" | "broken" | "retired";

export type RegisterKnowledgeSourceInput = {
  sourceKey: string;
  kind: string;
  authorityTier: SourceAuthorityTier;
  publisher: string;
  title: string;
  canonicalUrl: string;
  publishedAt?: Date | null;
  retrievedAt?: Date;
  contentHash: string;
  changeReason?: string | null;
  reviewDueAt?: Date | null;
  validUntil?: Date | null;
  notes?: string | null;
};

export type AttachKnowledgeSourceInput = {
  articleId: number;
  expectedContentRevision: number;
  sources: Array<{
    sourceRevisionId: number;
    citationKey: string;
    claimScope: string;
    enClaimScope?: string;
    sortOrder?: number;
  }>;
};

type KnowledgeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function requiredText(value: string | null | undefined, field: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field}不能为空`);
  return normalized;
}

function validateCanonicalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("来源 URL 只允许 HTTP 或 HTTPS");
  }
  return url.toString();
}

async function lockSource(tx: KnowledgeTransaction, sourceId: number) {
  const [source] = await tx
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .for("update")
    .limit(1);
  if (!source) throw new Error("来源不存在");
  return source;
}

export async function registerKnowledgeSource(
  input: RegisterKnowledgeSourceInput,
  actorId: string | null = null,
) {
  const sourceKey = requiredText(input.sourceKey, "sourceKey");
  const kind = requiredText(input.kind, "来源类型");
  const publisher = requiredText(input.publisher, "发布者");
  const title = requiredText(input.title, "来源标题");
  const canonicalUrl = validateCanonicalUrl(
    requiredText(input.canonicalUrl, "来源 URL"),
  );
  const contentHash = requiredText(input.contentHash, "内容 hash");
  return db.transaction(async (tx) => {
    const [source] = await tx
      .insert(knowledgeSources)
      .values({
        sourceKey,
        kind,
        authorityTier: input.authorityTier,
        status: "active",
        reviewDueAt: input.reviewDueAt ?? null,
        validUntil: input.validUntil ?? null,
        notes: input.notes?.trim() ?? null,
      })
      .returning();
    if (!source) throw new Error("来源创建失败");
    const [revision] = await tx
      .insert(knowledgeSourceRevisions)
      .values({
        sourceId: source.id,
        revision: 1,
        publisher,
        title,
        canonicalUrl,
        publishedAt: input.publishedAt ?? null,
        retrievedAt: input.retrievedAt ?? new Date(),
        contentHash,
        changeReason: input.changeReason?.trim() ?? "initial",
        createdBy: actorId,
      })
      .returning();
    if (!revision) throw new Error("来源 revision 创建失败");
    const [updated] = await tx
      .update(knowledgeSources)
      .set({ currentRevisionId: revision.id, updatedAt: new Date() })
      .where(eq(knowledgeSources.id, source.id))
      .returning();
    if (!updated) throw new Error("来源 current revision 更新失败");
    return { source: updated, revision };
  });
}

export async function createKnowledgeSourceRevision(
  sourceId: number,
  input: Omit<
    RegisterKnowledgeSourceInput,
    | "sourceKey"
    | "kind"
    | "authorityTier"
    | "reviewDueAt"
    | "validUntil"
    | "notes"
  > & {
    reviewDueAt?: Date | null;
    validUntil?: Date | null;
  },
  actorId: string | null = null,
) {
  return db.transaction(async (tx) => {
    const source = await lockSource(tx, sourceId);
    const [latest] = await tx
      .select({ revision: max(knowledgeSourceRevisions.revision) })
      .from(knowledgeSourceRevisions)
      .where(eq(knowledgeSourceRevisions.sourceId, source.id));
    const nextRevision = Number(latest?.revision ?? 0) + 1;
    const [revision] = await tx
      .insert(knowledgeSourceRevisions)
      .values({
        sourceId: source.id,
        revision: nextRevision,
        publisher: requiredText(input.publisher, "发布者"),
        title: requiredText(input.title, "来源标题"),
        canonicalUrl: validateCanonicalUrl(
          requiredText(input.canonicalUrl, "来源 URL"),
        ),
        publishedAt: input.publishedAt ?? null,
        retrievedAt: input.retrievedAt ?? new Date(),
        contentHash: requiredText(input.contentHash, "内容 hash"),
        changeReason: input.changeReason?.trim() ?? "revision",
        createdBy: actorId,
      })
      .returning();
    if (!revision) throw new Error("来源 revision 创建失败");
    const [updated] = await tx
      .update(knowledgeSources)
      .set({
        currentRevisionId: revision.id,
        reviewDueAt: input.reviewDueAt ?? source.reviewDueAt,
        validUntil: input.validUntil ?? source.validUntil,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(knowledgeSources.id, source.id))
      .returning();
    if (!updated) throw new Error("来源 revision 指针更新失败");
    return { source: updated, revision };
  });
}

export async function attachKnowledgeArticleSources(
  input: AttachKnowledgeSourceInput,
) {
  if (input.sources.length < 1 || input.sources.length > 20) {
    throw new Error("文章来源数量必须在 1 到 20 条之间");
  }
  const citationKeys = new Set<string>();
  for (const source of input.sources) {
    const citationKey = requiredText(source.citationKey, "citationKey");
    const claimScope = requiredText(source.claimScope, "claimScope");
    if (citationKeys.has(citationKey)) throw new Error("citationKey 不能重复");
    citationKeys.add(citationKey);
    source.citationKey = citationKey;
    source.claimScope = claimScope;
  }
  return db.transaction(async (tx) => {
    const [article] = await tx
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, input.articleId))
      .for("update")
      .limit(1);
    if (!article) throw new Error("知识条目不存在");
    if (article.contentRevision !== input.expectedContentRevision) {
      throw new Error("知识条目已被其他编辑修改，请刷新后重试");
    }
    const [translation] =
      article.language === "zh"
        ? await tx
            .select()
            .from(knowledgeArticles)
            .where(
              and(
                eq(knowledgeArticles.translationSourceArticleId, article.id),
                eq(knowledgeArticles.language, "en"),
              ),
            )
            .for("update")
            .limit(1)
        : [];
    for (const item of input.sources) {
      const [revision] = await tx
        .select({ id: knowledgeSourceRevisions.id })
        .from(knowledgeSourceRevisions)
        .innerJoin(
          knowledgeSources,
          eq(knowledgeSources.id, knowledgeSourceRevisions.sourceId),
        )
        .where(
          and(
            eq(knowledgeSourceRevisions.id, item.sourceRevisionId),
            eq(knowledgeSources.status, "active"),
          ),
        )
        .limit(1);
      if (!revision) throw new Error("来源 revision 不存在或已停用");
    }
    await tx
      .delete(knowledgeArticleSources)
      .where(eq(knowledgeArticleSources.articleId, article.id));
    await tx.insert(knowledgeArticleSources).values(
      input.sources.map((item, index) => ({
        articleId: article.id,
        sourceRevisionId: item.sourceRevisionId,
        citationKey: item.citationKey,
        claimScope: item.claimScope,
        sortOrder: item.sortOrder ?? index,
      })),
    );
    if (translation) {
      await tx
        .delete(knowledgeArticleSources)
        .where(eq(knowledgeArticleSources.articleId, translation.id));
      await tx.insert(knowledgeArticleSources).values(
        input.sources.map((item, index) => ({
          articleId: translation.id,
          sourceRevisionId: item.sourceRevisionId,
          citationKey: item.citationKey,
          claimScope: item.enClaimScope?.trim() ?? item.claimScope,
          sortOrder: item.sortOrder ?? index,
        })),
      );
    }
    const now = new Date();
    const [updated] = await tx
      .update(knowledgeArticles)
      .set({
        contentRevision: article.contentRevision + 1,
        allowAiReference: false,
        contentUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(knowledgeArticles.id, article.id))
      .returning();
    if (!updated) throw new Error("文章来源保存失败");
    if (translation) {
      await tx
        .update(knowledgeArticles)
        .set({
          contentRevision: translation.contentRevision + 1,
          translatedFromRevision: null,
          allowAiReference: false,
          contentUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(knowledgeArticles.id, translation.id));
    }
    return updated;
  });
}

export async function listPublishedKnowledgeSources(articleId: number) {
  return readDb
    .select({
      citationKey: knowledgeArticleSources.citationKey,
      claimScope: knowledgeArticleSources.claimScope,
      sortOrder: knowledgeArticleSources.sortOrder,
      publisher: knowledgeSourceRevisions.publisher,
      title: knowledgeSourceRevisions.title,
      canonicalUrl: knowledgeSourceRevisions.canonicalUrl,
      publishedAt: knowledgeSourceRevisions.publishedAt,
      retrievedAt: knowledgeSourceRevisions.retrievedAt,
      authorityTier: knowledgeSources.authorityTier,
    })
    .from(knowledgeArticleSources)
    .innerJoin(
      knowledgeSourceRevisions,
      eq(knowledgeSourceRevisions.id, knowledgeArticleSources.sourceRevisionId),
    )
    .innerJoin(
      knowledgeSources,
      eq(knowledgeSources.id, knowledgeSourceRevisions.sourceId),
    )
    .where(
      and(
        eq(knowledgeArticleSources.articleId, articleId),
        eq(knowledgeSources.status, "active"),
      ),
    )
    .orderBy(asc(knowledgeArticleSources.sortOrder));
}
