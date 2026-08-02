"use server";

import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { db } from "@fwqgo/db";
import { knowledgeSourceRevisions, knowledgeSources } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  createKnowledgeSourceRevision as createKnowledgeSourceRevisionRecord,
  registerKnowledgeSource,
  attachKnowledgeArticleSources as attachKnowledgeArticleSourcesRecord,
} from "@/server/knowledge/source-service";

const sourceSchema = z.object({
  sourceKey: z.string().trim().min(1).max(180),
  kind: z.string().trim().min(1).max(32),
  authorityTier: z.enum(["A", "B", "C"]),
  publisher: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(500),
  canonicalUrl: z.string().trim().url().max(2_048),
  contentHash: z.string().trim().min(8).max(128),
  changeReason: z.string().trim().max(500).optional(),
  reviewDueAt: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2_000).optional(),
});

const revisionSchema = sourceSchema
  .omit({ sourceKey: true, kind: true, authorityTier: true, notes: true })
  .extend({ sourceId: postgresIntegerIdSchema });
const articleSourcesSchema = z.object({
  articleId: postgresIntegerIdSchema,
  expectedContentRevision: z.number().int().positive(),
  sources: z
    .array(
      z.object({
        sourceRevisionId: postgresIntegerIdSchema,
        citationKey: z.string().trim().min(1).max(80),
        claimScope: z.string().trim().min(1).max(2_000),
        enClaimScope: z.string().trim().max(2_000).optional(),
        sortOrder: z.number().int().min(0).max(100).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const createKnowledgeSource = defineAdminAction({
  action: "knowledge.source.create",
  entityType: "knowledge_source",
  parse: (input: z.input<typeof sourceSchema>) => sourceSchema.parse(input),
  execute: async (input, session) => {
    const result = await registerKnowledgeSource(input, session.userId);
    schedulePublicWebCache("knowledge.changed");
    return result;
  },
  successMessage: "来源及首个 revision 已创建",
  errorTitle: "来源创建失败",
  errorSuggestion: "请确认 sourceKey、URL、内容 hash 和来源等级正确。",
  entityId: (input) => input.sourceKey,
});

export const createKnowledgeSourceRevision = defineAdminAction({
  action: "knowledge.source.revision.create",
  entityType: "knowledge_source",
  parse: (input: z.input<typeof revisionSchema>) => revisionSchema.parse(input),
  execute: async (input, session) => {
    const result = await createKnowledgeSourceRevisionRecord(
      input.sourceId,
      input,
      session.userId,
    );
    schedulePublicWebCache("knowledge.changed");
    return result;
  },
  successMessage: "来源新 revision 已创建并切换当前指针",
  errorTitle: "来源 revision 创建失败",
  errorSuggestion: "历史 revision 不可修改，请检查 URL 和 hash 后重试。",
  entityId: (input) => input.sourceId,
});

export const attachKnowledgeArticleSources = defineAdminAction({
  action: "knowledge.article.sources.attach",
  entityType: "knowledge_article",
  parse: (input: z.input<typeof articleSourcesSchema>) =>
    articleSourcesSchema.parse(input),
  execute: async (input) => {
    const result = await attachKnowledgeArticleSourcesRecord(input);
    schedulePublicWebCache("knowledge.changed", {
      knowledgeArticleIds: [result.id],
    });
    return result;
  },
  successMessage: "文章来源已原子更新，中英文稿进入待同步状态",
  errorTitle: "文章来源更新失败",
  errorSuggestion: "请检查 revision、citationKey 和当前文章版本是否仍然有效。",
  entityId: (input) => input.articleId,
});

export async function getKnowledgeSourcesAdmin() {
  await requireAdminSession();
  return db
    .select({
      id: knowledgeSources.id,
      sourceKey: knowledgeSources.sourceKey,
      kind: knowledgeSources.kind,
      authorityTier: knowledgeSources.authorityTier,
      status: knowledgeSources.status,
      reviewDueAt: knowledgeSources.reviewDueAt,
      validUntil: knowledgeSources.validUntil,
      currentRevisionId: knowledgeSources.currentRevisionId,
      revision: knowledgeSourceRevisions.revision,
      title: knowledgeSourceRevisions.title,
      canonicalUrl: knowledgeSourceRevisions.canonicalUrl,
      retrievedAt: knowledgeSourceRevisions.retrievedAt,
    })
    .from(knowledgeSources)
    .leftJoin(
      knowledgeSourceRevisions,
      eq(knowledgeSourceRevisions.id, knowledgeSources.currentRevisionId),
    )
    .orderBy(
      asc(knowledgeSources.authorityTier),
      desc(knowledgeSources.updatedAt),
    );
}
