import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { aiRewriteConfigs } from "@fwqgo/db/schema";
import {
  defaultEnglishContentPrompt,
  defaultEnglishContinuationPrompt,
  defaultEnglishMetadataPrompt,
  defaultEnglishMetadataStylePrompt,
  defaultEnglishStylePrompt,
  defaultFactExtractionPrompt,
  defaultInitialRewriteFeedbackPrompt,
  defaultMetadataStylePrompt,
  defaultQualityReviewPrompt,
  defaultRewriteRetryPrompt,
  resolveMetadataPromptTemplate,
  resolveSourceAnchoredRewriteTemplate,
} from "@fwqgo/core/ai-rewrite-prompts";
import {
  decryptSecret,
  encryptSecret,
  hasSecretEncryptionKey,
  maskStoredSecret,
} from "@fwqgo/core/secret-envelope";

export const aiProviderOptions = ["openai", "deepseek", "compatible"] as const;
export type AiProvider = (typeof aiProviderOptions)[number];

export type AiRewriteConfigInput = {
  name: string;
  provider: AiProvider;
  baseUrl: string;
  apiKey?: string;
  model: string;
  factExtractionPrompt: string;
  basePrompt: string;
  initialRewritePrompt: string;
  rewriteRetryPrompt: string;
  qualityReviewPrompt: string;
  metadataPrompt: string;
  styleName: string;
  stylePrompt: string;
  metadataStylePrompt: string;
  englishContentPrompt: string;
  englishContinuationPrompt: string;
  englishMetadataPrompt: string;
  englishStylePrompt: string;
  englishMetadataStylePrompt: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  isDefault: boolean;
};

export type AiRewriteConfig = Awaited<
  ReturnType<typeof getAiRewriteConfigs>
>[number];

type ConfigTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const AI_REWRITE_DEFAULT_LOCK_ID = 9_021_001;

function withPromptDefaults<T extends typeof aiRewriteConfigs.$inferSelect>(
  row: T,
) {
  return {
    ...row,
    provider: row.provider as AiProvider,
    factExtractionPrompt:
      row.factExtractionPrompt ?? defaultFactExtractionPrompt,
    basePrompt: resolveSourceAnchoredRewriteTemplate(row.basePrompt),
    initialRewritePrompt:
      row.initialRewritePrompt ?? defaultInitialRewriteFeedbackPrompt,
    rewriteRetryPrompt: row.rewriteRetryPrompt ?? defaultRewriteRetryPrompt,
    qualityReviewPrompt: row.qualityReviewPrompt ?? defaultQualityReviewPrompt,
    metadataPrompt: resolveMetadataPromptTemplate(row.metadataPrompt),
    metadataStylePrompt: row.metadataStylePrompt ?? defaultMetadataStylePrompt,
    englishContentPrompt:
      row.englishContentPrompt ?? defaultEnglishContentPrompt,
    englishContinuationPrompt:
      row.englishContinuationPrompt ?? defaultEnglishContinuationPrompt,
    englishMetadataPrompt:
      row.englishMetadataPrompt ?? defaultEnglishMetadataPrompt,
    englishStylePrompt: row.englishStylePrompt ?? defaultEnglishStylePrompt,
    englishMetadataStylePrompt:
      row.englishMetadataStylePrompt ?? defaultEnglishMetadataStylePrompt,
  };
}

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function maskApiKey(apiKey: string | null) {
  return maskStoredSecret(apiKey);
}

async function resolveStoredApiKey<
  T extends { id: number; apiKey: string | null },
>(config: T): Promise<T> {
  if (!config.apiKey) return config;
  const decrypted = decryptSecret(config.apiKey);
  if (decrypted.needsMigration && hasSecretEncryptionKey()) {
    const encrypted = encryptSecret(decrypted.value);
    await db
      .update(aiRewriteConfigs)
      .set({ apiKey: encrypted, updatedAt: new Date() })
      .where(
        and(
          eq(aiRewriteConfigs.id, config.id),
          eq(aiRewriteConfigs.apiKey, config.apiKey),
        ),
      );
  }
  return { ...config, apiKey: decrypted.value };
}

