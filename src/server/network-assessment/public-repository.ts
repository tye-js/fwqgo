import { and, eq, inArray } from "drizzle-orm";

import {
  audienceProfileKey,
  evaluateNetworkCandidate,
  finalizeRecommendationStates,
  PUBLISHED_NETWORK_SCORING_POLICY,
  type NetworkRecommendationRequestV1,
  type OperatorAssessmentPublic,
  type PublicAssessmentSnapshot,
} from "@fwqgo/core/network-assessment";
import { readDb } from "@fwqgo/db";
import {
  networkAssessmentHeads,
  networkAssessmentSnapshots,
  networkLineCandidates,
} from "@fwqgo/db/schema";

type PublicNetworkCandidate = {
  slug: string;
  name: string;
  enName: string | null;
  evaluation: ReturnType<typeof evaluateNetworkCandidate>;
};

export type NetworkRecommendationResponseV1 = {
  resultStatus: "ok" | "insufficient" | "unavailable";
  generatedAt: string;
  normalizedInput: NetworkRecommendationRequestV1;
  formulaVersion: string;
  policyChecksum: string;
  candidates: Array<NetworkRecommendationCandidatePublic>;
};

export type NetworkRecommendationCandidatePublic = ReturnType<
  typeof evaluateNetworkCandidate
> & {
  slug: string;
  name: string;
  enName: string | null;
};

function asDate(value: Date | null | undefined) {
  return value instanceof Date ? value : null;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asOperatorAssessments(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const result: Partial<
    Record<"telecom" | "unicom" | "mobile", OperatorAssessmentPublic>
  > = {};
  for (const carrier of ["telecom", "unicom", "mobile"] as const) {
    const item = record[carrier];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.qualityScoreBps !== "number" ||
      typeof row.confidenceBps !== "number" ||
      typeof row.overallCoverageBps !== "number" ||
      typeof row.peakCoverageBps !== "number" ||
      !["E0", "E1", "E2", "E3"].includes(row.evidenceGrade as string)
    ) {
      continue;
    }
    result[carrier] = {
      qualityScoreBps: row.qualityScoreBps,
      confidenceBps: row.confidenceBps,
      evidenceGrade:
        row.evidenceGrade as OperatorAssessmentPublic["evidenceGrade"],
      overallCoverageBps: row.overallCoverageBps,
      peakCoverageBps: row.peakCoverageBps,
      reasonCodes: asStringArray(row.reasonCodes),
      missingCells: asStringArray(row.missingCells),
    };
  }
  return result;
}

function toSnapshot(row: {
  id: number;
  observedFrom: Date;
  observedTo: Date;
  validUntil: Date | null;
  operatorAssessments: unknown;
  reasonCodes: unknown;
  riskCodes: unknown;
}): PublicAssessmentSnapshot {
  return {
    id: row.id,
    observedFrom: row.observedFrom,
    observedTo: row.observedTo,
    validUntil: asDate(row.validUntil),
    operatorAssessments: asOperatorAssessments(row.operatorAssessments),
    reasonCodes: asStringArray(row.reasonCodes),
    riskCodes: asStringArray(row.riskCodes),
  };
}

export async function getPublishedNetworkCandidates(
  input: NetworkRecommendationRequestV1,
): Promise<PublicNetworkCandidate[]> {
  const profileKey = audienceProfileKey(input);
  const rows = await readDb
    .select({
      slug: networkLineCandidates.slug,
      name: networkLineCandidates.name,
      enName: networkLineCandidates.enName,
      status: networkLineCandidates.status,
      currentRevisionId: networkLineCandidates.currentConfigurationRevisionId,
      snapshotId: networkAssessmentSnapshots.id,
      snapshotCandidateRevisionId: networkAssessmentSnapshots.candidateRevisionId,
      observedFrom: networkAssessmentSnapshots.observedFrom,
      observedTo: networkAssessmentSnapshots.observedTo,
      validUntil: networkAssessmentSnapshots.validUntil,
      operatorAssessments: networkAssessmentSnapshots.operatorAssessments,
      reasonCodes: networkAssessmentSnapshots.reasonCodes,
      riskCodes: networkAssessmentSnapshots.riskCodes,
    })
    .from(networkLineCandidates)
    .leftJoin(
      networkAssessmentHeads,
      and(
        eq(networkAssessmentHeads.candidateId, networkLineCandidates.id),
        eq(networkAssessmentHeads.audienceProfileKey, profileKey),
      ),
    )
    .leftJoin(
      networkAssessmentSnapshots,
      eq(networkAssessmentSnapshots.id, networkAssessmentHeads.snapshotId),
    )
    .where(inArray(networkLineCandidates.status, ["active", "withdrawn"]))
    .limit(20);

  return rows.map((row) => {
    const snapshot =
      row.snapshotId &&
      row.snapshotCandidateRevisionId === row.currentRevisionId &&
      row.observedFrom &&
      row.observedTo
        ? toSnapshot({
            id: row.snapshotId,
            observedFrom: row.observedFrom,
            observedTo: row.observedTo,
            validUntil: row.validUntil,
            operatorAssessments: row.operatorAssessments,
            reasonCodes: row.reasonCodes,
            riskCodes: row.riskCodes,
          })
        : null;
    return {
      slug: row.slug,
      name: row.name,
      enName: row.enName,
      evaluation: evaluateNetworkCandidate(
        {
          status: row.status as "active" | "withdrawn",
          snapshot,
        },
        input,
        PUBLISHED_NETWORK_SCORING_POLICY,
      ),
    };
  });
}

export async function recommendNetworkLines(
  input: NetworkRecommendationRequestV1,
): Promise<NetworkRecommendationResponseV1> {
  const candidates = await getPublishedNetworkCandidates(input);
  const finalized = finalizeRecommendationStates(
    candidates.map((candidate) => ({
      slug: candidate.slug,
      evaluation: candidate.evaluation,
    })),
    PUBLISHED_NETWORK_SCORING_POLICY,
  );
  const candidateBySlug = new Map(
    candidates.map((candidate) => [candidate.slug, candidate]),
  );
  const publicCandidates = finalized.map((item) => {
    const candidate = candidateBySlug.get(item.slug);
    return {
      slug: item.slug,
      name: candidate?.name ?? item.slug,
      enName: candidate?.enName ?? null,
      ...item.evaluation,
    };
  });
  return {
    resultStatus: publicCandidates.some(
      (candidate) => candidate.recommendationState === "recommended",
    )
      ? "ok"
      : publicCandidates.length > 0
        ? "insufficient"
        : "unavailable",
    generatedAt: new Date().toISOString(),
    normalizedInput: input,
    formulaVersion: PUBLISHED_NETWORK_SCORING_POLICY.formulaVersion,
    policyChecksum: PUBLISHED_NETWORK_SCORING_POLICY.checksum,
    candidates: publicCandidates,
  };
}
