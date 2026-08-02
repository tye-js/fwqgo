import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  knowledgeSourceRevisions,
  knowledgeSources,
  networkAssessmentHeads,
  networkAssessmentInputRollups,
  networkAssessmentPublicationEvents,
  networkAssessmentSources,
  networkAssessmentSnapshots,
  networkLineCandidates,
  networkMeasurementRollups,
  networkRouteStateSnapshots,
} from "@fwqgo/db/schema";

type AssessmentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NetworkAssessmentOperatorValue = {
  qualityScoreBps: number;
  confidenceBps: number;
  evidenceGrade: "E0" | "E1" | "E2" | "E3";
  overallCoverageBps: number;
  peakCoverageBps: number;
  reasonCodes?: string[];
  missingCells?: string[];
};

export type CreateNetworkAssessmentSnapshotInput = {
  candidateId: number;
  audienceProfileKey: string;
  candidateRevisionId: number;
  targetSetHash: string;
  routeStateSnapshotId?: number | null;
  measurementProtocolVersion: string;
  parserVersion: string;
  rollupSchemaVersion: number;
  formulaVersion: string;
  policyChecksum: string;
  inputManifestJson: Record<string, unknown>;
  inputManifestHash: string;
  observedFrom: Date;
  observedTo: Date;
  validUntil?: Date | null;
  operatorAssessments: Record<string, NetworkAssessmentOperatorValue>;
  reasonCodes?: string[];
  riskCodes?: string[];
  inputRollups?: Array<{
    rollupId: number;
    cellKey: string;
    role: string;
    weightBps: number;
  }>;
  sourceRevisions?: Array<{
    sourceRevisionId: number;
    claimScope: string;
    evidenceRole: string;
  }>;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function assessmentManifestHash(value: unknown) {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function boundedScore(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label}必须是 0 到 10000 的整数基点`);
  }
  return value;
}

function normalizeOperators(
  values: Record<string, NetworkAssessmentOperatorValue>,
) {
  const output: Record<string, NetworkAssessmentOperatorValue> = {};
  for (const [carrier, value] of Object.entries(values)) {
    if (!value || typeof value !== "object") throw new Error("运营商评估格式无效");
    if (!/^[a-z0-9_-]+$/u.test(carrier) || carrier.length > 40) {
      throw new Error("运营商评估键无效");
    }
    if (!(["E0", "E1", "E2", "E3"] as const).includes(value.evidenceGrade)) {
      throw new Error("证据等级无效");
    }
    output[carrier] = {
      qualityScoreBps: boundedScore(value.qualityScoreBps, "质量分"),
      confidenceBps: boundedScore(value.confidenceBps, "置信度"),
      evidenceGrade: value.evidenceGrade,
      overallCoverageBps: boundedScore(value.overallCoverageBps, "覆盖率"),
      peakCoverageBps: boundedScore(value.peakCoverageBps, "高峰覆盖率"),
      reasonCodes: [...new Set(value.reasonCodes ?? [])].slice(0, 40),
      missingCells: [...new Set(value.missingCells ?? [])].slice(0, 80),
    };
  }
  return output;
}

function validateSnapshotInput(input: CreateNetworkAssessmentSnapshotInput) {
  if (!input.audienceProfileKey.trim() || input.audienceProfileKey.length > 240) {
    throw new Error("audienceProfileKey 无效");
  }
  if (input.observedTo <= input.observedFrom) {
    throw new Error("观测结束时间必须晚于开始时间");
  }
  if (input.validUntil && input.validUntil <= input.observedTo) {
    throw new Error("validUntil 必须晚于观测窗口");
  }
  if (!Number.isInteger(input.rollupSchemaVersion) || input.rollupSchemaVersion < 1) {
    throw new Error("rollupSchemaVersion 无效");
  }
  if (!input.targetSetHash.trim()) throw new Error("targetSetHash 不能为空");
  for (const [label, value] of [
    ["measurementProtocolVersion", input.measurementProtocolVersion],
    ["parserVersion", input.parserVersion],
    ["formulaVersion", input.formulaVersion],
    ["policyChecksum", input.policyChecksum],
  ] as const) {
    if (!value.trim()) throw new Error(`${label} 不能为空`);
  }
  if (
    input.inputManifestHash.trim() !== assessmentManifestHash(input.inputManifestJson)
  ) {
    throw new Error("inputManifestHash 与 inputManifestJson 不一致");
  }
  for (const rollup of input.inputRollups ?? []) {
    if (
      !Number.isSafeInteger(rollup.rollupId) ||
      rollup.rollupId <= 0 ||
      !rollup.cellKey.trim() ||
      !rollup.role.trim() ||
      !Number.isInteger(rollup.weightBps) ||
      rollup.weightBps < 0 ||
      rollup.weightBps > 10_000
    ) {
      throw new Error("assessment rollup 引用无效");
    }
  }
  if (
    new Set((input.inputRollups ?? []).map((item) => item.rollupId)).size !==
    (input.inputRollups ?? []).length
  ) {
    throw new Error("assessment rollup 不能重复");
  }
  for (const source of input.sourceRevisions ?? []) {
    if (!Number.isSafeInteger(source.sourceRevisionId) || source.sourceRevisionId <= 0) {
      throw new Error("assessment 来源 revision 无效");
    }
    if (!source.claimScope.trim() || !source.evidenceRole.trim()) {
      throw new Error("assessment 来源 claim/evidence 不能为空");
    }
  }
  if (
    new Set((input.sourceRevisions ?? []).map((item) => item.sourceRevisionId)).size !==
    (input.sourceRevisions ?? []).length
  ) {
    throw new Error("assessment 来源 revision 不能重复");
  }
  return normalizeOperators(input.operatorAssessments);
}

export async function createNetworkAssessmentSnapshot(
  input: CreateNetworkAssessmentSnapshotInput,
) {
  const operatorAssessments = validateSnapshotInput(input);
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: networkLineCandidates.id,
        currentRevisionId: networkLineCandidates.currentConfigurationRevisionId,
      })
      .from(networkLineCandidates)
      .where(eq(networkLineCandidates.id, input.candidateId))
      .for("update")
      .limit(1);
    if (candidate?.currentRevisionId !== input.candidateRevisionId) {
      throw new Error("assessment candidate revision 不是当前配置");
    }
    if (input.routeStateSnapshotId) {
      const [routeState] = await tx
        .select({ candidateRevisionId: networkRouteStateSnapshots.candidateRevisionId })
        .from(networkRouteStateSnapshots)
        .where(eq(networkRouteStateSnapshots.id, input.routeStateSnapshotId))
        .limit(1);
      if (routeState?.candidateRevisionId !== input.candidateRevisionId) {
        throw new Error("route state snapshot 与 candidate revision 不匹配");
      }
    }
    const rollupIds = [...new Set((input.inputRollups ?? []).map((item) => item.rollupId))];
    if (rollupIds.length > 0) {
      const rows = await tx
        .select({ id: networkMeasurementRollups.id, candidateId: networkMeasurementRollups.candidateId })
        .from(networkMeasurementRollups)
        .where(inArray(networkMeasurementRollups.id, rollupIds));
      if (rows.length !== rollupIds.length || rows.some((row) => row.candidateId !== input.candidateId)) {
        throw new Error("assessment rollup 不属于当前候选");
      }
    }
    const sourceIds = [...new Set((input.sourceRevisions ?? []).map((item) => item.sourceRevisionId))];
    if (sourceIds.length > 0) {
      const rows = await tx
        .select({ id: knowledgeSourceRevisions.id })
        .from(knowledgeSourceRevisions)
        .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeSourceRevisions.sourceId))
        .where(and(inArray(knowledgeSourceRevisions.id, sourceIds), eq(knowledgeSources.status, "active")));
      if (rows.length !== sourceIds.length) throw new Error("assessment 来源 revision 不可用");
    }
    const [snapshot] = await tx
      .insert(networkAssessmentSnapshots)
      .values({
        candidateId: input.candidateId,
        audienceProfileKey: input.audienceProfileKey.trim(),
        candidateRevisionId: input.candidateRevisionId,
        targetSetHash: input.targetSetHash.trim(),
        routeStateSnapshotId: input.routeStateSnapshotId ?? null,
        measurementProtocolVersion: input.measurementProtocolVersion.trim(),
        parserVersion: input.parserVersion.trim(),
        rollupSchemaVersion: input.rollupSchemaVersion,
        formulaVersion: input.formulaVersion.trim(),
        policyChecksum: input.policyChecksum.trim(),
        inputManifestJson: input.inputManifestJson,
        inputManifestHash: input.inputManifestHash.trim(),
        observedFrom: input.observedFrom,
        observedTo: input.observedTo,
        validUntil: input.validUntil ?? null,
        operatorAssessments,
        reasonCodes: [...new Set(input.reasonCodes ?? [])].slice(0, 80),
        riskCodes: [...new Set(input.riskCodes ?? [])].slice(0, 80),
      })
      .returning();
    if (!snapshot) throw new Error("assessment snapshot 创建失败");
    if (input.inputRollups?.length) {
      await tx.insert(networkAssessmentInputRollups).values(
        input.inputRollups.map((item) => ({ snapshotId: snapshot.id, ...item })),
      );
    }
    if (input.sourceRevisions?.length) {
      await tx.insert(networkAssessmentSources).values(
        input.sourceRevisions.map((item) => ({ snapshotId: snapshot.id, ...item })),
      );
    }
    return snapshot;
  });
}

async function loadPublishableSnapshot(
  tx: AssessmentTransaction,
  input: { candidateId: number; snapshotId: number },
) {
  const [candidate] = await tx
    .select({
      id: networkLineCandidates.id,
      status: networkLineCandidates.status,
      currentRevisionId: networkLineCandidates.currentConfigurationRevisionId,
    })
    .from(networkLineCandidates)
    .where(eq(networkLineCandidates.id, input.candidateId))
    .for("update")
    .limit(1);
  if (candidate?.status !== "active") {
    throw new Error("只有 active 候选可以发布 assessment");
  }
  const [snapshot] = await tx
    .select()
    .from(networkAssessmentSnapshots)
    .where(eq(networkAssessmentSnapshots.id, input.snapshotId))
    .limit(1);
  if (snapshot?.candidateId !== input.candidateId) {
    throw new Error("assessment snapshot 不属于当前候选");
  }
  if (
    candidate.currentRevisionId !== snapshot.candidateRevisionId ||
    (snapshot.validUntil && snapshot.validUntil <= new Date())
  ) {
    throw new Error("assessment snapshot 已不是当前配置或已过期");
  }
  return snapshot;
}

type AssessmentPublicationInput = {
  candidateId: number;
  audienceProfileKey: string;
  snapshotId: number;
  expectedHeadRevision?: number;
  actorId: string;
  idempotencyKey: string;
  eventType?: "published" | "rollback_published";
  reason?: string | null;
};

export async function publishNetworkAssessment(
  input: AssessmentPublicationInput,
) {
  return db.transaction(async (tx) => {
    const snapshot = await loadPublishableSnapshot(tx, input);
    const [head] = await tx
      .select()
      .from(networkAssessmentHeads)
      .where(
        and(
          eq(networkAssessmentHeads.candidateId, input.candidateId),
          eq(networkAssessmentHeads.audienceProfileKey, input.audienceProfileKey),
        ),
      )
      .for("update")
      .limit(1);
    const expected = input.expectedHeadRevision ?? head?.headRevision ?? 1;
    if (head && head.headRevision !== expected) {
      throw new Error("assessment head 已变化，请刷新后重试");
    }
    const nextRevision = head ? head.headRevision + 1 : 1;
    const [updatedHead] = head
      ? await tx
          .update(networkAssessmentHeads)
          .set({
            snapshotId: snapshot.id,
            headRevision: nextRevision,
            updatedBy: input.actorId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(networkAssessmentHeads.candidateId, input.candidateId),
              eq(networkAssessmentHeads.audienceProfileKey, input.audienceProfileKey),
              eq(networkAssessmentHeads.headRevision, expected),
            ),
          )
          .returning()
      : await tx
          .insert(networkAssessmentHeads)
          .values({
            candidateId: input.candidateId,
            audienceProfileKey: input.audienceProfileKey,
            snapshotId: snapshot.id,
            headRevision: nextRevision,
            updatedBy: input.actorId,
          })
          .returning();
    if (!updatedHead) throw new Error("assessment head 发布失败");
    const [event] = await tx
      .insert(networkAssessmentPublicationEvents)
      .values({
        candidateId: input.candidateId,
        audienceProfileKey: input.audienceProfileKey,
        snapshotId: snapshot.id,
        eventType: input.eventType ?? "published",
        idempotencyKey: input.idempotencyKey,
        reason: input.reason ?? null,
        actorId: input.actorId,
      })
      .onConflictDoNothing()
      .returning();
    return { head: updatedHead, event: event ?? null };
  });
}

export async function withdrawNetworkAssessment(input: {
  candidateId: number;
  audienceProfileKey: string;
  expectedHeadRevision: number;
  actorId: string;
  idempotencyKey: string;
  reason: string;
}) {
  return db.transaction(async (tx) => {
    const [head] = await tx
      .select()
      .from(networkAssessmentHeads)
      .where(
        and(
          eq(networkAssessmentHeads.candidateId, input.candidateId),
          eq(networkAssessmentHeads.audienceProfileKey, input.audienceProfileKey),
        ),
      )
      .for("update")
      .limit(1);
    if (head?.headRevision !== input.expectedHeadRevision) {
      throw new Error("assessment head 已变化或不存在");
    }
    const [updated] = await tx
      .update(networkAssessmentHeads)
      .set({
        snapshotId: null,
        headRevision: head.headRevision + 1,
        updatedBy: input.actorId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(networkAssessmentHeads.candidateId, input.candidateId),
          eq(networkAssessmentHeads.audienceProfileKey, input.audienceProfileKey),
          eq(networkAssessmentHeads.headRevision, input.expectedHeadRevision),
        ),
      )
      .returning();
    if (!updated) throw new Error("assessment 撤销失败");
    const [event] = await tx
      .insert(networkAssessmentPublicationEvents)
      .values({
        candidateId: input.candidateId,
        audienceProfileKey: input.audienceProfileKey,
        snapshotId: null,
        eventType: "withdrawn",
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        actorId: input.actorId,
      })
      .onConflictDoNothing()
      .returning();
    return { head: updated, event: event ?? null };
  });
}
