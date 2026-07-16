import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@fwqgo/db";
import { structuredLog } from "@fwqgo/core/structured-log";
import { adminBackgroundJobs } from "@fwqgo/db/schema";
import {
  getBackgroundJobRetentionCutoff,
  getBackgroundJobRetryDelayMs,
  normalizeBackgroundJobMaxAttempts,
  normalizeBackgroundJobRetentionDays,
} from "@fwqgo/core/background-job-policy";

type AdminBackgroundJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type AdminBackgroundJobRow = typeof adminBackgroundJobs.$inferSelect;

export type BackgroundJobContext = {
  job: AdminBackgroundJobRow;
  payload: string | null;
};

export type BackgroundJobRunnerInput = {
  key: string;
  label: string;
  run: (context: BackgroundJobContext) => Promise<void>;
};

type BackgroundJobInput = BackgroundJobRunnerInput & {
  payload?: unknown;
  maxAttempts?: number;
  runAfter?: Date;
};

export type BackgroundJobSnapshot = {
  id: number;
  key: string;
  label: string;
  status: AdminBackgroundJobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedBy: string | null;
  lockedAt: string | null;
  heartbeatAt: string | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type BackgroundWorkerRuntimeSnapshot = {
  workerId: string;
  hostname: string;
  pid: number;
  isLoopRunning: boolean;
  registeredJobKeys: string[];
  concurrency: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  retentionDays: number;
  generatedAt: string;
};

const TERMINAL_JOB_STATUSES = ["succeeded", "failed", "cancelled"] as const;
const DEFAULT_CONCURRENCY = 2;
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;
const IDLE_LANE_RECHECK_MS = 500;
const IDLE_LANE_EXIT_CHECKS = 2;
const TERMINAL_JOB_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
// Serialize stale recovery and enqueue decisions across CMS processes.
const BACKGROUND_JOB_COORDINATION_LOCK_ID = 1_463_257_901;
const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID()}`;

const jobRunners = new Map<string, Pick<BackgroundJobInput, "label" | "run">>();

let workerLoopPromise: Promise<void> | null = null;
let workerWakeTimer: ReturnType<typeof setTimeout> | null = null;
let workerWakeTimerAt = 0;
let runningBackgroundJobCount = 0;
let workerWakeVersion = 0;
let lastTerminalJobCleanupAt = 0;

function getConcurrency() {
  const parsed = Number.parseInt(
    process.env.ADMIN_BACKGROUND_JOB_CONCURRENCY ?? "",
    10,
  );

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

function truncateErrorMessage(value: string) {
  return value.length > 5_000 ? `${value.slice(0, 5_000)}...` : value;
}

function serializePayload(payload: unknown) {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") return payload;

  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({ error: "payload_not_serializable" });
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toSnapshot(row: AdminBackgroundJobRow): BackgroundJobSnapshot {
  return {
    id: row.id,
    key: row.jobKey,
    label: row.label,
    status: row.status as AdminBackgroundJobStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    runAfter: row.runAfter.toISOString(),
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    lastError: row.lastError,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function startAdminBackgroundJobWorker() {
  if (workerLoopPromise) return;

  const wakeVersionAtStart = workerWakeVersion;
  workerLoopPromise = runAdminBackgroundJobWorker()
    .catch((error) => {
      structuredLog("error", "background.worker_failed", { error });
    })
    .finally(() => {
      workerLoopPromise = null;
      if (workerWakeVersion !== wakeVersionAtStart) {
        startAdminBackgroundJobWorker();
      }
    });
}

function wakeAdminBackgroundJobWorker() {
  workerWakeVersion += 1;
  startAdminBackgroundJobWorker();
}

export function registerAdminBackgroundJobRunner(
  input: BackgroundJobRunnerInput,
) {
  jobRunners.set(input.key, {
    label: input.label,
    run: input.run,
  });
}

export function wakeAdminBackgroundJobWorkerForRegisteredKeys(
  keys: Iterable<string>,
) {
  for (const key of keys) {
    if (jobRunners.has(key)) {
      wakeAdminBackgroundJobWorker();
      return true;
    }
  }

  return false;
}

function scheduleAdminBackgroundJobWorker(runAt: Date) {
  const runAtMs = runAt.getTime();
  if (!Number.isFinite(runAtMs) || runAtMs <= Date.now()) {
    wakeAdminBackgroundJobWorker();
    return;
  }

  if (workerWakeTimer && workerWakeTimerAt <= runAtMs) return;

  if (workerWakeTimer) clearTimeout(workerWakeTimer);
  workerWakeTimerAt = runAtMs;
  workerWakeTimer = setTimeout(
    () => {
      workerWakeTimer = null;
      workerWakeTimerAt = 0;
      wakeAdminBackgroundJobWorker();
    },
    Math.max(0, runAtMs - Date.now()),
  );
}

export function getAdminBackgroundWorkerRuntimeSnapshot(): BackgroundWorkerRuntimeSnapshot {
  return {
    workerId: WORKER_ID,
    hostname: hostname(),
    pid: process.pid,
    isLoopRunning: Boolean(workerLoopPromise),
    registeredJobKeys: [...jobRunners.keys()].sort(),
    concurrency: getConcurrency(),
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
    retentionDays: normalizeBackgroundJobRetentionDays(
      process.env.ADMIN_BACKGROUND_JOB_RETENTION_DAYS,
    ),
    generatedAt: new Date().toISOString(),
  };
}

async function pruneTerminalBackgroundJobs() {
  const now = Date.now();
  if (now - lastTerminalJobCleanupAt < TERMINAL_JOB_CLEANUP_INTERVAL_MS) {
    return 0;
  }
  lastTerminalJobCleanupAt = now;

  const retentionDays = normalizeBackgroundJobRetentionDays(
    process.env.ADMIN_BACKGROUND_JOB_RETENTION_DAYS,
  );
  const cutoff = getBackgroundJobRetentionCutoff(new Date(now), retentionDays);
  const terminalWhere = and(
    inArray(adminBackgroundJobs.status, [...TERMINAL_JOB_STATUSES]),
    lt(adminBackgroundJobs.createdAt, cutoff),
  );
  const [result] = await db
    .select({ count: count() })
    .from(adminBackgroundJobs)
    .where(terminalWhere);
  const removableCount = result?.count ?? 0;

  if (removableCount > 0) {
    await db.delete(adminBackgroundJobs).where(terminalWhere);
  }

  return removableCount;
}

async function resetStaleBackgroundJobs() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);
  const staleRunningWhere = and(
    eq(adminBackgroundJobs.status, "running"),
    or(
      lt(adminBackgroundJobs.heartbeatAt, staleBefore),
      and(
        isNull(adminBackgroundJobs.heartbeatAt),
        lt(adminBackgroundJobs.lockedAt, staleBefore),
      ),
    ),
  );

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${BACKGROUND_JOB_COORDINATION_LOCK_ID})`,
    );

    await tx
      .update(adminBackgroundJobs)
      .set({
        status: "failed",
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        lastError: "后台 worker 心跳超时，且已达到最大重试次数",
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          staleRunningWhere,
          sql`${adminBackgroundJobs.attempts} >= ${adminBackgroundJobs.maxAttempts}`,
        ),
      );

    await tx
      .update(adminBackgroundJobs)
      .set({
        status: "cancelled",
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        lastError: "后台 worker 心跳超时；已有同类型任务排队，旧锁已释放",
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          staleRunningWhere,
          sql`${adminBackgroundJobs.attempts} < ${adminBackgroundJobs.maxAttempts}`,
          sql`exists (
            select 1 from "admin_background_jobs" as queued_jobs
            where queued_jobs."jobKey" = ${adminBackgroundJobs.jobKey}
              and queued_jobs."status" = 'queued'
          )`,
        ),
      );

    const staleRecoverableRows = await tx
      .select({
        id: adminBackgroundJobs.id,
        jobKey: adminBackgroundJobs.jobKey,
      })
      .from(adminBackgroundJobs)
      .where(
        and(
          staleRunningWhere,
          sql`${adminBackgroundJobs.attempts} < ${adminBackgroundJobs.maxAttempts}`,
        ),
      )
      .orderBy(asc(adminBackgroundJobs.jobKey), asc(adminBackgroundJobs.id));
    const requeueIds: number[] = [];
    const duplicateIds: number[] = [];
    const selectedJobKeys = new Set<string>();

    for (const row of staleRecoverableRows) {
      if (selectedJobKeys.has(row.jobKey)) {
        duplicateIds.push(row.id);
      } else {
        selectedJobKeys.add(row.jobKey);
        requeueIds.push(row.id);
      }
    }

    if (duplicateIds.length > 0) {
      await tx
        .update(adminBackgroundJobs)
        .set({
          status: "cancelled",
          lockedBy: null,
          lockedAt: null,
          heartbeatAt: null,
          lastError: "后台 worker 心跳超时；同类型重复任务已合并",
          finishedAt: now,
          updatedAt: now,
        })
        .where(
          and(inArray(adminBackgroundJobs.id, duplicateIds), staleRunningWhere),
        );
    }

    if (requeueIds.length > 0) {
      await tx
        .update(adminBackgroundJobs)
        .set({
          status: "queued",
          lockedBy: null,
          lockedAt: null,
          heartbeatAt: null,
          runAfter: now,
          lastError: "后台 worker 心跳超时，已自动重新排队",
          updatedAt: now,
        })
        .where(
          and(inArray(adminBackgroundJobs.id, requeueIds), staleRunningWhere),
        );
    }
  });
}

