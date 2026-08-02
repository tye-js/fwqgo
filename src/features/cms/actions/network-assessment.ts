"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { db } from "@fwqgo/db";
import {
  networkAssessmentHeads,
  networkAssessmentSnapshots,
  networkMeasurementCredentials,
  networkMeasurementProbeRevisions,
  networkMeasurementProbes,
  networkMeasurementTargetRevisions,
  networkMeasurementTargets,
  networkTargetAgents,
} from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { defineAdminAction } from "@/features/cms/lib/define-admin-action";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  createNetworkCandidate,
  createNetworkCandidateRevision,
  createNetworkMeasurementCampaign,
  setNetworkCandidateStatus,
  setNetworkMeasurementCampaignStatus,
} from "@/server/network-assessment/campaign-service";
import {
  createNetworkTargetAgent,
  createNetworkMeasurementTarget,
  createNetworkProbe,
  issueNetworkMeasurementCredential,
  recordNetworkPrefixVerification,
  revokeNetworkMeasurementCredential,
} from "@/server/network-assessment/repository";
import {
  publishNetworkAssessment,
  withdrawNetworkAssessment,
} from "@/server/network-assessment/assessment-service";

const configurationJson = z.record(z.string(), z.unknown()).default({});

const candidateSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(240),
  enName: z.string().trim().max(240).nullable().optional(),
  providerId: postgresIntegerIdSchema.nullable().optional(),
  regionCode: z.string().trim().min(1).max(40),
  datacenter: z.string().trim().min(1).max(240),
  productRef: z.string().trim().min(1).max(240),
  declaredLabels: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  configurationJson,
});

const candidateRevisionSchema = candidateSchema.omit({
  slug: true,
  name: true,
  enName: true,
  providerId: true,
});

const candidateStatusSchema = z.object({
  candidateId: postgresIntegerIdSchema,
  status: z.enum(["draft", "active", "withdrawn", "archived"]),
});

const campaignSchema = z.object({
  candidateId: postgresIntegerIdSchema,
  probeSelector: configurationJson,
  metricProfile: configurationJson,
  protocolVersion: z.string().trim().min(1).max(80),
  intervalMinutes: z.number().int().min(1).max(10_080),
  peakWindows: z.array(configurationJson).max(20).default([]),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  configurationJson,
});

const campaignStatusSchema = z.object({
  campaignId: postgresIntegerIdSchema,
  status: z.enum(["draft", "active", "paused", "retired"]),
  expectedGeneration: z.number().int().positive(),
});

const probeSchema = z.object({
  sourceKind: z.string().trim().min(1).max(24),
  externalId: z.string().trim().min(1).max(160),
  countryCode: z.string().trim().max(16).nullable().optional(),
  regionCode: z.string().trim().min(1).max(40),
  carrier: z.enum(["telecom", "unicom", "mobile", "other"]),
  accessType: z.enum(["residential", "business", "mobile", "unknown"]),
  asn: z.number().int().positive().nullable().optional(),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  trustLevel: z.string().trim().min(1).max(8),
  ownerOrgKey: z.string().trim().min(1).max(120),
  accessPrefixKey: z.string().trim().min(1).max(160),
  physicalSiteKey: z.string().trim().min(1).max(160),
  independenceKey: z.string().trim().min(1).max(160),
});

const targetAgentSchema = z.object({
  candidateId: postgresIntegerIdSchema,
  externalId: z.string().trim().min(1).max(160),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
});

const targetSchema = z.object({
  candidateId: postgresIntegerIdSchema,
  targetAgentRevisionId: postgresIntegerIdSchema.nullable().optional(),
  addressFamily: z.enum(["ipv4", "ipv6"]),
  targetAddress: z.string().trim().min(1).max(160),
  targetPrefix: z.string().trim().min(1).max(160),
  originAsn: z.number().int().positive().nullable().optional(),
  port: z.number().int().min(1).max(65_535).nullable().optional(),
});

const credentialSchema = z
  .object({
    probeId: postgresIntegerIdSchema.optional(),
    targetAgentId: postgresIntegerIdSchema.optional(),
    keyId: z.string().trim().min(1).max(120).optional(),
    secret: z.string().min(32).max(512),
    expiresAt: z.coerce.date().nullable().optional(),
    rotationOfId: postgresIntegerIdSchema.nullable().optional(),
  })
  .refine((input) => Boolean(input.probeId) !== Boolean(input.targetAgentId), {
    message: "credential 必须且只能绑定 probe 或 target agent",
  });

