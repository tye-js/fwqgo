import { and, desc, eq, inArray, like } from "drizzle-orm";

import { pullSourceSiteToAiTasks } from "@/server/ai/source-site-puller";
import {
  AI_SOURCE_SITE_JOB_KEY_PREFIX,
  getAiSourceSiteJobKey,
  parseAiSourceSiteJobKey,
} from "@fwqgo/core/ai-source-site-job-key";
import { structuredLog } from "@fwqgo/core/structured-log";
import { db } from "@fwqgo/db";
import { adminBackgroundJobs, aiSourceSites } from "@fwqgo/db/schema";
import {
  type BackgroundJobContext,
  enqueueAdminBackgroundJob,
  registerAdminBackgroundJobRunner,
  runWithActiveAdminBackgroundJobLease,
  type BackgroundJobRunnerInput,
  wakeAdminBackgroundJobWorkerForRegisteredKeys,
} from "@/server/admin/background-jobs";

const RECOVERABLE_JOB_STATUSES = ["queued", "running"] as const;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "未知错误";
}

function parseAiSourceSiteRunDetails(value: string | null) {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const details = parsed as Record<string, unknown>;
    return {
      state: typeof details.state === "string" ? details.state : null,
      jobId:
        typeof details.jobId === "number" && Number.isSafeInteger(details.jobId)
          ? details.jobId
          : null,
      runGeneration:
        typeof details.runGeneration === "number" &&
        Number.isSafeInteger(details.runGeneration)
          ? details.runGeneration
          : null,
    };
  } catch {
    return null;
  }
}

async function getAiSourceSiteForRun(sourceSiteId: number) {
  const [site] = await db
    .select({
      id: aiSourceSites.id,
      siteUrl: aiSourceSites.siteUrl,
      feedUrl: aiSourceSites.feedUrl,
      categoryId: aiSourceSites.categoryId,
      rewriteStyleId: aiSourceSites.rewriteStyleId,
      limit: aiSourceSites.limit,
      enabled: aiSourceSites.enabled,
      runGeneration: aiSourceSites.runGeneration,
    })
    .from(aiSourceSites)
    .where(eq(aiSourceSites.id, sourceSiteId))
    .limit(1);

  if (!site) {
    return null;
  }
  if (!site.enabled) {
    return null;
  }

  return site;
}

async function recordAiSourceSiteRunFailure(
  sourceSiteId: number,
  runGeneration: number,
  error: unknown,
  context: BackgroundJobContext,
) {
  const message = getErrorMessage(error);
  const runAt = new Date();

  await runWithActiveAdminBackgroundJobLease(context, async (tx) => {
    await tx
      .update(aiSourceSites)
      .set({
        lastRunAt: runAt,
        lastError: message,
        lastRunDetails: JSON.stringify({
          runAt: runAt.toISOString(),
          state: "failed",
          runGeneration,
          error: message,
        }),
        updatedAt: runAt,
      })
      .where(
        and(
          eq(aiSourceSites.id, sourceSiteId),
          eq(aiSourceSites.runGeneration, runGeneration),
        ),
      );
  });
}

async function recordAiSourceSiteTerminalFailure(
  sourceSiteId: number,
  jobId: number,
  error: unknown,
) {
  const message = getErrorMessage(error);

  await db.transaction(async (tx) => {
    const [site] = await tx
      .select({
        runGeneration: aiSourceSites.runGeneration,
        lastRunDetails: aiSourceSites.lastRunDetails,
      })
      .from(aiSourceSites)
      .where(eq(aiSourceSites.id, sourceSiteId))
      .for("update")
      .limit(1);
    if (!site) return;

    const details = parseAiSourceSiteRunDetails(site.lastRunDetails);
    if (
      details?.state !== "running" ||
      details.jobId !== jobId ||
      details.runGeneration !== site.runGeneration
    ) {
      return;
    }

    const runAt = new Date();
    await tx
      .update(aiSourceSites)
      .set({
        lastRunAt: runAt,
        lastError: message,
        lastRunDetails: JSON.stringify({
          runAt: runAt.toISOString(),
          state: "failed",
          jobId,
          runGeneration: site.runGeneration,
          error: message,
        }),
        updatedAt: runAt,
      })
      .where(
        and(
          eq(aiSourceSites.id, sourceSiteId),
          eq(aiSourceSites.runGeneration, site.runGeneration),
        ),
      );
  });
}