export async function getAiRewriteConfigs() {
  const rows = await db
    .select({
      id: aiRewriteConfigs.id,
      name: aiRewriteConfigs.name,
      provider: aiRewriteConfigs.provider,
      baseUrl: aiRewriteConfigs.baseUrl,
      model: aiRewriteConfigs.model,
      factExtractionPrompt: aiRewriteConfigs.factExtractionPrompt,
      basePrompt: aiRewriteConfigs.basePrompt,
      initialRewritePrompt: aiRewriteConfigs.initialRewritePrompt,
      rewriteRetryPrompt: aiRewriteConfigs.rewriteRetryPrompt,
      qualityReviewPrompt: aiRewriteConfigs.qualityReviewPrompt,
      metadataPrompt: aiRewriteConfigs.metadataPrompt,
      styleName: aiRewriteConfigs.styleName,
      stylePrompt: aiRewriteConfigs.stylePrompt,
      metadataStylePrompt: aiRewriteConfigs.metadataStylePrompt,
      englishContentPrompt: aiRewriteConfigs.englishContentPrompt,
      englishContinuationPrompt: aiRewriteConfigs.englishContinuationPrompt,
      englishMetadataPrompt: aiRewriteConfigs.englishMetadataPrompt,
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

  return rows.map((row) => {
    const normalized = withPromptDefaults(row);
    return {
      ...normalized,
      hasApiKey: Boolean(row.apiKey),
      apiKeyPreview: maskApiKey(row.apiKey),
      apiKey: undefined,
    };
  });
}

export async function getActiveAiRewriteConfig(styleId?: number) {
  const where = styleId
    ? and(eq(aiRewriteConfigs.id, styleId), eq(aiRewriteConfigs.enabled, true))
    : and(
        eq(aiRewriteConfigs.enabled, true),
        eq(aiRewriteConfigs.isDefault, true),
      );

  const [preferred] = await db
    .select()
    .from(aiRewriteConfigs)
    .where(where)
    .limit(1);

  if (preferred) {
    return withPromptDefaults(await resolveStoredApiKey(preferred));
  }

  if (styleId) return null;

  const [fallback] = await db
    .select()
    .from(aiRewriteConfigs)
    .where(eq(aiRewriteConfigs.enabled, true))
    .orderBy(desc(aiRewriteConfigs.id))
    .limit(1);

  return fallback
    ? withPromptDefaults(await resolveStoredApiKey(fallback))
    : null;
}

export async function getAiRewriteConfigForStatusCheck(id: number) {
  const [config] = await db
    .select()
    .from(aiRewriteConfigs)
    .where(eq(aiRewriteConfigs.id, id))
    .limit(1);

  return config ? withPromptDefaults(await resolveStoredApiKey(config)) : null;
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
        apiKey: input.apiKey?.trim() ? encryptSecret(input.apiKey) : null,
        factExtractionPrompt: input.factExtractionPrompt,
        basePrompt: input.basePrompt,
        initialRewritePrompt: input.initialRewritePrompt,
        rewriteRetryPrompt: input.rewriteRetryPrompt,
        qualityReviewPrompt: input.qualityReviewPrompt,
        metadataPrompt: input.metadataPrompt,
        metadataStylePrompt: input.metadataStylePrompt,
        englishContentPrompt: input.englishContentPrompt,
        englishContinuationPrompt: input.englishContinuationPrompt,
        englishMetadataPrompt: input.englishMetadataPrompt,
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
    factExtractionPrompt: input.factExtractionPrompt,
    basePrompt: input.basePrompt,
    initialRewritePrompt: input.initialRewritePrompt,
    rewriteRetryPrompt: input.rewriteRetryPrompt,
    qualityReviewPrompt: input.qualityReviewPrompt,
    metadataPrompt: input.metadataPrompt,
    styleName: input.styleName,
    stylePrompt: input.stylePrompt,
    metadataStylePrompt: input.metadataStylePrompt,
    englishContentPrompt: input.englishContentPrompt,
    englishContinuationPrompt: input.englishContinuationPrompt,
    englishMetadataPrompt: input.englishMetadataPrompt,
    englishStylePrompt: input.englishStylePrompt,
    englishMetadataStylePrompt: input.englishMetadataStylePrompt,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    enabled: input.enabled,
    isDefault: input.isDefault,
    updatedAt: new Date(),
  };

  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    values.apiKey = encryptSecret(input.apiKey);
  } else if (hasSecretEncryptionKey()) {
    const [existing] = await db
      .select({ apiKey: aiRewriteConfigs.apiKey })
      .from(aiRewriteConfigs)
      .where(eq(aiRewriteConfigs.id, id))
      .limit(1);
    if (existing?.apiKey) {
      const decrypted = decryptSecret(existing.apiKey);
      if (decrypted.needsMigration) {
        values.apiKey = encryptSecret(decrypted.value);
      }
    }
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
