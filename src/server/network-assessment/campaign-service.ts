import { createHash } from "node:crypto";

import { and, asc, eq, max } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  networkLineCandidateRevisions,
  networkLineCandidates,
  networkMeasurementCampaignRevisions,
  networkMeasurementCampaigns,
  networkMeasurementRuns,
} from "@fwqgo/db/schema";

type NetworkTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreateNetworkCandidateInput = {
  slug: string;
  name: string;
  enName?: string | null;
  providerId?: number | null;
  regionCode: string;
  datacenter: string;
  productRef: string;
  declaredLabels?: string[];
  configurationJson?: Record<string, unknown>;
};

export type CreateNetworkCandidateRevisionInput = Omit<
  CreateNetworkCandidateInput,
  "slug" | "name" | "enName" | "providerId"
>;

export type CreateNetworkCampaignInput = {
  candidateId: number;
  probeSelector: Record<string, unknown>;
  metricProfile: Record<string, unknown>;
  protocolVersion: string;
  intervalMinutes: number;
  peakWindows?: Array<Record<string, unknown>>;
  startsAt?: Date | null;
  endsAt?: Date | null;
  configurationJson: Record<string, unknown>;
};

function requiredText(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ?? null;
}

function validateSlug(value: string) {
  const slug = requiredText(value, "slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 160) {
    throw new Error("slug 只允许小写字母、数字和短横线");
  }
  return slug;
}

function normalizeLabels(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].slice(
    0,
    20,
  );
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function networkConfigurationHash(value: unknown) {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function candidateRevisionValues(input: CreateNetworkCandidateRevisionInput) {
  const configurationJson = input.configurationJson ?? {};
  return {
    regionCode: requiredText(input.regionCode, "regionCode"),
    datacenter: requiredText(input.datacenter, "机房"),
    productRef: requiredText(input.productRef, "实际产品标识"),
    declaredLabels: normalizeLabels(input.declaredLabels),
    configurationJson,
    configurationHash: networkConfigurationHash({
      regionCode: input.regionCode,
      datacenter: input.datacenter,
      productRef: input.productRef,
      declaredLabels: normalizeLabels(input.declaredLabels),
      configurationJson,
    }),
  };
}

async function latestCandidateRevision(tx: NetworkTransaction, candidateId: number) {
  const [latest] = await tx
    .select({ revision: max(networkLineCandidateRevisions.revision) })
    .from(networkLineCandidateRevisions)
    .where(eq(networkLineCandidateRevisions.candidateId, candidateId));
  return Number(latest?.revision ?? 0);
}

export async function createNetworkCandidate(
  input: CreateNetworkCandidateInput,
  actorId: string | null = null,
) {
  const slug = validateSlug(input.slug);
  const name = requiredText(input.name, "线路名称");
  const revisionValues = candidateRevisionValues(input);
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .insert(networkLineCandidates)
      .values({
        slug,
        name,
        enName: optionalText(input.enName),
        providerId: input.providerId ?? null,
        status: "draft",
      })
      .returning();
    if (!candidate) throw new Error("线路候选创建失败");
    const [revision] = await tx
      .insert(networkLineCandidateRevisions)
      .values({
        candidateId: candidate.id,
        revision: 1,
        ...revisionValues,
        createdBy: actorId,
      })
      .returning();
    if (!revision) throw new Error("线路配置 revision 创建失败");
    const [updated] = await tx
      .update(networkLineCandidates)
      .set({ currentConfigurationRevisionId: revision.id, updatedAt: new Date() })
      .where(eq(networkLineCandidates.id, candidate.id))
      .returning();
    if (!updated) throw new Error("线路配置 revision 指针更新失败");
    return { candidate: updated, revision };
  });
}

export async function createNetworkCandidateRevision(
  candidateId: number,
  input: CreateNetworkCandidateRevisionInput,
  actorId: string | null = null,
) {
  const revisionValues = candidateRevisionValues(input);
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(networkLineCandidates)
      .where(eq(networkLineCandidates.id, candidateId))
      .for("update")
      .limit(1);
    if (!candidate) throw new Error("线路候选不存在");
    if (candidate.status === "archived") throw new Error("已归档候选不可新增 revision");
    const revision = (await latestCandidateRevision(tx, candidateId)) + 1;
    const [created] = await tx
      .insert(networkLineCandidateRevisions)
      .values({
        candidateId,
        revision,
        ...revisionValues,
        createdBy: actorId,
      })
      .returning();
    if (!created) throw new Error("线路配置 revision 创建失败");
    const [updated] = await tx
      .update(networkLineCandidates)
      .set({ currentConfigurationRevisionId: created.id, updatedAt: new Date() })
      .where(eq(networkLineCandidates.id, candidateId))
      .returning();
    if (!updated) throw new Error("线路配置 revision 指针更新失败");
    return { candidate: updated, revision: created };
  });
}

