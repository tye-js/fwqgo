import { inArray } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  aiRewriteTasks,
  imageCoverGenerationTasks,
  serverOfferImportTasks,
} from "@fwqgo/db/schema";
import { ensureAiRewriteWorker } from "@/server/ai/rewrite-task-runner";
import { ensureCoverGenerationWorker } from "@/server/images/cover-generation-task-runner";
import { ensureServerOfferImportWorker } from "@/server/offers/import-task-runner";
import { ensureProviderMonitorWorkers } from "@/server/offers/provider-monitor";

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

async function hasRecoverableOfferTasks() {
  const [task] = await db
    .select({ id: serverOfferImportTasks.id })
    .from(serverOfferImportTasks)
    .where(inArray(serverOfferImportTasks.status, [...recoverableTaskStatuses]))
    .limit(1);

  return Boolean(task);
}

export async function ensureCmsBackgroundWorkersForRecoverableTasks() {
  const [hasAiTasks, hasCoverTasks, hasOfferTasks] = await Promise.all([
    hasRecoverableAiRewriteTasks(),
    hasRecoverableCoverTasks(),
    hasRecoverableOfferTasks(),
  ]);

  await Promise.all([
    hasAiTasks ? ensureAiRewriteWorker() : Promise.resolve(),
    hasCoverTasks ? ensureCoverGenerationWorker() : Promise.resolve(),
    hasOfferTasks ? ensureServerOfferImportWorker() : Promise.resolve(),
    ensureProviderMonitorWorkers(),
  ]);
}
