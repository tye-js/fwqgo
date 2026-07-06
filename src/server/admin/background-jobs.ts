import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  and,
  asc,
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
import { adminBackgroundJobs } from "@fwqgo/db/schema";

type AdminBackgroundJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type AdminBackgroundJobRow = typeof adminBackgroundJobs.$inferSelect;

type BackgroundJobContext = {
  job: AdminBackgroundJobRow;
  payload: string | null;
};

type BackgroundJobInput = {
  key: string;
  label: string;
  run: (context: BackgroundJobContext) => Promise<void>;
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

const TERMINAL_JOB_STATUSES = ["succeeded", "failed", "cancelled"] as const;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_CONCURRENCY = 2;
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID()}`;

const jobRunners = new Map<string, Pick<BackgroundJobInput, "label" | "run">>();

let workerLoopPromise: Promise<void> | null = null;

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

function normalizeMaxAttempts(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return DEFAULT_MAX_ATTEMPTS;
  return Math.max(1, Math.min(20, Math.trunc(value)));
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

function retryDelayMs(attempts: number) {
  const baseMs = 30_000;
  return Math.min(baseMs * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
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

  workerLoopPromise = runAdminBackgroundJobWorker()
    .catch((error) => {
      console.error("Admin background job worker failed:", error);
    })
    .finally(() => {
      workerLoopPromise = null;
    });
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

  await db
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

  await db
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
      and(
        staleRunningWhere,
        sql`${adminBackgroundJobs.attempts} < ${adminBackgroundJobs.maxAttempts}`,
      ),
    );
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

  await db
    .update(adminBackgroundJobs)
    .set({
      status: shouldRetry ? "queued" : "failed",
      runAfter: shouldRetry
        ? new Date(now.getTime() + retryDelayMs(job.attempts))
        : job.runAfter,
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
}

async function runClaimedBackgroundJob(job: AdminBackgroundJobRow) {
  const runner = jobRunners.get(job.jobKey);
  if (!runner) return;

  const interval = setInterval(() => {
    void heartbeat(job.id).catch((error) => {
      console.error(`Background job heartbeat failed: ${job.jobKey}`, error);
    });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    await runner.run({ job, payload: job.payload });
    await completeBackgroundJob(job.id);
  } catch (error) {
    console.error(`${runner.label} failed:`, error);
    await failOrRetryBackgroundJob(job, error);
  } finally {
    clearInterval(interval);
  }
}

async function runBackgroundJobLane() {
  while (true) {
    const job = await claimNextBackgroundJob();
    if (!job) return;
    await runClaimedBackgroundJob(job);
  }
}

async function runAdminBackgroundJobWorker() {
  await resetStaleBackgroundJobs();

  const laneCount = Math.max(1, Math.min(8, getConcurrency()));
  await Promise.all(
    Array.from({ length: laneCount }, () => runBackgroundJobLane()),
  );
}

async function enqueueAdminBackgroundJobInternal(input: BackgroundJobInput) {
  const now = new Date();
  const payload = serializePayload(input.payload);
  const maxAttempts = normalizeMaxAttempts(input.maxAttempts);

  await resetStaleBackgroundJobs();

  const [existingJob] = await db
    .select({ id: adminBackgroundJobs.id })
    .from(adminBackgroundJobs)
    .where(
      and(
        eq(adminBackgroundJobs.jobKey, input.key),
        eq(adminBackgroundJobs.status, "queued"),
      ),
    )
    .limit(1);

  if (existingJob) {
    await db
      .update(adminBackgroundJobs)
      .set({
        label: input.label,
        payload,
        maxAttempts,
        updatedAt: now,
      })
      .where(eq(adminBackgroundJobs.id, existingJob.id));
    startAdminBackgroundJobWorker();
    return false;
  }

  const [job] = await db
    .insert(adminBackgroundJobs)
    .values({
      jobKey: input.key,
      label: input.label,
      status: "queued",
      payload,
      maxAttempts,
      runAfter: input.runAfter ?? now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: adminBackgroundJobs.id });

  startAdminBackgroundJobWorker();
  return Boolean(job);
}

export async function enqueueAdminBackgroundJob(input: BackgroundJobInput) {
  jobRunners.set(input.key, {
    label: input.label,
    run: input.run,
  });

  try {
    return await enqueueAdminBackgroundJobInternal(input);
  } catch (error) {
    console.error(`Failed to enqueue background job ${input.key}:`, error);
    return false;
  }
}

export async function getAdminBackgroundJobSnapshots() {
  await resetStaleBackgroundJobs();
  startAdminBackgroundJobWorker();

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
