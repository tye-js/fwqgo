import { and, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { imageGenerationConfigs } from "@/server/db/schema";

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
  size: string;
  quality: string;
  timeoutSeconds: number;
  enabled: boolean;
  isDefault: boolean;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function maskApiKey(apiKey: string | null) {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

async function unsetOtherDefaults() {
  await db
    .update(imageGenerationConfigs)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(imageGenerationConfigs.isDefault, true));
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
  if (input.isDefault) {
    await unsetOtherDefaults();
  }

  const [created] = await db
    .insert(imageGenerationConfigs)
    .values({
      ...input,
      baseUrl: normalizeBaseUrl(input.baseUrl),
      apiKey: input.apiKey?.trim() ? input.apiKey.trim() : null,
    })
    .returning({ id: imageGenerationConfigs.id });

  return created;
}

export async function updateImageGenerationConfig(
  id: number,
  input: ImageGenerationConfigInput,
) {
  if (input.isDefault) {
    await unsetOtherDefaults();
  }

  const values: Partial<typeof imageGenerationConfigs.$inferInsert> = {
    name: input.name,
    provider: input.provider,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model,
    promptTemplate: input.promptTemplate,
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

  const [updated] = await db
    .update(imageGenerationConfigs)
    .set(values)
    .where(eq(imageGenerationConfigs.id, id))
    .returning({ id: imageGenerationConfigs.id });

  return updated;
}

export async function deleteImageGenerationConfig(id: number) {
  await db
    .delete(imageGenerationConfigs)
    .where(eq(imageGenerationConfigs.id, id));
}
