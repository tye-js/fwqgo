import { createHash, randomBytes } from "node:crypto";

import { and, asc, eq, max } from "drizzle-orm";

import { encryptSecret, maskStoredSecret } from "@fwqgo/core/secret-envelope";
import { db } from "@fwqgo/db";
import {
  networkMeasurementCredentials,
  networkMeasurementProbeRevisions,
  networkMeasurementProbes,
  networkMeasurementTargetRevisions,
  networkMeasurementTargets,
  networkTargetAgentRevisions,
  networkTargetAgents,
  networkTargetPrefixVerifications,
} from "@fwqgo/db/schema";

type AssessmentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function requiredText(value: string | null | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
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

export function networkRevisionHash(value: unknown) {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function nextRevision(value: number | null | undefined) {
  const revision = Number(value ?? 0) + 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("revision 已超出安全整数范围");
  }
  return revision;
}

type ProbeRevisionInput = {
  countryCode?: string | null;
  regionCode: string;
  carrier: "telecom" | "unicom" | "mobile" | "other";
  accessType: "residential" | "business" | "mobile" | "unknown";
  asn?: number | bigint | null;
  capabilities?: string[];
  trustLevel: string;
  ownerOrgKey: string;
  accessPrefixKey: string;
  physicalSiteKey: string;
  independenceKey: string;
};

type TargetAgentRevisionInput = {
  capabilities?: string[];
};

type TargetRevisionInput = {
  targetAgentRevisionId?: number | null;
  addressFamily: "ipv4" | "ipv6";
  targetAddress: string;
  targetPrefix: string;
  originAsn?: number | bigint | null;
  port?: number | null;
};

function normalizeCapabilities(value: string[] | undefined) {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 40);
}

function normalizeAsn(value: number | bigint | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === "bigint" ? value : BigInt(value);
  if (normalized <= 0n) throw new Error("ASN 必须为正数");
  return normalized;
}

export async function createNetworkProbe(input: {
  sourceKind: string;
  externalId: string;
  revision: ProbeRevisionInput;
}) {
  const sourceKind = requiredText(input.sourceKind, "probe sourceKind");
  const externalId = requiredText(input.externalId, "probe externalId");
  return db.transaction(async (tx) => {
    const [probe] = await tx
      .insert(networkMeasurementProbes)
      .values({ sourceKind, externalId, status: "active" })
      .returning();
    if (!probe) throw new Error("探针创建失败");
    const revision = await createNetworkProbeRevisionInTransaction(tx, probe.id, input.revision);
    return { probe: { ...probe, currentConfigurationRevisionId: revision.id }, revision };
  });
}

async function createNetworkProbeRevisionInTransaction(
  tx: AssessmentTransaction,
  probeId: number,
  input: ProbeRevisionInput,
) {
  const [probe] = await tx
    .select({ id: networkMeasurementProbes.id, status: networkMeasurementProbes.status })
    .from(networkMeasurementProbes)
    .where(eq(networkMeasurementProbes.id, probeId))
    .for("update")
    .limit(1);
  if (!probe || probe.status === "archived" || probe.status === "revoked") {
    throw new Error("探针不存在或不可新增 revision");
  }
  const [latest] = await tx
    .select({ revision: max(networkMeasurementProbeRevisions.revision) })
    .from(networkMeasurementProbeRevisions)
    .where(eq(networkMeasurementProbeRevisions.probeId, probeId));
  const revision = nextRevision(latest?.revision);
  const values = {
    probeId,
    revision,
    countryCode: input.countryCode?.trim() ?? null,
    regionCode: requiredText(input.regionCode, "probe regionCode"),
    carrier: input.carrier,
    accessType: input.accessType,
    asn: normalizeAsn(input.asn),
    capabilities: normalizeCapabilities(input.capabilities),
    trustLevel: requiredText(input.trustLevel, "probe trustLevel"),
    ownerOrgKey: requiredText(input.ownerOrgKey, "probe ownerOrgKey"),
    accessPrefixKey: requiredText(input.accessPrefixKey, "probe accessPrefixKey"),
    physicalSiteKey: requiredText(input.physicalSiteKey, "probe physicalSiteKey"),
    independenceKey: requiredText(input.independenceKey, "probe independenceKey"),
    configurationHash: networkRevisionHash(input),
  };
  const [created] = await tx.insert(networkMeasurementProbeRevisions).values(values).returning();
  if (!created) throw new Error("探针 revision 创建失败");
  const [updated] = await tx
    .update(networkMeasurementProbes)
    .set({ currentConfigurationRevisionId: created.id, lastSeenAt: new Date() })
    .where(eq(networkMeasurementProbes.id, probeId))
    .returning();
  if (!updated) throw new Error("探针 revision 指针更新失败");
  return created;
}

