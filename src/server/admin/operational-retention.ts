import { and, inArray, lt, notExists, sql } from "drizzle-orm";

import { isPostgresUndefinedTableError } from "@fwqgo/core/postgres-error";
import { structuredLog } from "@fwqgo/core/structured-log";
import { db } from "@fwqgo/db";
import {
  adminAuditLogs,
  aiRewriteTasks,
  imageCoverGenerationTasks,
  providerMonitorRuns,
  providerOfferCandidates,
  sourceMaterials,
} from "@fwqgo/db/schema";
import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";

const RETENTION_JOB_KEY = "maintenance:operational-retention";
const DAY_MS = 24 * 60 * 60 * 1_000;

function daysFromEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 7 && parsed <= 3_650
    ? parsed
    : fallback;
}

function cutoff(days: number, now: Date) {
  return new Date(now.getTime() - days * DAY_MS);
}

async function deleteExpiredAdminAuditLogs(auditCutoff: Date) {
  try {
    return await db
      .delete(adminAuditLogs)
      .where(lt(adminAuditLogs.createdAt, auditCutoff))
      .returning({ id: adminAuditLogs.id });
  } catch (error) {
    if (!isPostgresUndefinedTableError(error, "admin_audit_logs")) throw error;
    structuredLog("warn", "maintenance.audit_retention_skipped", {
      reason: "admin_audit_logs table is not migrated",
      error,
    });
    return [];
  }
}

export async function runOperationalRetention(now = new Date()) {
  const aiCutoff = cutoff(daysFromEnv("AI_TASK_RETENTION_DAYS", 180), now);
  const coverCutoff = cutoff(daysFromEnv("COVER_TASK_RETENTION_DAYS", 90), now);
  const providerCutoff = cutoff(
    daysFromEnv("PROVIDER_TASK_RETENTION_DAYS", 90),
    now,
  );
  const auditCutoff = cutoff(
    daysFromEnv("ADMIN_AUDIT_RETENTION_DAYS", 365),
    now,
  );

  const [aiTasks, coverTasks, providerRuns, providerCandidates] =
    await db.transaction(async (tx) => {
      const ai = await tx
        .delete(aiRewriteTasks)
        .where(
          and(
            inArray(aiRewriteTasks.status, [
              "succeeded",
              "failed",
              "manual_required",
              "cancelled",
            ]),
            lt(
              sql`coalesce(${aiRewriteTasks.finishedAt}, ${aiRewriteTasks.updatedAt}, ${aiRewriteTasks.createdAt})`,
              aiCutoff,
            ),
          ),
        )
        .returning({ id: aiRewriteTasks.id });
      const covers = await tx
        .delete(imageCoverGenerationTasks)
        .where(
          and(
            inArray(imageCoverGenerationTasks.status, [
              "succeeded",
              "failed",
              "cancelled",
            ]),
            lt(
              sql`coalesce(${imageCoverGenerationTasks.finishedAt}, ${imageCoverGenerationTasks.updatedAt}, ${imageCoverGenerationTasks.createdAt})`,
              coverCutoff,
            ),
          ),
        )
        .returning({ id: imageCoverGenerationTasks.id });
      const runs = await tx
        .delete(providerMonitorRuns)
        .where(
          and(
            inArray(providerMonitorRuns.status, ["succeeded", "failed"]),
            lt(
              sql`coalesce(${providerMonitorRuns.finishedAt}, ${providerMonitorRuns.createdAt})`,
              providerCutoff,
            ),
          ),
        )
        .returning({ id: providerMonitorRuns.id });
      const candidates = await tx
        .delete(providerOfferCandidates)
        .where(
          and(
            inArray(providerOfferCandidates.status, [
              "accepted",
              "rejected",
              "superseded",
            ]),
            lt(providerOfferCandidates.lastSeenAt, providerCutoff),
          ),
        )
        .returning({ id: providerOfferCandidates.id });
      await tx.delete(sourceMaterials).where(
        and(
          inArray(sourceMaterials.status, [
            "succeeded",
            "failed",
            "manual_required",
            "cancelled",
            "deleted",
          ]),
          lt(
            sql`coalesce(${sourceMaterials.updatedAt}, ${sourceMaterials.createdAt})`,
            aiCutoff,
          ),
          notExists(
            tx
              .select({ id: aiRewriteTasks.id })
              .from(aiRewriteTasks)
              .where(
                sql`${aiRewriteTasks.sourceMaterialId} = ${sourceMaterials.id}`,
              ),
          ),
        ),
      );

      return [ai, covers, runs, candidates] as const;
    });
  const auditLogs = await deleteExpiredAdminAuditLogs(auditCutoff);

  const result = {
    aiTasks: aiTasks.length,
    coverTasks: coverTasks.length,
    providerRuns: providerRuns.length,
    providerCandidates: providerCandidates.length,
    auditLogs: auditLogs.length,
  };
  structuredLog("info", "maintenance.retention_completed", result);
  return result;
}

async function runRetentionJob() {
  await runOperationalRetention();
}

export async function enqueueOperationalRetention(runAfter = new Date()) {
  return enqueueAdminBackgroundJob({
    key: RETENTION_JOB_KEY,
    label: "清理过期任务和审计记录",
    maxAttempts: 3,
    runAfter,
    run: runRetentionJob,
    onTerminal: async () => {
      await enqueueOperationalRetention(new Date(Date.now() + DAY_MS));
    },
  });
}
