import { and, asc, desc, eq, inArray, like, lte } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  adminBackgroundJobs,
  networkMeasurementCampaignRevisions,
  networkMeasurementCampaigns,
} from "@fwqgo/db/schema";
import {
  enqueueAdminBackgroundJob,
  registerAdminBackgroundJobRunner,
  type BackgroundJobContext,
} from "@/server/admin/background-jobs";
import { enqueueNetworkMeasurementRun } from "./campaign-service";
import { rollupNetworkMeasurementCampaignWindow } from "./rollup-service";

const NETWORK_JOB_PREFIX = "network:";
const NETWORK_CAMPAIGN_SCHEDULE_KEY = "network:campaign:schedule";
const NETWORK_ROLLUP_GRACE_MS = 5 * 60 * 1000;
const NETWORK_CAMPAIGN_SCHEDULE_INTERVAL_MS = 60 * 1000;

export type NetworkBackgroundJobKind =
  | { kind: "campaign_schedule" }
  | { kind: "measurement_submit"; campaignId: number; slotAt: Date }
  | { kind: "rollup"; campaignId: number; windowStart: Date }
  | { kind: "unsupported"; key: string };

export function parseNetworkBackgroundJobKey(key: string): NetworkBackgroundJobKind {
  if (key === NETWORK_CAMPAIGN_SCHEDULE_KEY) return { kind: "campaign_schedule" };
  const match = /^network:measurement:submit:(\d+):(.+)$/u.exec(key);
  if (match) {
    const campaignId = Number(match[1]);
    const slotText = match[2];
    const slotAt = slotText ? new Date(slotText) : new Date(Number.NaN);
    if (Number.isSafeInteger(campaignId) && campaignId > 0 && !Number.isNaN(slotAt.getTime())) {
      return { kind: "measurement_submit", campaignId, slotAt };
    }
  }
  const rollupMatch = /^network:rollup:(\d+):(.+)$/u.exec(key);
  if (rollupMatch) {
    const campaignId = Number(rollupMatch[1]);
    const windowText = rollupMatch[2];
    const windowStart = windowText ? new Date(windowText) : new Date(Number.NaN);
    const canonicalWindow =
      !Number.isNaN(windowStart.getTime()) &&
      windowStart.toISOString() === windowText &&
      windowStart.getUTCMinutes() === 0 &&
      windowStart.getUTCSeconds() === 0 &&
      windowStart.getUTCMilliseconds() === 0;
    if (Number.isSafeInteger(campaignId) && campaignId > 0 && canonicalWindow) {
      return { kind: "rollup", campaignId, windowStart };
    }
  }
  return { kind: "unsupported", key };
}

export function completeUtcHour(referenceTime = new Date()) {
  const currentHour = new Date(
    Date.UTC(
      referenceTime.getUTCFullYear(),
      referenceTime.getUTCMonth(),
      referenceTime.getUTCDate(),
      referenceTime.getUTCHours(),
    ),
  );
  return new Date(currentHour.getTime() - 60 * 60 * 1000);
}

export function networkRollupJobKey(campaignId: number, windowStart: Date) {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) {
    throw new Error("campaignId 无效");
  }
  const key = `network:rollup:${campaignId}:${windowStart.toISOString()}`;
  const parsed = parseNetworkBackgroundJobKey(key);
  if (parsed.kind !== "rollup") throw new Error("rollup window 必须为 UTC 整点");
  return key;
}

function rollupRunAfter(windowStart: Date) {
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
  return new Date(Math.max(Date.now(), windowEnd.getTime() + NETWORK_ROLLUP_GRACE_MS));
}

async function enqueueNetworkRollupJob(campaignId: number, windowStart: Date) {
  const key = networkRollupJobKey(campaignId, windowStart);
  const [existing] = await db
    .select({ id: adminBackgroundJobs.id })
    .from(adminBackgroundJobs)
    .where(eq(adminBackgroundJobs.jobKey, key))
    .orderBy(desc(adminBackgroundJobs.id))
    .limit(1);
  if (existing) return { created: false, key };
  return enqueueAdminBackgroundJob({
    key,
    label: "网络线路小时聚合",
    payload: { campaignId, windowStart: windowStart.toISOString() },
    maxAttempts: 3,
    runAfter: rollupRunAfter(windowStart),
    run: runNetworkRollup,
    onTerminal: async ({ status, job }) => {
      if (status === "succeeded") await rescheduleNetworkRollup(job);
    },
  });
}

async function runCampaignSchedule() {
  const now = new Date();
  const campaigns = await db
    .select({
      id: networkMeasurementCampaigns.id,
      nextRunAt: networkMeasurementCampaigns.nextRunAt,
      runGeneration: networkMeasurementCampaigns.runGeneration,
      intervalMinutes: networkMeasurementCampaignRevisions.intervalMinutes,
    })
    .from(networkMeasurementCampaigns)
    .innerJoin(
      networkMeasurementCampaignRevisions,
      eq(
        networkMeasurementCampaignRevisions.id,
        networkMeasurementCampaigns.currentConfigurationRevisionId,
      ),
    )
    .where(
      and(
        eq(networkMeasurementCampaigns.status, "active"),
        lte(networkMeasurementCampaigns.nextRunAt, now),
      ),
    )
    .orderBy(asc(networkMeasurementCampaigns.nextRunAt))
    .limit(100);
  for (const campaign of campaigns) {
    await enqueueNetworkRollupJob(campaign.id, completeUtcHour(now));
    await enqueueNetworkMeasurementRun(campaign.id, campaign.nextRunAt ?? now);
    await db
      .update(networkMeasurementCampaigns)
      .set({
        nextRunAt: new Date(
          now.getTime() + campaign.intervalMinutes * 60 * 1000,
        ),
        updatedAt: now,
      })
      .where(
        and(
          eq(networkMeasurementCampaigns.id, campaign.id),
          eq(networkMeasurementCampaigns.status, "active"),
          eq(networkMeasurementCampaigns.runGeneration, campaign.runGeneration),
        ),
      );
  }
}