export async function createNetworkProbeRevision(probeId: number, input: ProbeRevisionInput) {
  return db.transaction(async (tx) => {
    const revision = await createNetworkProbeRevisionInTransaction(tx, probeId, input);
    return revision;
  });
}

export async function createNetworkTargetAgent(input: {
  candidateId: number;
  externalId: string;
  revision?: TargetAgentRevisionInput;
}) {
  const externalId = requiredText(input.externalId, "target agent externalId");
  return db.transaction(async (tx) => {
    const [agent] = await tx
      .insert(networkTargetAgents)
      .values({ candidateId: input.candidateId, externalId, status: "active" })
      .returning();
    if (!agent) throw new Error("目标 agent 创建失败");
    const revision = await createNetworkTargetAgentRevisionInTransaction(
      tx,
      agent.id,
      input.revision ?? { capabilities: [] },
    );
    return { agent: { ...agent, currentConfigurationRevisionId: revision.id }, revision };
  });
}

async function createNetworkTargetAgentRevisionInTransaction(
  tx: AssessmentTransaction,
  targetAgentId: number,
  input: TargetAgentRevisionInput,
) {
  const [agent] = await tx
    .select({ id: networkTargetAgents.id, status: networkTargetAgents.status })
    .from(networkTargetAgents)
    .where(eq(networkTargetAgents.id, targetAgentId))
    .for("update")
    .limit(1);
  if (agent?.status !== "active") throw new Error("目标 agent 不存在或不可用");
  const [latest] = await tx
    .select({ revision: max(networkTargetAgentRevisions.revision) })
    .from(networkTargetAgentRevisions)
    .where(eq(networkTargetAgentRevisions.targetAgentId, targetAgentId));
  const revision = nextRevision(latest?.revision);
  const capabilities = normalizeCapabilities(input.capabilities);
  const [created] = await tx
    .insert(networkTargetAgentRevisions)
    .values({
      targetAgentId,
      revision,
      capabilities,
      configurationHash: networkRevisionHash({ capabilities }),
    })
    .returning();
  if (!created) throw new Error("目标 agent revision 创建失败");
  const [updated] = await tx
    .update(networkTargetAgents)
    .set({ currentConfigurationRevisionId: created.id, lastSeenAt: new Date() })
    .where(eq(networkTargetAgents.id, targetAgentId))
    .returning();
  if (!updated) throw new Error("目标 agent revision 指针更新失败");
  return created;
}

export async function createNetworkTargetAgentRevision(
  targetAgentId: number,
  input: TargetAgentRevisionInput,
) {
  return db.transaction(async (tx) =>
    createNetworkTargetAgentRevisionInTransaction(tx, targetAgentId, input),
  );
}

export async function createNetworkMeasurementTarget(input: {
  candidateId: number;
  revision: TargetRevisionInput;
}) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .insert(networkMeasurementTargets)
      .values({ candidateId: input.candidateId, enabled: true })
      .returning();
    if (!target) throw new Error("测量目标创建失败");
    const revision = await createNetworkMeasurementTargetRevisionInTransaction(
      tx,
      target.id,
      input.revision,
    );
    return { target: { ...target, currentConfigurationRevisionId: revision.id }, revision };
  });
}

async function createNetworkMeasurementTargetRevisionInTransaction(
  tx: AssessmentTransaction,
  targetId: number,
  input: TargetRevisionInput,
) {
  const [target] = await tx
    .select({ id: networkMeasurementTargets.id, candidateId: networkMeasurementTargets.candidateId })
    .from(networkMeasurementTargets)
    .where(eq(networkMeasurementTargets.id, targetId))
    .for("update")
    .limit(1);
  if (!target) throw new Error("测量目标不存在");
  const [latest] = await tx
    .select({ revision: max(networkMeasurementTargetRevisions.revision) })
    .from(networkMeasurementTargetRevisions)
    .where(eq(networkMeasurementTargetRevisions.targetId, targetId));
  const revision = nextRevision(latest?.revision);
  const targetAddress = requiredText(input.targetAddress, "target address");
  const targetPrefix = requiredText(input.targetPrefix, "target prefix");
  const [created] = await tx
    .insert(networkMeasurementTargetRevisions)
    .values({
      targetId,
      revision,
      targetAgentRevisionId: input.targetAgentRevisionId ?? null,
      addressFamily: input.addressFamily,
      targetAddress,
      targetPrefix,
      originAsn: normalizeAsn(input.originAsn),
      port: input.port ?? null,
      configurationHash: networkRevisionHash(input),
    })
    .returning();
  if (!created) throw new Error("测量目标 revision 创建失败");
  const [updated] = await tx
    .update(networkMeasurementTargets)
    .set({ currentConfigurationRevisionId: created.id })
    .where(eq(networkMeasurementTargets.id, targetId))
    .returning();
  if (!updated) throw new Error("测量目标 revision 指针更新失败");
  return created;
}

