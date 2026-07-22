import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  affServiceProviders,
  providerProfileSnapshots,
} from "@fwqgo/db/schema";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { collectProviderProfileCandidate } from "@/server/providers/provider-profile-scraper";

const recoverableStatuses = ["queued", "running"] as const;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

function truncateError(value: string) {
  return value.length > 5_000 ? `${value.slice(0, 5_000)}...` : value;
}

async function claimProviderProfileSnapshot(snapshotId: number) {
  return db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select({
        id: providerProfileSnapshots.id,
        providerId: providerProfileSnapshots.providerId,
        status: providerProfileSnapshots.status,
      })
      .from(providerProfileSnapshots)
      .where(eq(providerProfileSnapshots.id, snapshotId))
      .for("update")
      .limit(1);

    if (
      !snapshot ||
      (snapshot.status !== "queued" && snapshot.status !== "running")
    ) {
      return null;
    }

    await tx
      .update(providerProfileSnapshots)
      .set({
        status: "running",
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(providerProfileSnapshots.id, snapshot.id));

    return snapshot;
  });
}

export async function runProviderProfileSnapshot(snapshotId: number) {
  const snapshot = await claimProviderProfileSnapshot(snapshotId);
  if (!snapshot) return;

  const [provider] = await db
    .select({
      id: affServiceProviders.id,
      officialUrl: affServiceProviders.officialUrl,
    })
    .from(affServiceProviders)
    .where(eq(affServiceProviders.id, snapshot.providerId))
    .limit(1);
  if (!provider) throw new Error("供应商不存在或已被删除");

  const candidate = await collectProviderProfileCandidate(provider.officialUrl);
  const now = new Date();
  const [updated] = await db
    .update(providerProfileSnapshots)
    .set({
      status: "pending",
      summary: candidate.summary,
      summarySourceUrl: candidate.summarySourceUrl,
      refundPolicy: candidate.refundPolicy,
      refundPolicySourceUrl: candidate.refundPolicySourceUrl,
      prohibitedUses: candidate.prohibitedUses,
      prohibitedUsesSourceUrl: candidate.prohibitedUsesSourceUrl,
      discoveredUrls: candidate.discoveredUrls,
      fetchedAt: now,
      error:
        candidate.warnings.length > 0
          ? truncateError(candidate.warnings.join("\n"))
          : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(providerProfileSnapshots.id, snapshot.id),
        eq(providerProfileSnapshots.status, "running"),
      ),
    )
    .returning({ id: providerProfileSnapshots.id });

  if (!updated) {
    throw new Error("采集快照状态已变化，候选内容未写入");
  }
}

export async function enqueueProviderProfileSnapshotTask(
  snapshotId: number,
  runAfter = new Date(),
) {
  return enqueueAdminBackgroundJob({
    key: `provider-profile:${snapshotId}`,
    label: `供应商档案采集 #${snapshotId}`,
    payload: { snapshotId },
    runAfter,
    maxAttempts: 2,
    run: async () => {
      await runProviderProfileSnapshot(snapshotId);
    },
    onTerminal: async ({ status, error }) => {
      if (status !== "failed") return;
      await db
        .update(providerProfileSnapshots)
        .set({
          status: "failed",
          error: truncateError(getErrorMessage(error)),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(providerProfileSnapshots.id, snapshotId),
            inArray(providerProfileSnapshots.status, ["queued", "running"]),
          ),
        );
    },
  });
}

export async function ensureProviderProfileWorkers() {
  const snapshots = await db
    .select({ id: providerProfileSnapshots.id })
    .from(providerProfileSnapshots)
    .where(inArray(providerProfileSnapshots.status, [...recoverableStatuses]))
    .orderBy(asc(providerProfileSnapshots.createdAt));

  for (const snapshot of snapshots) {
    await enqueueProviderProfileSnapshotTask(snapshot.id);
  }
}