export async function setNetworkCandidateStatus(
  candidateId: number,
  status: "draft" | "active" | "withdrawn" | "archived",
  actorId: string | null = null,
) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(networkLineCandidates)
      .set({
        status,
        archivedAt: status === "archived" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(networkLineCandidates.id, candidateId))
      .returning();
    if (!updated) throw new Error("线路候选不存在");
    void actorId;
    return updated;
  });
}

function campaignRevisionValues(input: CreateNetworkCampaignInput) {
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 1 || input.intervalMinutes > 10_080) {
    throw new Error("测量间隔必须在 1 到 10080 分钟之间");
  }
  if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
    throw new Error("活动结束时间必须晚于开始时间");
  }
  return {
    probeSelector: input.probeSelector,
    metricProfile: input.metricProfile,
    protocolVersion: requiredText(input.protocolVersion, "protocolVersion"),
    intervalMinutes: input.intervalMinutes,
    peakWindows: input.peakWindows ?? [],
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    configurationJson: input.configurationJson,
    configurationHash: networkConfigurationHash(input),
  };
}

export async function createNetworkMeasurementCampaign(
  input: CreateNetworkCampaignInput,
) {
  const values = campaignRevisionValues(input);
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: networkLineCandidates.id, status: networkLineCandidates.status })
      .from(networkLineCandidates)
      .where(eq(networkLineCandidates.id, input.candidateId))
      .limit(1);
    if (!candidate || candidate.status === "archived") {
      throw new Error("线路候选不存在或已归档");
    }
    const [campaign] = await tx
      .insert(networkMeasurementCampaigns)
      .values({ candidateId: input.candidateId, status: "draft" })
      .returning();
    if (!campaign) throw new Error("测量活动创建失败");
    const [revision] = await tx
      .insert(networkMeasurementCampaignRevisions)
      .values({ campaignId: campaign.id, revision: 1, ...values })
      .returning();
    if (!revision) throw new Error("测量活动 revision 创建失败");
    const [updated] = await tx
      .update(networkMeasurementCampaigns)
      .set({ currentConfigurationRevisionId: revision.id, updatedAt: new Date() })
      .where(eq(networkMeasurementCampaigns.id, campaign.id))
      .returning();
    if (!updated) throw new Error("测量活动 revision 指针更新失败");
    return { campaign: updated, revision };
  });
}

export async function setNetworkMeasurementCampaignStatus(
  campaignId: number,
  status: "draft" | "active" | "paused" | "retired",
  expectedGeneration: number,
) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(networkMeasurementCampaigns)
      .set({
        status,
        nextRunAt: status === "active" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(networkMeasurementCampaigns.id, campaignId),
          eq(networkMeasurementCampaigns.runGeneration, expectedGeneration),
        ),
      )
      .returning();
    if (!updated) throw new Error("测量活动已变化，请刷新后重试");
    const [bumped] = await tx
      .update(networkMeasurementCampaigns)
      .set({ runGeneration: updated.runGeneration + 1, updatedAt: new Date() })
      .where(eq(networkMeasurementCampaigns.id, campaignId))
      .returning();
    if (!bumped) throw new Error("测量活动 generation 更新失败");
    return bumped;
  });
}

export async function enqueueNetworkMeasurementRun(
  campaignId: number,
  slotAt: Date,
) {
  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .select({
        id: networkMeasurementCampaigns.id,
        status: networkMeasurementCampaigns.status,
        runGeneration: networkMeasurementCampaigns.runGeneration,
        revisionId: networkMeasurementCampaigns.currentConfigurationRevisionId,
      })
      .from(networkMeasurementCampaigns)
      .where(eq(networkMeasurementCampaigns.id, campaignId))
      .limit(1);
    if (campaign?.status !== "active" || !campaign.revisionId) {
      throw new Error("只有已激活且有当前 revision 的活动可以排程");
    }
    const [run] = await tx
      .insert(networkMeasurementRuns)
      .values({
        campaignId,
        campaignRevisionId: campaign.revisionId,
        slotAt,
        runGeneration: campaign.runGeneration,
        status: "queued",
      })
      .onConflictDoNothing()
      .returning();
    if (run) return run;
    const [existing] = await tx
      .select()
      .from(networkMeasurementRuns)
      .where(
        and(
          eq(networkMeasurementRuns.campaignId, campaignId),
          eq(networkMeasurementRuns.slotAt, slotAt),
          eq(networkMeasurementRuns.campaignRevisionId, campaign.revisionId),
          eq(networkMeasurementRuns.runGeneration, campaign.runGeneration),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("测量 run 幂等读取失败");
    return existing;
  });
}

export async function listNetworkCampaigns() {
  return db
    .select({
      id: networkMeasurementCampaigns.id,
      candidateId: networkMeasurementCampaigns.candidateId,
      status: networkMeasurementCampaigns.status,
      runGeneration: networkMeasurementCampaigns.runGeneration,
      nextRunAt: networkMeasurementCampaigns.nextRunAt,
      revisionId: networkMeasurementCampaigns.currentConfigurationRevisionId,
    })
    .from(networkMeasurementCampaigns)
    .orderBy(asc(networkMeasurementCampaigns.status), asc(networkMeasurementCampaigns.id));
}
