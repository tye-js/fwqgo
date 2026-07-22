import { inArray } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { aiRewriteTasks, imageCoverGenerationTasks } from "@fwqgo/db/schema";
import { ensureAiRewriteWorker } from "@/server/ai/rewrite-task-runner";
import { restoreAiSourceSiteBackgroundJobRunners } from "@/server/ai/source-site-background";
import { ensureCoverGenerationWorker } from "@/server/images/cover-generation-task-runner";
import { ensureProviderMonitorWorkers } from "@/server/offers/provider-monitor";
import { ensureProviderProfileWorkers } from "@/server/providers/provider-profile-tasks";
import { enqueueOperationalRetention } from "@/server/admin/operational-retention";

const recoverableTaskStatuses = ["pending", "running"] as const;

async function hasRecoverableAiRewriteTasks() {
  const [task] = await db
    .select({ id: aiRewriteTasks.id })
    .from(aiRewriteTasks)
    .where(inArray(aiRewriteTasks.status, [...recoverableTaskStatuses]))
    .limit(1);

  return Boolean(task);
}

async function hasRecoverableCoverTasks() {
  const [task] = await db
    .select({ id: imageCoverGenerationTasks.id })
    .from(imageCoverGenerationTasks)
    .where(
      inArray(imageCoverGenerationTasks.status, [...recoverableTaskStatuses]),
    )
    .limit(1);

  return Boolean(task);
}

export async function ensureCmsBackgroundWorkersForRecoverableTasks() {
  const [hasAiTasks, hasCoverTasks] = await Promise.all([
    hasRecoverableAiRewriteTasks(),
    hasRecoverableCoverTasks(),
  ]);

  await Promise.all([
    hasAiTasks ? ensureAiRewriteWorker() : Promise.resolve(),
    hasCoverTasks ? ensureCoverGenerationWorker() : Promise.resolve(),
    restoreAiSourceSiteBackgroundJobRunners(),
    ensureProviderMonitorWorkers(),
    ensureProviderProfileWorkers(),
    enqueueOperationalRetention(),
  ]);
}