async function runMeasurementSubmit(context: BackgroundJobContext) {
  const parsed = parseNetworkBackgroundJobKey(context.job.jobKey);
  if (parsed.kind !== "measurement_submit") {
    throw new Error("network measurement submit job key 无效");
  }
  await enqueueNetworkMeasurementRun(parsed.campaignId, parsed.slotAt);
}

async function runNetworkRollup(context: BackgroundJobContext) {
  const parsed = parseNetworkBackgroundJobKey(context.job.jobKey);
  if (parsed.kind !== "rollup") {
    throw new Error("network rollup job key 无效");
  }
  const windowEnd = new Date(parsed.windowStart.getTime() + 60 * 60 * 1000);
  await rollupNetworkMeasurementCampaignWindow({
    campaignId: parsed.campaignId,
    windowStart: parsed.windowStart,
    windowEnd,
  });
}

async function rescheduleNetworkRollup(job: BackgroundJobContext["job"]) {
  const parsed = parseNetworkBackgroundJobKey(job.jobKey);
  if (parsed.kind !== "rollup") return;
  const [campaign] = await db
    .select({ status: networkMeasurementCampaigns.status })
    .from(networkMeasurementCampaigns)
    .where(eq(networkMeasurementCampaigns.id, parsed.campaignId))
    .limit(1);
  if (campaign?.status !== "active") return;
  const nextWindowStart = new Date(
    parsed.windowStart.getTime() + 60 * 60 * 1000,
  );
  await enqueueAdminBackgroundJob({
    key: networkRollupJobKey(parsed.campaignId, nextWindowStart),
    label: "网络线路小时聚合",
    payload: {
      campaignId: parsed.campaignId,
      windowStart: nextWindowStart.toISOString(),
    },
    maxAttempts: 3,
    runAfter: rollupRunAfter(nextWindowStart),
    run: runNetworkRollup,
    onTerminal: async ({ status, job: terminalJob }) => {
      if (status === "succeeded") await rescheduleNetworkRollup(terminalJob);
    },
  });
}

async function rescheduleCampaignSchedule() {
  await enqueueAdminBackgroundJob({
    key: NETWORK_CAMPAIGN_SCHEDULE_KEY,
    label: "网络测量活动调度",
    maxAttempts: 3,
    runAfter: new Date(Date.now() + NETWORK_CAMPAIGN_SCHEDULE_INTERVAL_MS),
    run: async () => runCampaignSchedule(),
    onTerminal: async ({ status }) => {
      if (status === "succeeded") await rescheduleCampaignSchedule();
    },
  });
}

async function runUnsupportedNetworkJob(context: BackgroundJobContext) {
  throw new Error(`network job runner 尚未注册: ${context.job.jobKey}`);
}

function registerNetworkRunner(key: string) {
  const parsed = parseNetworkBackgroundJobKey(key);
  if (parsed.kind === "campaign_schedule") {
    registerAdminBackgroundJobRunner({
      key,
      label: "网络测量活动调度",
      run: async () => runCampaignSchedule(),
      onTerminal: async ({ status }) => {
        if (status === "succeeded") await rescheduleCampaignSchedule();
      },
    });
    return;
  }
  if (parsed.kind === "measurement_submit") {
    registerAdminBackgroundJobRunner({
      key,
      label: "网络测量 run 排程",
      run: runMeasurementSubmit,
    });
    return;
  }
  if (parsed.kind === "rollup") {
    registerAdminBackgroundJobRunner({
      key,
      label: "网络线路小时聚合",
      run: runNetworkRollup,
      onTerminal: async ({ status, job }) => {
        if (status === "succeeded") await rescheduleNetworkRollup(job);
      },
    });
    return;
  }
  registerAdminBackgroundJobRunner({
    key,
    label: "未识别的网络任务",
    run: runUnsupportedNetworkJob,
  });
}

export async function restoreNetworkBackgroundJobRunners() {
  registerNetworkRunner(NETWORK_CAMPAIGN_SCHEDULE_KEY);
  const rows = await db
    .select({ jobKey: adminBackgroundJobs.jobKey })
    .from(adminBackgroundJobs)
    .where(
      and(
        inArray(adminBackgroundJobs.status, ["queued", "running"]),
        like(adminBackgroundJobs.jobKey, `${NETWORK_JOB_PREFIX}%`),
      ),
    );
  for (const row of rows) registerNetworkRunner(row.jobKey);
}

export async function ensureNetworkAssessmentWorkers() {
  await restoreNetworkBackgroundJobRunners();
  await enqueueAdminBackgroundJob({
    key: NETWORK_CAMPAIGN_SCHEDULE_KEY,
    label: "网络测量活动调度",
    run: async () => runCampaignSchedule(),
    maxAttempts: 3,
    onTerminal: async ({ status }) => {
      if (status === "succeeded") await rescheduleCampaignSchedule();
    },
  });
}