export async function createNetworkMeasurementTargetRevision(
  targetId: number,
  input: TargetRevisionInput,
) {
  return db.transaction(async (tx) =>
    createNetworkMeasurementTargetRevisionInTransaction(tx, targetId, input),
  );
}

export async function recordNetworkPrefixVerification(input: {
  targetRevisionId: number;
  deliveryPrefixHash: string;
  verificationMethod: string;
  evidenceRef?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: Date;
  validUntil?: Date | null;
}) {
  const [row] = await db
    .insert(networkTargetPrefixVerifications)
    .values({
      targetRevisionId: input.targetRevisionId,
      deliveryPrefixHash: requiredText(input.deliveryPrefixHash, "deliveryPrefixHash"),
      verificationMethod: requiredText(input.verificationMethod, "verificationMethod"),
      evidenceRef: input.evidenceRef?.trim() ?? null,
      verifiedBy: input.verifiedBy ?? null,
      verifiedAt: input.verifiedAt ?? new Date(),
      validUntil: input.validUntil ?? null,
    })
    .returning();
  if (!row) throw new Error("前缀核验记录创建失败");
  return row;
}

export async function issueNetworkMeasurementCredential(input: {
  probeId?: number;
  targetAgentId?: number;
  keyId?: string;
  secret: string;
  activatedAt?: Date;
  expiresAt?: Date | null;
  rotationOfId?: number | null;
}) {
  if ((input.probeId ? 1 : 0) + (input.targetAgentId ? 1 : 0) !== 1) {
    throw new Error("credential 必须且只能绑定 probe 或 target agent");
  }
  const keyId = requiredText(
    input.keyId ?? `network-${randomBytes(8).toString("hex")}`,
    "keyId",
  );
  const activatedAt = input.activatedAt ?? new Date();
  if (input.expiresAt && input.expiresAt <= activatedAt) {
    throw new Error("credential expiresAt 必须晚于 activatedAt");
  }
  const [row] = await db
    .insert(networkMeasurementCredentials)
    .values({
      probeId: input.probeId ?? null,
      targetAgentId: input.targetAgentId ?? null,
      keyId,
      secretCiphertext: encryptSecret(requiredText(input.secret, "secret")),
      activatedAt,
      expiresAt: input.expiresAt ?? null,
      rotationOfId: input.rotationOfId ?? null,
    })
    .returning();
  if (!row) throw new Error("credential 创建失败");
  return { ...row, secretCiphertext: maskStoredSecret(row.secretCiphertext) };
}

export async function revokeNetworkMeasurementCredential(id: number) {
  const [row] = await db
    .update(networkMeasurementCredentials)
    .set({ revokedAt: new Date() })
    .where(and(eq(networkMeasurementCredentials.id, id)))
    .returning({ id: networkMeasurementCredentials.id, revokedAt: networkMeasurementCredentials.revokedAt });
  if (!row) throw new Error("credential 不存在");
  return row;
}

export async function listNetworkMeasurementCredentials() {
  return db
    .select({
      id: networkMeasurementCredentials.id,
      probeId: networkMeasurementCredentials.probeId,
      targetAgentId: networkMeasurementCredentials.targetAgentId,
      keyId: networkMeasurementCredentials.keyId,
      activatedAt: networkMeasurementCredentials.activatedAt,
      expiresAt: networkMeasurementCredentials.expiresAt,
      revokedAt: networkMeasurementCredentials.revokedAt,
      createdAt: networkMeasurementCredentials.createdAt,
    })
    .from(networkMeasurementCredentials)
    .orderBy(asc(networkMeasurementCredentials.createdAt));
}
