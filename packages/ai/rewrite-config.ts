import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { aiRewriteConfigs } from "@fwqgo/db/schema";
import {
  defaultBaseRewritePrompt,
  defaultEnglishMetadataStylePrompt,
  defaultEnglishStylePrompt,
  defaultMetadataPrompt,
  defaultMetadataStylePrompt,
} from "@fwqgo/core/ai-rewrite-prompts";

export const aiProviderOptions = ["openai", "deepseek", "compatible"] as const;
export type AiProvider = (typeof aiProviderOptions)[number];

export type AiRewriteConfigInput = {
  name: string;
  provider: AiProvider;
  baseUrl: string;
  apiKey?: string;
  model: string;
  basePrompt: string;
  metadataPrompt: string;
  styleName: string;
  stylePrompt: string;
  metadataStylePrompt: string;
  englishStylePrompt: string;
  englishMetadataStylePrompt: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  isDefault: boolean;
};

export type AiRewriteConfig = Awaited<ReturnType<typeof getAiRewriteConfigs>>[number];

type ConfigTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const AI_REWRITE_DEFAULT_LOCK_ID = 9_021_001;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function maskApiKey(apiKey: string | null) {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

export async function getAiRewriteConfigs() {
  const rows = await db
    .select({
      id: aiRewriteConfigs.id,
      name: aiRewriteConfigs.name,
      provider: aiRewriteConfigs.provider,
      baseUrl: aiRewriteConfigs.baseUrl,
      model: aiRewriteConfigs.model,
      basePrompt: aiRewriteConfigs.basePrompt,
      metadataPrompt: aiRewriteConfigs.metadataPrompt,
      styleName: aiRewriteConfigs.styleName,
      stylePrompt: aiRewriteConfigs.stylePrompt,
      metadataStylePrompt: aiRewriteConfigs.metadataStylePrompt,
      englishStylePrompt: aiRewriteConfigs.englishStylePrompt,
      englishMetadataStylePrompt: aiRewriteConfigs.englishMetadataStylePrompt,
      temperature: aiRewriteConfigs.temperature,
      maxTokens: aiRewriteConfigs.maxTokens,
      enabled: aiRewriteConfigs.enabled,
      isDefault: aiRewriteConfigs.isDefault,
      createdAt: aiRewriteConfigs.createdAt,
      updatedAt: aiRewriteConfigs.updatedAt,
      apiKey: aiRewriteConfigs.apiKey,
    })
    .from(aiRewriteConfigs)
    .orderBy(desc(aiRewriteConfigs.isDefault), desc(aiRewriteConfigs.id));

  return rows.map((row) => ({
    ...row,
    provider: row.provider as AiProvider,
    basePrompt: row.basePrompt ?? defaultBaseRewritePrompt,
    metadataPrompt: row.metadataPrompt ?? defaultMetadataPrompt,
    metadataStylePrompt:
      row.metadataStylePrompt ?? defaultMetadataStylePrompt,
    englishStylePrompt: row.englishStylePrompt ?? defaultEnglishStylePrompt,
    englishMetadataStylePrompt:
      row.englishMetadataStylePrompt ?? defaultEnglishMetadataStylePrompt,
    hasApiKey: Boolean(row.apiKey),
    apiKeyPreview: maskApiKey(row.apiKey),
    apiKey: undefined,
  }));
}

export async function getActiveAiRewriteConfig(styleId?: number) {
  const where = styleId
    ? and(eq(aiRewriteConfigs.id, styleId), eq(aiRewriteConfigs.enabled, true))
    : and(eq(aiRewriteConfigs.enabled, true), eq(aiRewriteConfigs.isDefault, true));

  const [preferred] = await db
    .select()
    .from(aiRewriteConfigs)
    .where(where)
    .limit(1);

  if (preferred) return preferred;

  if (styleId) return null;

  const [fallback] = await db
    .select()
    .from(aiRewriteConfigs)
    .where(eq(aiRewriteConfigs.enabled, true))
    .orderBy(desc(aiRewriteConfigs.id))
    .limit(1);

  return fallback ?? null;
}

export async function getAiRewriteConfigForStatusCheck(id: number) {
  const [config] = await db
    .select()
    .from(aiRewriteConfigs)
    .where(eq(aiRewriteConfigs.id, id))
    .limit(1);

  return config
    ? {
        ...config,
        provider: config.provider as AiProvider,
        basePrompt: config.basePrompt ?? defaultBaseRewritePrompt,
        metadataPrompt: config.metadataPrompt ?? defaultMetadataPrompt,
        metadataStylePrompt:
          config.metadataStylePrompt ?? defaultMetadataStylePrompt,
        englishStylePrompt: config.englishStylePrompt ?? defaultEnglishStylePrompt,
        englishMetadataStylePrompt:
          config.englishMetadataStylePrompt ?? defaultEnglishMetadataStylePrompt,
      }
    : null;
}

async function lockDefaultSelection(tx: ConfigTransaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${AI_REWRITE_DEFAULT_LOCK_ID})`,
  );
}

async function unsetOtherDefaults(tx: ConfigTransaction) {
  await tx
    .update(aiRewriteConfigs)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(aiRewriteConfigs.isDefault, true));
}

async function ensureEnabledDefault(tx: ConfigTransaction) {
  const [currentDefault] = await tx
    .select({ id: aiRewriteConfigs.id })
    .from(aiRewriteConfigs)
    .where(
      and(
        eq(aiRewriteConfigs.enabled, true),
        eq(aiRewriteConfigs.isDefault, true),
      ),
    )
    .limit(1);

  if (currentDefault) return;

  const [fallback] = await tx
    .select({ id: aiRewriteConfigs.id })
    .from(aiRewriteConfigs)
    .where(eq(aiRewriteConfigs.enabled, true))
    .orderBy(desc(aiRewriteConfigs.id))
    .limit(1);

  if (fallback) {
    await tx
      .update(aiRewriteConfigs)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(aiRewriteConfigs.id, fallback.id));
  }
}

export async function createAiRewriteConfig(input: AiRewriteConfigInput) {
  if (input.isDefault && !input.enabled) {
    throw new Error("默认 AI 改写配置必须同时启用");
  }

  return db.transaction(async (tx) => {
    await lockDefaultSelection(tx);
    if (input.isDefault) {
      await unsetOtherDefaults(tx);
    }

    const [created] = await tx
      .insert(aiRewriteConfigs)
      .values({
        ...input,
        baseUrl: normalizeBaseUrl(input.baseUrl),
        apiKey: input.apiKey?.trim() ? input.apiKey.trim() : null,
        basePrompt: input.basePrompt,
        metadataPrompt: input.metadataPrompt,
        metadataStylePrompt: input.metadataStylePrompt,
        englishStylePrompt: input.englishStylePrompt,
        englishMetadataStylePrompt: input.englishMetadataStylePrompt,
      })
      .returning({ id: aiRewriteConfigs.id });

    await ensureEnabledDefault(tx);
    return created;
  });
}

export async function updateAiRewriteConfig(
  id: number,
  input: AiRewriteConfigInput,
) {
  if (input.isDefault && !input.enabled) {
    throw new Error("默认 AI 改写配置必须同时启用");
  }

  const values: Partial<typeof aiRewriteConfigs.$inferInsert> = {
    name: input.name,
    provider: input.provider,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model,
    basePrompt: input.basePrompt,
    metadataPrompt: input.metadataPrompt,
    styleName: input.styleName,
    stylePrompt: input.stylePrompt,
    metadataStylePrompt: input.metadataStylePrompt,
    englishStylePrompt: input.englishStylePrompt,
    englishMetadataStylePrompt: input.englishMetadataStylePrompt,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    enabled: input.enabled,
    isDefault: input.isDefault,
    updatedAt: new Date(),
  };

  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    values.apiKey = input.apiKey.trim();
  }

  return db.transaction(async (tx) => {
    await lockDefaultSelection(tx);
    if (input.isDefault) {
      await unsetOtherDefaults(tx);
    }

    const [updated] = await tx
      .update(aiRewriteConfigs)
      .set(values)
      .where(eq(aiRewriteConfigs.id, id))
      .returning({ id: aiRewriteConfigs.id });

    await ensureEnabledDefault(tx);
    return updated;
  });
}

export async function deleteAiRewriteConfig(id: number) {
  await db.transaction(async (tx) => {
    await lockDefaultSelection(tx);
    await tx.delete(aiRewriteConfigs).where(eq(aiRewriteConfigs.id, id));
    await ensureEnabledDefault(tx);
  });
}