async function claimNextBackgroundJob() {
  const registeredKeys = [...jobRunners.keys()];
  if (registeredKeys.length === 0) return null;

  while (true) {
    const [candidate] = await db
      .select({ id: adminBackgroundJobs.id })
      .from(adminBackgroundJobs)
      .where(
        and(
          eq(adminBackgroundJobs.status, "queued"),
          lte(adminBackgroundJobs.runAfter, new Date()),
          inArray(adminBackgroundJobs.jobKey, registeredKeys),
          sql`not exists (
            select 1 from "admin_background_jobs" as running_jobs
            where running_jobs."jobKey" = ${adminBackgroundJobs.jobKey}
              and running_jobs."status" = 'running'
          )`,
        ),
      )
      .orderBy(asc(adminBackgroundJobs.runAfter), asc(adminBackgroundJobs.id))
      .limit(1);

    if (!candidate) return null;

    const now = new Date();
    const nowSqlValue = now.toISOString();
    const [claimedJob] = await db
      .update(adminBackgroundJobs)
      .set({
        status: "running",
        attempts: sql`${adminBackgroundJobs.attempts} + 1`,
        lockedBy: WORKER_ID,
        lockedAt: now,
        heartbeatAt: now,
        startedAt: sql`coalesce(${adminBackgroundJobs.startedAt}, ${nowSqlValue})`,
        finishedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(adminBackgroundJobs.id, candidate.id),
          eq(adminBackgroundJobs.status, "queued"),
        ),
      )
      .returning();

    if (claimedJob) return claimedJob;
  }
}

