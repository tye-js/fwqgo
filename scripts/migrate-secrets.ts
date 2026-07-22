import { eq } from "drizzle-orm";

import {
  decryptSecret,
  encryptSecret,
  hasSecretEncryptionKey,
} from "@fwqgo/core/secret-envelope";
import { parseProviderMonitorConfig } from "@fwqgo/core/provider-monitor-config";
import { db } from "@fwqgo/db";
import {
  aiRewriteConfigs,
  imageGenerationConfigs,
  providerMonitors,
} from "@fwqgo/db/schema";
import { resolveProviderMonitorSecrets } from "@/server/offers/provider-monitor-secrets";

const write = process.argv.includes("--write");

async function migrateApiKeys() {
  const [aiRows, imageRows] = await Promise.all([
    db
      .select({ id: aiRewriteConfigs.id, apiKey: aiRewriteConfigs.apiKey })
      .from(aiRewriteConfigs),
    db
      .select({ id: imageGenerationConfigs.id, apiKey: imageGenerationConfigs.apiKey })
      .from(imageGenerationConfigs),
  ]);
  let changed = 0;
  for (const [table, rows] of [
    [aiRewriteConfigs, aiRows],
    [imageGenerationConfigs, imageRows],
  ] as const) {
    for (const row of rows) {
      if (!row.apiKey) continue;
      const decrypted = decryptSecret(row.apiKey);
      if (!decrypted.needsMigration) continue;
      changed += 1;
      if (write) {
        await db
          .update(table)
          .set({ apiKey: encryptSecret(decrypted.value), updatedAt: new Date() })
          .where(eq(table.id, row.id));
      }
    }
  }
  return changed;
}

async function migrateProviderHeaders() {
  const rows = await db
    .select({
      id: providerMonitors.id,
      adapter: providerMonitors.adapter,
      config: providerMonitors.config,
    })
    .from(providerMonitors);
  let changed = 0;
  for (const row of rows) {
    const config = parseProviderMonitorConfig(
      row.config,
      row.adapter as "json" | "html" | "whmcs",
    );
    const resolved = resolveProviderMonitorSecrets(config);
    if (!resolved.needsMigration) continue;
    changed += 1;
    if (write) {
      await db
        .update(providerMonitors)
        .set({ config: resolved.storageConfig, updatedAt: new Date() })
        .where(eq(providerMonitors.id, row.id));
    }
  }
  return changed;
}

async function main() {
  if (!hasSecretEncryptionKey()) {
    throw new Error(
      "请先配置 SECRET_ENCRYPTION_KEYS（或 SECRET_ENCRYPTION_KEY）再迁移密钥",
    );
  }
  const [apiKeys, providerHeaders] = await Promise.all([
    migrateApiKeys(),
    migrateProviderHeaders(),
  ]);
  console.log(
    `${write ? "WRITE" : "DRY RUN"}: API keys=${apiKeys}, provider configs=${providerHeaders}`,
  );
  if (!write && apiKeys + providerHeaders > 0) {
    console.log("确认结果后使用 bun run secrets:migrate --write 执行迁移");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
