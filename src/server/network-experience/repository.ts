import { desc, eq } from "drizzle-orm";

import type { NetworkExperienceRuleSetSnapshot } from "@fwqgo/core/network-experience";
import { readDb } from "@fwqgo/db";
import { networkExperienceRuleSets } from "@fwqgo/db/schema";

import { validateNetworkExperienceSnapshot } from "./validation";

export async function getPublishedNetworkExperienceRuleSnapshot() {
  const [row] = await readDb
    .select()
    .from(networkExperienceRuleSets)
    .where(eq(networkExperienceRuleSets.status, "published"))
    .orderBy(desc(networkExperienceRuleSets.publishedAt))
    .limit(1);
  if (!row?.snapshotJson) return null;
  const snapshot = row.snapshotJson as unknown as NetworkExperienceRuleSetSnapshot;
  if (!validateNetworkExperienceSnapshot(snapshot)) return null;
  const now = Date.now();
  if (!row.reviewDueAt || row.reviewDueAt.getTime() < now) return null;
  if (row.validUntil && row.validUntil.getTime() < now) return null;
  return snapshot;
}