async function heartbeat(jobId: number) {
  await db
    .update(adminBackgroundJobs)
    .set({
      heartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(adminBackgroundJobs.id, jobId),
        eq(adminBackgroundJobs.status, "running"),
        eq(adminBackgroundJobs.lockedBy, WORKER_ID),
      ),
    );
}

async function completeBackgroundJob(jobId: number) {
  await db
    .update(adminBackgroundJobs)
    .set({
      status: "succeeded",
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: new Date(),
      lastError: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(adminBackgroundJobs.id, jobId),
        eq(adminBackgroundJobs.status, "running"),
        eq(adminBackgroundJobs.lockedBy, WORKER_ID),
      ),
    );
}

async function failOrRetryBackgroundJob(
  job: AdminBackgroundJobRow,
  error: unknown,
) {
  const message = truncateErrorMessage(getErrorMessage(error));
  const shouldRetry = job.attempts < job.maxAttempts;
  const now = new Date();
  const retryAt = new Date(
    now.getTime() + getBackgroundJobRetryDelayMs(job.attempts),
  );

  await db
    .update(adminBackgroundJobs)
    .set({
      status: shouldRetry ? "queued" : "failed",
      runAfter: shouldRetry ? retryAt : job.runAfter,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      lastError: message,
      finishedAt: shouldRetry ? null : now,
      updatedAt: now,
    })
    .where(
      and(
        eq(adminBackgroundJobs.id, job.id),
        eq(adminBackgroundJobs.status, "running"),
        eq(adminBackgroundJobs.lockedBy, WORKER_ID),
      ),
    );

  if (shouldRetry) {
    scheduleAdminBackgroundJobWorker(retryAt);
  }
}

