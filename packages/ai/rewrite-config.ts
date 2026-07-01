import { and, desc, eq } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { aiRewriteConfigs } from "@fwqgo/db/schema";
import {
  defaultBaseRewritePrompt,
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
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  isDefault: boolean;
};

export type AiRewriteConfig = Awaited<ReturnType<typeof getAiRewriteConfigs>>[number];

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

async function unsetOtherDefaults() {
  await db
    .update(aiRewriteConfigs)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(aiRewriteConfigs.isDefault, true));
}

export async function createAiRewriteConfig(input: AiRewriteConfigInput) {
  if (input.isDefault) {
    await unsetOtherDefaults();
  }

  const [created] = await db
    .insert(aiRewriteConfigs)
    .values({
      ...input,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      apiKey: input.apiKey?.trim() ? input.apiKey.trim() : null,
      basePrompt: input.basePrompt,
      metadataPrompt: input.metadataPrompt,
      metadataStylePrompt: input.metadataStylePrompt,
    })
    .returning({ id: aiRewriteConfigs.id });

  return created;
}

export async function updateAiRewriteConfig(
  id: number,
  input: AiRewriteConfigInput,
) {
  if (input.isDefault) {
    await unsetOtherDefaults();
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
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    enabled: input.enabled,
    isDefault: input.isDefault,
    updatedAt: new Date(),
  };

  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    values.apiKey = input.apiKey.trim();
  }

  const [updated] = await db
    .update(aiRewriteConfigs)
    .set(values)
    .where(eq(aiRewriteConfigs.id, id))
    .returning({ id: aiRewriteConfigs.id });

  return updated;
}

export async function deleteAiRewriteConfig(id: number) {
  await db.delete(aiRewriteConfigs).where(eq(aiRewriteConfigs.id, id));
}
