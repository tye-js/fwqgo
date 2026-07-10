import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { imageGenerationConfigs } from "@fwqgo/db/schema";

export const imageGenerationProviderOptions = [
  "openai",
  "image2",
  "compatible",
] as const;

export type ImageGenerationProvider =
  (typeof imageGenerationProviderOptions)[number];

export type ImageGenerationConfigInput = {
  name: string;
  provider: ImageGenerationProvider;
  baseUrl: string;
  apiKey?: string;
  model: string;
  promptTemplate: string;
  englishPromptTemplate: string;
  size: string;
  quality: string;
  timeoutSeconds: number;
  enabled: boolean;
  isDefault: boolean;
};

type ConfigTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const IMAGE_GENERATION_DEFAULT_LOCK_ID = 9_021_002;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function maskApiKey(apiKey: string | null) {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

async function lockDefaultSelection(tx: ConfigTransaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${IMAGE_GENERATION_DEFAULT_LOCK_ID})`,
  );
}

async function unsetOtherDefaults(tx: ConfigTransaction) {
  await tx
    .update(imageGenerationConfigs)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(imageGenerationConfigs.isDefault, true));
}

async function ensureEnabledDefault(tx: ConfigTransaction) {
  const [currentDefault] = await tx
    .select({ id: imageGenerationConfigs.id })
    .from(imageGenerationConfigs)
    .where(
      and(
        eq(imageGenerationConfigs.enabled, true),
        eq(imageGenerationConfigs.isDefault, true),
      ),
    )
    .limit(1);

  if (currentDefault) return;

  const [fallback] = await tx
    .select({ id: imageGenerationConfigs.id })
    .from(imageGenerationConfigs)
    .where(eq(imageGenerationConfigs.enabled, true))
    .orderBy(desc(imageGenerationConfigs.id))
    .limit(1);

  if (fallback) {
    await tx
      .update(imageGenerationConfigs)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(imageGenerationConfigs.id, fallback.id));
  }
}

export async function getImageGenerationConfigs() {
  const rows = await db
    .select()
    .from(imageGenerationConfigs)
    .orderBy(
      desc(imageGenerationConfigs.isDefault),
      desc(imageGenerationConfigs.id),
    );

  return rows.map((row) => ({
    ...row,
    provider: row.provider as ImageGenerationProvider,
    hasApiKey: Boolean(row.apiKey),
    apiKeyPreview: maskApiKey(row.apiKey),
    apiKey: undefined,
  }));
}

export async function getActiveImageGenerationConfig(configId?: number) {
  const where = configId
    ? and(
        eq(imageGenerationConfigs.id, configId),
        eq(imageGenerationConfigs.enabled, true),
      )
    : and(
        eq(imageGenerationConfigs.enabled, true),
        eq(imageGenerationConfigs.isDefault, true),
      );

  const [preferred] = await db
    .select()
    .from(imageGenerationConfigs)
    .where(where)
    .limit(1);

  if (preferred) return preferred;
  if (configId) return null;

  const [fallback] = await db
    .select()
    .from(imageGenerationConfigs)
    .where(eq(imageGenerationConfigs.enabled, true))
    .orderBy(desc(imageGenerationConfigs.id))
    .limit(1);

  return fallback ?? null;
}

export async function createImageGenerationConfig(
  input: ImageGenerationConfigInput,
) {
  if (input.isDefault && !input.enabled) {
    throw new Error("默认生图配置必须同时启用");
  }

  return db.transaction(async (tx) => {
    await lockDefaultSelection(tx);
    if (input.isDefault) {
      await unsetOtherDefaults(tx);
    }

    const [created] = await tx
      .insert(imageGenerationConfigs)
      .values({
        ...input,
        baseUrl: normalizeBaseUrl(input.baseUrl),
        apiKey: input.apiKey?.trim() ? input.apiKey.trim() : null,
      })
      .returning({ id: imageGenerationConfigs.id });

    await ensureEnabledDefault(tx);
    return created;
  });
}

export async function updateImageGenerationConfig(
  id: number,
  input: ImageGenerationConfigInput,
) {
  if (input.isDefault && !input.enabled) {
    throw new Error("默认生图配置必须同时启用");
  }

  const values: Partial<typeof imageGenerationConfigs.$inferInsert> = {
    name: input.name,
    provider: input.provider,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model,
    promptTemplate: input.promptTemplate,
    englishPromptTemplate: input.englishPromptTemplate,
    size: input.size,
    quality: input.quality,
    timeoutSeconds: input.timeoutSeconds,
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
      .update(imageGenerationConfigs)
      .set(values)
      .where(eq(imageGenerationConfigs.id, id))
      .returning({ id: imageGenerationConfigs.id });

    await ensureEnabledDefault(tx);
    return updated;
  });
}

export async function deleteImageGenerationConfig(id: number) {
  await db.transaction(async (tx) => {
    await lockDefaultSelection(tx);
    await tx
      .delete(imageGenerationConfigs)
      .where(eq(imageGenerationConfigs.id, id));
    await ensureEnabledDefault(tx);
  });
}