const prefixVerificationSchema = z.object({
  targetRevisionId: postgresIntegerIdSchema,
  deliveryPrefixHash: z.string().trim().min(1).max(128),
  verificationMethod: z.string().trim().min(1).max(80),
  evidenceRef: z.string().trim().max(500).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});

const publishSchema = z.object({
  candidateId: postgresIntegerIdSchema,
  audienceProfileKey: z.string().trim().min(1).max(240),
  snapshotId: postgresIntegerIdSchema,
  expectedHeadRevision: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(8).max(160),
  eventType: z.enum(["published", "rollback_published"]).optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

const withdrawSchema = z.object({
  candidateId: postgresIntegerIdSchema,
  audienceProfileKey: z.string().trim().min(1).max(240),
  expectedHeadRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(160),
  reason: z.string().trim().min(1).max(500),
});

export const createNetworkCandidateAction = defineAdminAction({
  action: "network.candidate.create",
  entityType: "network_line_candidate",
  parse: (input: z.input<typeof candidateSchema>) => candidateSchema.parse(input),
  execute: async (input, session) => {
    const result = await createNetworkCandidate(input, session.userId);
    schedulePublicWebCache("network-assessment.changed", {
      networkCandidateSlugs: [result.candidate.slug],
    });
    return result;
  },
  successMessage: "线路候选草稿已创建",
  errorTitle: "线路候选创建失败",
  errorSuggestion: "请确认 slug、实际产品标识和配置 revision 信息完整。",
  entityId: (input) => input.slug,
});

export const createNetworkCandidateRevisionAction = defineAdminAction({
  action: "network.candidate.revision.create",
  entityType: "network_line_candidate",
  parse: (input: z.input<typeof candidateRevisionSchema>) =>
    candidateRevisionSchema
      .extend({ candidateId: postgresIntegerIdSchema })
      .parse(input),
  execute: async (input, session) => {
    const { candidateId, ...revision } = input;
    const result = await createNetworkCandidateRevision(
      candidateId,
      revision,
      session.userId,
    );
    schedulePublicWebCache("network-assessment.changed", {
      networkCandidateSlugs: [result.candidate.slug],
    });
    return result;
  },
  successMessage: "线路配置新 revision 已创建",
  errorTitle: "线路配置 revision 创建失败",
  errorSuggestion: "历史 revision 不可覆盖，变更请创建新版本。",
  entityId: (input) => input.candidateId,
});

export const setNetworkCandidateStatusAction = defineAdminAction({
  action: "network.candidate.status.set",
  entityType: "network_line_candidate",
  parse: (input: z.input<typeof candidateStatusSchema>) =>
    candidateStatusSchema.parse(input),
  execute: async (input) => {
    const result = await setNetworkCandidateStatus(input.candidateId, input.status);
    schedulePublicWebCache("network-assessment.changed", {
      networkCandidateSlugs: [result.slug],
    });
    return result;
  },
  successMessage: "线路候选状态已更新",
  errorTitle: "线路候选状态更新失败",
  entityId: (input) => input.candidateId,
});

export const createNetworkCampaignAction = defineAdminAction({
  action: "network.campaign.create",
  entityType: "network_measurement_campaign",
  parse: (input: z.input<typeof campaignSchema>) => campaignSchema.parse(input),
  execute: async (input) => createNetworkMeasurementCampaign(input),
  successMessage: "测量活动草稿已创建",
  errorTitle: "测量活动创建失败",
  errorSuggestion: "请检查间隔、时间窗和固定协议配置。",
  entityId: (input) => input.candidateId,
});

export const setNetworkCampaignStatusAction = defineAdminAction({
  action: "network.campaign.status.set",
  entityType: "network_measurement_campaign",
  parse: (input: z.input<typeof campaignStatusSchema>) =>
    campaignStatusSchema.parse(input),
  execute: async (input) => {
    const result = await setNetworkMeasurementCampaignStatus(
      input.campaignId,
      input.status,
      input.expectedGeneration,
    );
    schedulePublicWebCache("network-assessment.changed");
    return result;
  },
  successMessage: "测量活动状态已更新并递增 generation",
  errorTitle: "测量活动状态更新失败",
  errorSuggestion: "请刷新后使用最新 generation 重试。",
  entityId: (input) => input.campaignId,
});

export const createNetworkProbeAction = defineAdminAction({
  action: "network.probe.create",
  entityType: "network_measurement_probe",
  parse: (input: z.input<typeof probeSchema>) => probeSchema.parse(input),
  execute: async (input) => createNetworkProbe({ sourceKind: input.sourceKind, externalId: input.externalId, revision: input }),
  successMessage: "探针及配置 revision 已创建",
  errorTitle: "探针创建失败",
  errorSuggestion: "请检查运营商、地区、归属和 independence key 是否完整。",
  entityId: (input) => input.externalId,
});

export const createNetworkTargetAgentAction = defineAdminAction({
  action: "network.target-agent.create",
  entityType: "network_target_agent",
  parse: (input: z.input<typeof targetAgentSchema>) => targetAgentSchema.parse(input),
  execute: async (input) =>
    createNetworkTargetAgent({
      candidateId: input.candidateId,
      externalId: input.externalId,
      revision: { capabilities: input.capabilities },
    }),
  successMessage: "目标 agent 及配置 revision 已创建",
  errorTitle: "目标 agent 创建失败",
  errorSuggestion: "请确认候选存在且 externalId 在候选内唯一。",
  entityId: (input) => input.externalId,
});

export const createNetworkTargetAction = defineAdminAction({
  action: "network.target.create",
  entityType: "network_measurement_target",
  parse: (input: z.input<typeof targetSchema>) => targetSchema.parse(input),
  execute: async (input) =>
    createNetworkMeasurementTarget({
      candidateId: input.candidateId,
      revision: {
        targetAgentRevisionId: input.targetAgentRevisionId ?? null,
        addressFamily: input.addressFamily,
        targetAddress: input.targetAddress,
        targetPrefix: input.targetPrefix,
        originAsn: input.originAsn ?? null,
        port: input.port ?? null,
      },
    }),
  successMessage: "测量目标及 allowlist revision 已创建",
  errorTitle: "测量目标创建失败",
  errorSuggestion: "请确认地址族、目标前缀、端口和目标 agent revision 正确。",
  entityId: (input) => input.candidateId,
});

export const issueNetworkCredentialAction = defineAdminAction({
  action: "network.credential.issue",
  entityType: "network_measurement_credential",
  parse: (input: z.input<typeof credentialSchema>) => credentialSchema.parse(input),
  execute: async (input) => issueNetworkMeasurementCredential(input),
  successMessage: "credential 已加密保存；明文不会再次显示",
  errorTitle: "credential 签发失败",
  errorSuggestion: "请确认 secret 至少 32 字节，且只绑定一个 principal。",
  entityId: (input) => input.keyId ?? null,
});

export const recordNetworkPrefixVerificationAction = defineAdminAction({
  action: "network.target.prefix-verification.create",
  entityType: "network_target_prefix_verification",
  parse: (input: z.input<typeof prefixVerificationSchema>) =>
    prefixVerificationSchema.parse(input),
  execute: async (input, session) =>
    recordNetworkPrefixVerification({
      ...input,
      evidenceRef: input.evidenceRef ?? null,
      validUntil: input.validUntil ?? null,
      verifiedBy: session.userId,
    }),
  successMessage: "目标前缀核验记录已保存",
  errorTitle: "前缀核验记录失败",
  errorSuggestion: "请先确认 target revision、核验方式和可复核证据。",
  entityId: (input) => input.targetRevisionId,
});

export const revokeNetworkCredentialAction = defineAdminAction({
  action: "network.credential.revoke",
  entityType: "network_measurement_credential",
  parse: (input: { id: number }) => z.object({ id: postgresIntegerIdSchema }).parse(input),
  execute: async (input) => revokeNetworkMeasurementCredential(input.id),
  successMessage: "credential 已撤销",
  errorTitle: "credential 撤销失败",
  entityId: (input) => input.id,
});

export const publishNetworkAssessmentAction = defineAdminAction({
  action: "network.assessment.publish",
  entityType: "network_assessment_snapshot",
  parse: (input: z.input<typeof publishSchema>) => publishSchema.parse(input),
  execute: async (input, session) => {
    const result = await publishNetworkAssessment({ ...input, actorId: session.userId });
    schedulePublicWebCache("network-assessment.changed");
    return result;
  },
  successMessage: "线路 assessment head 已发布",
  errorTitle: "线路 assessment 发布失败",
  errorSuggestion: "请重新核对候选 revision、有效期和 head revision。",
  entityId: (input) => input.snapshotId,
});

export const withdrawNetworkAssessmentAction = defineAdminAction({
  action: "network.assessment.withdraw",
  entityType: "network_assessment_head",
  parse: (input: z.input<typeof withdrawSchema>) => withdrawSchema.parse(input),
  execute: async (input, session) => {
    const result = await withdrawNetworkAssessment({ ...input, actorId: session.userId });
    schedulePublicWebCache("network-assessment.changed");
    return result;
  },
  successMessage: "线路 assessment 已撤销",
  errorTitle: "线路 assessment 撤销失败",
  errorSuggestion: "请确认 head revision 与当前 CMS 数据一致。",
  entityId: (input) => input.candidateId,
});

export async function getNetworkAssessmentAdmin() {
  await requireAdminSession();
  return db
    .select({
      id: networkAssessmentSnapshots.id,
      candidateId: networkAssessmentSnapshots.candidateId,
      audienceProfileKey: networkAssessmentSnapshots.audienceProfileKey,
      observedFrom: networkAssessmentSnapshots.observedFrom,
      observedTo: networkAssessmentSnapshots.observedTo,
      validUntil: networkAssessmentSnapshots.validUntil,
      formulaVersion: networkAssessmentSnapshots.formulaVersion,
      policyChecksum: networkAssessmentSnapshots.policyChecksum,
      createdAt: networkAssessmentSnapshots.createdAt,
      headRevision: networkAssessmentHeads.headRevision,
      headSnapshotId: networkAssessmentHeads.snapshotId,
    })
    .from(networkAssessmentSnapshots)
    .leftJoin(
      networkAssessmentHeads,
      and(
        eq(
          networkAssessmentHeads.candidateId,
          networkAssessmentSnapshots.candidateId,
        ),
        eq(
          networkAssessmentHeads.audienceProfileKey,
          networkAssessmentSnapshots.audienceProfileKey,
        ),
      ),
    )
    .orderBy(desc(networkAssessmentSnapshots.createdAt))
    .limit(200);
}

export async function getNetworkResourceAdmin() {
  await requireAdminSession();
  const [probes, targetAgents, targets, credentials] = await Promise.all([
    db
      .select({
        id: networkMeasurementProbes.id,
        sourceKind: networkMeasurementProbes.sourceKind,
        externalId: networkMeasurementProbes.externalId,
        status: networkMeasurementProbes.status,
        revisionId: networkMeasurementProbes.currentConfigurationRevisionId,
        regionCode: networkMeasurementProbeRevisions.regionCode,
        carrier: networkMeasurementProbeRevisions.carrier,
        accessType: networkMeasurementProbeRevisions.accessType,
        lastSeenAt: networkMeasurementProbes.lastSeenAt,
      })
      .from(networkMeasurementProbes)
      .leftJoin(
        networkMeasurementProbeRevisions,
        eq(
          networkMeasurementProbeRevisions.id,
          networkMeasurementProbes.currentConfigurationRevisionId,
        ),
      )
      .orderBy(asc(networkMeasurementProbes.id)),
    db
      .select({
        id: networkTargetAgents.id,
        candidateId: networkTargetAgents.candidateId,
        externalId: networkTargetAgents.externalId,
        status: networkTargetAgents.status,
        revisionId: networkTargetAgents.currentConfigurationRevisionId,
        lastSeenAt: networkTargetAgents.lastSeenAt,
      })
      .from(networkTargetAgents)
      .orderBy(asc(networkTargetAgents.id)),
    db
      .select({
        id: networkMeasurementTargets.id,
        candidateId: networkMeasurementTargets.candidateId,
        enabled: networkMeasurementTargets.enabled,
        revisionId: networkMeasurementTargets.currentConfigurationRevisionId,
        addressFamily: networkMeasurementTargetRevisions.addressFamily,
        targetAddress: networkMeasurementTargetRevisions.targetAddress,
        targetPrefix: networkMeasurementTargetRevisions.targetPrefix,
        port: networkMeasurementTargetRevisions.port,
        targetAgentRevisionId: networkMeasurementTargetRevisions.targetAgentRevisionId,
      })
      .from(networkMeasurementTargets)
      .leftJoin(
        networkMeasurementTargetRevisions,
        eq(
          networkMeasurementTargetRevisions.id,
          networkMeasurementTargets.currentConfigurationRevisionId,
        ),
      )
      .orderBy(asc(networkMeasurementTargets.id)),
    db
      .select({
        id: networkMeasurementCredentials.id,
        probeId: networkMeasurementCredentials.probeId,
        targetAgentId: networkMeasurementCredentials.targetAgentId,
        keyId: networkMeasurementCredentials.keyId,
        activatedAt: networkMeasurementCredentials.activatedAt,
        expiresAt: networkMeasurementCredentials.expiresAt,
        revokedAt: networkMeasurementCredentials.revokedAt,
      })
      .from(networkMeasurementCredentials)
      .orderBy(asc(networkMeasurementCredentials.id)),
  ]);
  return { probes, targetAgents, targets, credentials };
}