export async function runAiSourceSiteInBackground(
  sourceSiteId: number,
  context: BackgroundJobContext,
) {
  let runGeneration: number | null = null;

  try {
    const site = await getAiSourceSiteForRun(sourceSiteId);
    if (!site) return;
    const claimedRunGeneration = site.runGeneration;
    runGeneration = claimedRunGeneration;
    const startedAt = new Date();
    const claimResult = await runWithActiveAdminBackgroundJobLease(
      context,
      async (tx) => {
        const [claimedSite] = await tx
          .update(aiSourceSites)
          .set({
            lastRunAt: startedAt,
            lastRunDetails: JSON.stringify({
              runAt: startedAt.toISOString(),
              state: "running",
              jobId: context.job.id,
              runGeneration: claimedRunGeneration,
            }),
            lastError: null,
            updatedAt: startedAt,
          })
          .where(
            and(
              eq(aiSourceSites.id, sourceSiteId),
              eq(aiSourceSites.enabled, true),
              eq(aiSourceSites.runGeneration, claimedRunGeneration),
            ),
          )
          .returning({ id: aiSourceSites.id });

        return Boolean(claimedSite);
      },
    );
    if (!claimResult.active || !claimResult.value) return;

    const result = await pullSourceSiteToAiTasks({
      siteUrl: site.siteUrl,
      feedUrl: site.feedUrl,
      categoryId: site.categoryId,
      rewriteStyleId: site.rewriteStyleId,
      limit: site.limit,
      runFence: {
        sourceSiteId,
        runGeneration: claimedRunGeneration,
      },
    });
    const runAt = new Date();

    await runWithActiveAdminBackgroundJobLease(context, async (tx) => {
      await tx
        .update(aiSourceSites)
        .set({
          lastRunAt: runAt,
          lastDiscoveredCount: result.discoveredCount,
          lastCreatedCount: result.createdCount,
          lastSkippedCount: result.skippedCount,
          lastRunDetails: JSON.stringify({
            runAt: runAt.toISOString(),
            state: "succeeded",
            runGeneration: claimedRunGeneration,
            ...result,
          }),
          lastError: null,
          updatedAt: runAt,
        })
        .where(
          and(
            eq(aiSourceSites.id, sourceSiteId),
            eq(aiSourceSites.enabled, true),
            eq(aiSourceSites.runGeneration, claimedRunGeneration),
          ),
        );
    });
  } catch (error) {
    if (runGeneration !== null) {
      await recordAiSourceSiteRunFailure(
        sourceSiteId,
        runGeneration,
        error,
        context,
      );
    }
    throw error;
  }
}

function createAiSourceSiteBackgroundJobRunner(input: {
  sourceSiteId: number;
  label: string;
}): BackgroundJobRunnerInput {
  return {
    key: getAiSourceSiteJobKey(input.sourceSiteId),
    label: input.label,
    run: (context) => runAiSourceSiteInBackground(input.sourceSiteId, context),
    onTerminal: async ({ status, job, error }) => {
      if (status !== "failed") return;
      await recordAiSourceSiteTerminalFailure(
        input.sourceSiteId,
        job.id,
        error,
      );
    },
  };
}

export async function enqueueAiSourceSiteBackgroundJob(input: {
  sourceSiteId: number;
  siteName: string;
}) {
  return enqueueAdminBackgroundJob(
    createAiSourceSiteBackgroundJobRunner({
      sourceSiteId: input.sourceSiteId,
      label: `来源站抓取：${input.siteName}`,
    }),
  );
}

export async function restoreAiSourceSiteBackgroundJobRunners() {
  const jobs = await db
    .select({
      id: adminBackgroundJobs.id,
      jobKey: adminBackgroundJobs.jobKey,
      label: adminBackgroundJobs.label,
    })
    .from(adminBackgroundJobs)
    .where(
      and(
        inArray(adminBackgroundJobs.status, [...RECOVERABLE_JOB_STATUSES]),
        like(adminBackgroundJobs.jobKey, `${AI_SOURCE_SITE_JOB_KEY_PREFIX}%`),
      ),
    )
    .orderBy(desc(adminBackgroundJobs.id));

  const seenKeys = new Set<string>();
  const registeredKeys: string[] = [];
  let ignoredCount = 0;

  for (const job of jobs) {
    if (seenKeys.has(job.jobKey)) continue;
    seenKeys.add(job.jobKey);

    const sourceSiteId = parseAiSourceSiteJobKey(job.jobKey);
    if (sourceSiteId === null) {
      ignoredCount += 1;
      structuredLog("warn", "background.source_site_job_key_invalid", {
        jobId: job.id,
        jobKey: job.jobKey,
      });
      continue;
    }

    registerAdminBackgroundJobRunner(
      createAiSourceSiteBackgroundJobRunner({
        sourceSiteId,
        label: job.label,
      }),
    );
    registeredKeys.push(job.jobKey);
  }

  if (registeredKeys.length > 0) {
    wakeAdminBackgroundJobWorkerForRegisteredKeys(registeredKeys);
  }

  return {
    registeredCount: registeredKeys.length,
    ignoredCount,
  };
}
