import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  imageCoverGenerationTasks,
  imageGenerationConfigs,
} from "@fwqgo/db/schema";
import {
  decryptSecret,
  encryptSecret,
  hasSecretEncryptionKey,
  maskStoredSecret,
} from "@fwqgo/core/secret-envelope";

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
type ConfigDatabase = Pick<typeof db, "select" | "update">;
type ImageGenerationConfigRow = typeof imageGenerationConfigs.$inferSelect;

const IMAGE_GENERATION_DEFAULT_LOCK_ID = 9_021_002;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function maskApiKey(apiKey: string | null) {
  return maskStoredSecret(apiKey);
}

async function resolveStoredApiKey<
  T extends { id: number; apiKey: string | null },
>(config: T, database: ConfigDatabase = db): Promise<T> {
  if (!config.apiKey) return config;
  const decrypted = decryptSecret(config.apiKey);
  if (decrypted.needsMigration && hasSecretEncryptionKey()) {
    const encrypted = encryptSecret(decrypted.value);
    await database
      .update(imageGenerationConfigs)
      .set({ apiKey: encrypted, updatedAt: new Date() })
      .where(
        and(
          eq(imageGenerationConfigs.id, config.id),
          eq(imageGenerationConfigs.apiKey, config.apiKey),
        ),
      );
  }
  return { ...config, apiKey: decrypted.value };
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

async function getEnabledDefault(tx: ConfigTransaction) {
  const [config] = await tx
    .select()
    .from(imageGenerationConfigs)
    .where(
      and(
        eq(imageGenerationConfigs.enabled, true),
        eq(imageGenerationConfigs.isDefault, true),
      ),
    )
    .limit(1);

  return config ?? null;
}

async function rebindFailedCoverTasks(
  tx: ConfigTransaction,
  config: typeof imageGenerationConfigs.$inferSelect,
) {
  const reboundTasks = await tx
    .update(imageCoverGenerationTasks)
    .set({
      configId: config.id,
      configName: config.name,
      provider: config.provider,
      model: config.model,
      updatedAt: new Date(),
    })
    .where(eq(imageCoverGenerationTasks.status, "failed"))
    .returning({ id: imageCoverGenerationTasks.id });

  return reboundTasks.length;
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

export async function getActiveImageGenerationConfig(
  configId?: number,
  database: ConfigDatabase = db,
): Promise<ImageGenerationConfigRow | null> {
  const where = configId
    ? and(
        eq(imageGenerationConfigs.id, configId),
        eq(imageGenerationConfigs.enabled, true),
      )
    : and(
        eq(imageGenerationConfigs.enabled, true),
        eq(imageGenerationConfigs.isDefault, true),
      );

  const preferred = (
    await database.select().from(imageGenerationConfigs).where(where).limit(1)
  )[0];

  if (preferred) return resolveStoredApiKey(preferred, database);
  if (configId) return null;

  const fallback = (
    await database
      .select()
      .from(imageGenerationConfigs)
      .where(eq(imageGenerationConfigs.enabled, true))
      .orderBy(desc(imageGenerationConfigs.id))
      .limit(1)
  )[0];

  return fallback ? resolveStoredApiKey(fallback, database) : null;
}

export async function getEnabledImageGenerationConfigs() {
  const rows = await db
    .select()
    .from(imageGenerationConfigs)
    .where(eq(imageGenerationConfigs.enabled, true))
    .orderBy(
      desc(imageGenerationConfigs.isDefault),
      desc(imageGenerationConfigs.id),
    );
  return Promise.all(rows.map((row) => resolveStoredApiKey(row)));
}

export async function createImageGenerationConfig(
  input: ImageGenerationConfigInput,
) {
  if (input.isDefault && !input.enabled) {
    throw new Error("默认生图配置必须同时启用");
  }

  return db.transaction(async (tx) => {
    await lockDefaultSelection(tx);
    const previousDefault = await getEnabledDefault(tx);
    if (input.isDefault) {
      await unsetOtherDefaults(tx);
    }

    const [created] = await tx
      .insert(imageGenerationConfigs)
      .values({
        ...input,
        baseUrl: normalizeBaseUrl(input.baseUrl),
        apiKey: input.apiKey?.trim() ? encryptSecret(input.apiKey) : null,
      })
      .returning({ id: imageGenerationConfigs.id });

    if (!created) {
      throw new Error("生图配置创建失败");
    }

    await ensureEnabledDefault(tx);
    const currentDefault = await getEnabledDefault(tx);
    const shouldRebind =
      currentDefault &&
      (currentDefault.id === created.id ||
        currentDefault.id !== previousDefault?.id);
    const reboundFailedTaskCount = shouldRebind
      ? await rebindFailedCoverTasks(tx, currentDefault)
      : 0;

    return { ...created, reboundFailedTaskCount };
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
    values.apiKey = encryptSecret(input.apiKey);
  } else if (hasSecretEncryptionKey()) {
    const [existing] = await db
      .select({ apiKey: imageGenerationConfigs.apiKey })
      .from(imageGenerationConfigs)
      .where(eq(imageGenerationConfigs.id, id))
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
    const previousDefault = await getEnabledDefault(tx);
    if (input.isDefault) {
      await unsetOtherDefaults(tx);
    }

    const [updated] = await tx
      .update(imageGenerationConfigs)
      .set(values)
      .where(eq(imageGenerationConfigs.id, id))
      .returning({ id: imageGenerationConfigs.id });

    if (!updated) {
      throw new Error("生图配置不存在或已被删除");
    }

    await ensureEnabledDefault(tx);
    const currentDefault = await getEnabledDefault(tx);
    const shouldRebind =
      currentDefault &&
      (currentDefault.id === updated.id ||
        currentDefault.id !== previousDefault?.id);
    const reboundFailedTaskCount = shouldRebind
      ? await rebindFailedCoverTasks(tx, currentDefault)
      : 0;

    return { ...updated, reboundFailedTaskCount };
  });
}

export async function deleteImageGenerationConfig(id: number) {
  return db.transaction(async (tx) => {
    await lockDefaultSelection(tx);
    const previousDefault = await getEnabledDefault(tx);
    await tx
      .delete(imageGenerationConfigs)
      .where(eq(imageGenerationConfigs.id, id));
    await ensureEnabledDefault(tx);
    const currentDefault = await getEnabledDefault(tx);
    const reboundFailedTaskCount =
      currentDefault && currentDefault.id !== previousDefault?.id
        ? await rebindFailedCoverTasks(tx, currentDefault)
        : 0;

    return { reboundFailedTaskCount };
  });
}
