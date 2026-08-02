import { PUBLISHED_SERVER_SIZING_RULE_SET } from "@fwqgo/core/server-sizing";
import {
  stableRuleChecksum,
  type ServerSizingRuleSet,
} from "@fwqgo/core/server-sizing";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { desc, eq } from "drizzle-orm";
import { readDb } from "@fwqgo/db";
import { serverSizingRuleSets } from "@fwqgo/db/schema";

export async function getPublishedServerSizingRuleSnapshot(): Promise<ServerSizingRuleSet | null> {
  "use cache";
  tagCache(cacheTags.serverSizing);

  try {
    const [row] = await readDb
      .select()
      .from(serverSizingRuleSets)
      .where(eq(serverSizingRuleSets.status, "published"))
      .orderBy(desc(serverSizingRuleSets.publishedAt))
      .limit(1);
    if (!row) return null;
    const config = row.config as unknown as Omit<ServerSizingRuleSet, "checksum">;
    if (stableRuleChecksum(config) !== row.checksum) return null;
    return {
      ...config,
      versionLabel: row.versionLabel,
      status: "published",
      validUntil: row.validUntil?.toISOString() ?? config.validUntil,
      checksum: row.checksum,
    };
  } catch (error) {
    console.error("Failed to load published server sizing rules:", error);
    return null;
  }
}

export const codeBaselineServerSizingRule = PUBLISHED_SERVER_SIZING_RULE_SET;