async function runClaimedBackgroundJob(job: AdminBackgroundJobRow) {
  const runner = jobRunners.get(job.jobKey);
  if (!runner) return;

  const interval = setInterval(() => {
    void heartbeat(job.id).catch((error) => {
      structuredLog("error", "background.heartbeat_failed", {
        jobId: job.id,
        jobKey: job.jobKey,
        workerId: WORKER_ID,
        error,
      });
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    await runner.run({ job, payload: job.payload });
    await completeBackgroundJob(job.id);
  } catch (error) {
    structuredLog("error", "background.job_failed", {
      jobId: job.id,
      jobKey: job.jobKey,
      workerId: WORKER_ID,
      label: runner.label,
      error,
    });
    await failOrRetryBackgroundJob(job, error);
  } finally {
    clearInterval(interval);
  }
}

async function runBackgroundJobLane() {
  let consecutiveIdleChecks = 0;

  while (true) {
    const job = await claimNextBackgroundJob();
    if (!job) {
      consecutiveIdleChecks += 1;
      if (
        runningBackgroundJobCount === 0 &&
        consecutiveIdleChecks >= IDLE_LANE_EXIT_CHECKS
      ) {
        return;
      }

      await wait(IDLE_LANE_RECHECK_MS);
      continue;
    }

    consecutiveIdleChecks = 0;
    runningBackgroundJobCount += 1;
    try {
      await runClaimedBackgroundJob(job);
    } finally {
      runningBackgroundJobCount = Math.max(0, runningBackgroundJobCount - 1);
    }
  }
}

async function runAdminBackgroundJobWorker() {
  await resetStaleBackgroundJobs();
  const prunedCount = await pruneTerminalBackgroundJobs();
  if (prunedCount > 0) {
    structuredLog("info", "background.jobs_pruned", { count: prunedCount });
  }

  const laneCount = Math.max(1, Math.min(8, getConcurrency()));
  await Promise.all(
    Array.from({ length: laneCount }, () => runBackgroundJobLane()),
  );
  await scheduleBlockedBackgroundJobRecovery();
  await scheduleRegisteredRunningBackgroundJobRecovery();
}

async function scheduleRegisteredRunningBackgroundJobRecovery() {
  const registeredKeys = [...jobRunners.keys()];
  if (registeredKeys.length === 0) return;

  const [runningJob] = await db
    .select({
      heartbeatAt: adminBackgroundJobs.heartbeatAt,
      lockedAt: adminBackgroundJobs.lockedAt,
    })
    .from(adminBackgroundJobs)
    .where(
      and(
        eq(adminBackgroundJobs.status, "running"),
        inArray(adminBackgroundJobs.jobKey, registeredKeys),
      ),
    )
    .orderBy(
      asc(
        sql`coalesce(${adminBackgroundJobs.heartbeatAt}, ${adminBackgroundJobs.lockedAt})`,
      ),
    )
    .limit(1);

  if (!runningJob) return;

  const lastActivity = runningJob.heartbeatAt ?? runningJob.lockedAt;
  const recoveryAt = new Date(
    Math.max(
      Date.now() + IDLE_LANE_RECHECK_MS,
      (lastActivity?.getTime() ?? Date.now()) +
        HEARTBEAT_TIMEOUT_MS +
        IDLE_LANE_RECHECK_MS,
    ),
  );
  scheduleAdminBackgroundJobWorker(recoveryAt);
}

async function scheduleBlockedBackgroundJobRecovery() {
  const [blockedJob] = await db
    .select({
      heartbeatAt: adminBackgroundJobs.heartbeatAt,
      lockedAt: adminBackgroundJobs.lockedAt,
    })
    .from(adminBackgroundJobs)
    .where(
      and(
        eq(adminBackgroundJobs.status, "running"),
        sql`exists (
          select 1 from "admin_background_jobs" as queued_jobs
          where queued_jobs."jobKey" = ${adminBackgroundJobs.jobKey}
            and queued_jobs."status" = 'queued'
        )`,
      ),
    )
    .orderBy(
      asc(
        sql`coalesce(${adminBackgroundJobs.heartbeatAt}, ${adminBackgroundJobs.lockedAt})`,
      ),
    )
    .limit(1);

  if (!blockedJob) return;

  const lastActivity = blockedJob.heartbeatAt ?? blockedJob.lockedAt;
  const recoveryAt = new Date(
    Math.max(
      Date.now() + IDLE_LANE_RECHECK_MS,
      (lastActivity?.getTime() ?? Date.now()) +
        HEARTBEAT_TIMEOUT_MS +
        IDLE_LANE_RECHECK_MS,
    ),
  );
  scheduleAdminBackgroundJobWorker(recoveryAt);
}

async function enqueueAdminBackgroundJobInternal(input: BackgroundJobInput) {
  const now = new Date();
  const requestedRunAfter = input.runAfter ?? now;
  const payload = serializePayload(input.payload);
  const maxAttempts = normalizeBackgroundJobMaxAttempts(input.maxAttempts);

  await resetStaleBackgroundJobs();

  const enqueueResult = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${BACKGROUND_JOB_COORDINATION_LOCK_ID})`,
    );

    const [existingJob] = await tx
      .select({
        id: adminBackgroundJobs.id,
        runAfter: adminBackgroundJobs.runAfter,
      })
      .from(adminBackgroundJobs)
      .where(
        and(
          eq(adminBackgroundJobs.jobKey, input.key),
          eq(adminBackgroundJobs.status, "queued"),
        ),
      )
      .limit(1);

    if (existingJob) {
      const effectiveRunAfter =
        existingJob.runAfter.getTime() <= requestedRunAfter.getTime()
          ? existingJob.runAfter
          : requestedRunAfter;

      await tx
        .update(adminBackgroundJobs)
        .set({
          label: input.label,
          payload,
          maxAttempts,
          runAfter: effectiveRunAfter,
          updatedAt: now,
        })
        .where(eq(adminBackgroundJobs.id, existingJob.id));
      return { created: false, runAfter: effectiveRunAfter };
    }

    const [job] = await tx
      .insert(adminBackgroundJobs)
      .values({
        jobKey: input.key,
        label: input.label,
        status: "queued",
        payload,
        maxAttempts,
        runAfter: requestedRunAfter,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: adminBackgroundJobs.id });

    if (!job) {
      const [concurrentJob] = await tx
        .select({
          id: adminBackgroundJobs.id,
          runAfter: adminBackgroundJobs.runAfter,
        })
        .from(adminBackgroundJobs)
        .where(
          and(
            eq(adminBackgroundJobs.jobKey, input.key),
            eq(adminBackgroundJobs.status, "queued"),
          ),
        )
        .limit(1);

      if (!concurrentJob) {
        throw new Error(`后台任务 ${input.key} 入队冲突后未找到排队记录`);
      }

      const effectiveRunAfter =
        concurrentJob.runAfter.getTime() <= requestedRunAfter.getTime()
          ? concurrentJob.runAfter
          : requestedRunAfter;
      await tx
        .update(adminBackgroundJobs)
        .set({
          label: input.label,
          payload,
          maxAttempts,
          runAfter: effectiveRunAfter,
          updatedAt: now,
        })
        .where(eq(adminBackgroundJobs.id, concurrentJob.id));
      return { created: false, runAfter: effectiveRunAfter };
    }

    return { created: true, runAfter: requestedRunAfter };
  });

  scheduleAdminBackgroundJobWorker(enqueueResult.runAfter);
  return enqueueResult.created;
}

export async function enqueueAdminBackgroundJob(input: BackgroundJobInput) {
  registerAdminBackgroundJobRunner(input);

  try {
    return await enqueueAdminBackgroundJobInternal(input);
  } catch (error) {
    structuredLog("error", "background.enqueue_failed", {
      jobKey: input.key,
      error,
    });
    throw error;
  }
}

export async function getAdminBackgroundJobSnapshots() {
  const rows = await db
    .select()
    .from(adminBackgroundJobs)
    .where(
      inArray(adminBackgroundJobs.status, [
        "queued",
        "running",
        ...TERMINAL_JOB_STATUSES,
      ]),
    )
    .orderBy(desc(adminBackgroundJobs.createdAt), desc(adminBackgroundJobs.id))
    .limit(12);

  return rows.map(toSnapshot);
}
