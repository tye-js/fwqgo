import {
  NETWORK_ASSESSMENT_FORMULA_VERSION,
  NETWORK_ASSESSMENT_POLICY_VERSION,
  type NetworkCarrier,
  type NetworkRecommendationRequestV1,
} from "./input";

export type EvidenceGrade = "E0" | "E1" | "E2" | "E3";
export type NetworkFreshness = "fresh" | "aging" | "expired";

export type OperatorAssessmentPublic = {
  qualityScoreBps: number;
  confidenceBps: number;
  evidenceGrade: EvidenceGrade;
  overallCoverageBps: number;
  peakCoverageBps: number;
  reasonCodes: string[];
  missingCells: string[];
};

export type PublicAssessmentSnapshot = {
  id: number;
  observedFrom: Date;
  observedTo: Date;
  validUntil: Date | null;
  operatorAssessments: Partial<
    Record<NetworkCarrier, OperatorAssessmentPublic>
  >;
  reasonCodes: string[];
  riskCodes: string[];
};

export type NetworkCandidateEvaluation = {
  recommendationState: "recommended" | "candidate" | "insufficient";
  freshness: NetworkFreshness | null;
  availability: "active" | "withdrawn" | "unavailable";
  qualityScoreBps: number | null;
  tieBreakerScoreBps: number | null;
  confidenceBps: number | null;
  evidenceGrade: EvidenceGrade | null;
  coverageBps: number | null;
  operatorAssessments: Record<NetworkCarrier, OperatorAssessmentPublic | null>;
  observedFrom: string | null;
  observedTo: string | null;
  validUntil: string | null;
  reasonCodes: string[];
  riskCodes: string[];
  missingCells: string[];
  validationChecklistCodes: string[];
};

export type NetworkCandidateForEvaluation = {
  status: "draft" | "active" | "withdrawn" | "archived";
  snapshot: PublicAssessmentSnapshot | null;
};

export type NetworkScoringPolicy = {
  formulaVersion: typeof NETWORK_ASSESSMENT_FORMULA_VERSION;
  policyVersion: typeof NETWORK_ASSESSMENT_POLICY_VERSION;
  minimumQualityBps: number;
  minimumConfidenceBps: number;
  minimumCoverageBps: number;
  minimumEvidenceGrade: EvidenceGrade;
  minimumRecommendedCandidates: number;
  checksum: string;
};

export const DEFAULT_NETWORK_SCORING_POLICY: NetworkScoringPolicy = {
  formulaVersion: NETWORK_ASSESSMENT_FORMULA_VERSION,
  policyVersion: NETWORK_ASSESSMENT_POLICY_VERSION,
  minimumQualityBps: 6_000,
  minimumConfidenceBps: 7_000,
  minimumCoverageBps: 7_000,
  minimumEvidenceGrade: "E2",
  minimumRecommendedCandidates: 2,
  checksum: "network-policy-v1-fnv1a64-pending",
};

const evidenceRank: Record<EvidenceGrade, number> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
};

const carriers: NetworkCarrier[] = ["telecom", "unicom", "mobile"];

function minDefined(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.min(...present) : null;
}

function weightedAverage(
  values: Partial<Record<NetworkCarrier, number>>,
  weights: Record<NetworkCarrier, number>,
) {
  let totalWeight = 0;
  let weighted = 0;
  for (const carrier of carriers) {
    const value = values[carrier];
    const weight = weights[carrier];
    if (value === undefined || weight <= 0) continue;
    weighted += value * weight;
    totalWeight += weight;
  }
  return totalWeight === 10_000 ? Math.round(weighted / 10_000) : null;
}

export function freshnessFor(
  snapshot: PublicAssessmentSnapshot,
  now = new Date(),
): NetworkFreshness {
  if (snapshot.validUntil && snapshot.validUntil.getTime() <= now.getTime()) {
    return "expired";
  }
  const ageDays =
    (now.getTime() - snapshot.observedTo.getTime()) / (24 * 60 * 60 * 1000);
  return ageDays > 14 ? "aging" : "fresh";
}

function isGradeAtLeast(actual: EvidenceGrade, required: EvidenceGrade) {
  return evidenceRank[actual] >= evidenceRank[required];
}

export function evaluateNetworkCandidate(
  candidate: NetworkCandidateForEvaluation,
  input: Pick<
    NetworkRecommendationRequestV1,
    "carrierWeightsBps" | "balanceMode"
  >,
  policy: NetworkScoringPolicy = DEFAULT_NETWORK_SCORING_POLICY,
  now = new Date(),
): NetworkCandidateEvaluation {
  const emptyAssessments = {
    telecom: null,
    unicom: null,
    mobile: null,
  } satisfies Record<NetworkCarrier, OperatorAssessmentPublic | null>;
  const snapshot = candidate.snapshot;
  if (candidate.status === "withdrawn") {
    return {
      recommendationState: "insufficient",
      freshness: null,
      availability: "withdrawn",
      qualityScoreBps: null,
      tieBreakerScoreBps: null,
      confidenceBps: null,
      evidenceGrade: null,
      coverageBps: null,
      operatorAssessments: emptyAssessments,
      observedFrom: null,
      observedTo: null,
      validUntil: null,
      reasonCodes: ["candidate_withdrawn"],
      riskCodes: [],
      missingCells: [],
      validationChecklistCodes: [],
    };
  }
  if (candidate.status !== "active" || !snapshot) {
    return {
      recommendationState: "insufficient",
      freshness: null,
      availability: "unavailable",
      qualityScoreBps: null,
      tieBreakerScoreBps: null,
      confidenceBps: null,
      evidenceGrade: null,
      coverageBps: null,
      operatorAssessments: emptyAssessments,
      observedFrom: null,
      observedTo: null,
      validUntil: null,
      reasonCodes: ["no_published_assessment"],
      riskCodes: [],
      missingCells: [],
      validationChecklistCodes: [],
    };
  }

  const assessments = {
    telecom: snapshot.operatorAssessments.telecom ?? null,
    unicom: snapshot.operatorAssessments.unicom ?? null,
    mobile: snapshot.operatorAssessments.mobile ?? null,
  } satisfies Record<NetworkCarrier, OperatorAssessmentPublic | null>;
  const missingCells = carriers.flatMap((carrier) =>
    assessments[carrier]?.missingCells ?? [`${carrier}:all`],
  );
  const qualityWeighted = weightedAverage(
    Object.fromEntries(
      carriers.flatMap((carrier) =>
        assessments[carrier]
          ? [[carrier, assessments[carrier].qualityScoreBps]]
          : [],
      ),
    ),
    input.carrierWeightsBps,
  );
  const confidenceWeighted = weightedAverage(
    Object.fromEntries(
      carriers.flatMap((carrier) =>
        assessments[carrier]
          ? [[carrier, assessments[carrier].confidenceBps]]
          : [],
      ),
    ),
    input.carrierWeightsBps,
  );
  const coverageWeighted = weightedAverage(
    Object.fromEntries(
      carriers.flatMap((carrier) =>
        assessments[carrier]
          ? [[carrier, assessments[carrier].overallCoverageBps]]
          : [],
      ),
    ),
    input.carrierWeightsBps,
  );
  const selectedCarriers = carriers.filter(
    (carrier) => input.carrierWeightsBps[carrier] > 0,
  );
  const gradeValues = selectedCarriers
    .map((carrier) => assessments[carrier]?.evidenceGrade ?? null)
    .filter((value): value is EvidenceGrade => value !== null);
  const evidenceGrade = gradeValues.length
    ? gradeValues.reduce((lowest, value) =>
        evidenceRank[value] < evidenceRank[lowest] ? value : lowest,
      )
    : null;
  const allCarriersPresent = carriers.every((carrier) => assessments[carrier]);
  const quality =
    input.balanceMode === "three_carrier_balanced"
      ? minDefined(
          carriers.map(
            (carrier) => assessments[carrier]?.qualityScoreBps ?? null,
          ),
        )
      : qualityWeighted;
  const confidence =
    input.balanceMode === "three_carrier_balanced"
      ? minDefined(
          carriers.map(
            (carrier) => assessments[carrier]?.confidenceBps ?? null,
          ),
        )
      : confidenceWeighted;
  const coverage =
    input.balanceMode === "three_carrier_balanced"
      ? minDefined(
          carriers.map(
            (carrier) => assessments[carrier]?.overallCoverageBps ?? null,
          ),
        )
      : coverageWeighted;
  const freshness = freshnessFor(snapshot, now);
  const scoreAvailable =
    quality !== null &&
    confidence !== null &&
    coverage !== null &&
    evidenceGrade;
  const missingRequiredCarrier =
    input.balanceMode === "three_carrier_balanced"
      ? !allCarriersPresent
      : carriers.some(
          (carrier) =>
            input.carrierWeightsBps[carrier] > 0 && !assessments[carrier],
      );
  const passesPolicy =
    scoreAvailable &&
    !missingRequiredCarrier &&
    freshness !== "expired" &&
    quality >= policy.minimumQualityBps &&
    confidence >= policy.minimumConfidenceBps &&
    coverage >= policy.minimumCoverageBps &&
    isGradeAtLeast(evidenceGrade, policy.minimumEvidenceGrade);
  const reasonCodes = [
    ...snapshot.reasonCodes,
    ...(freshness === "aging" ? ["assessment_aging"] : []),
    ...(freshness === "expired" ? ["assessment_expired"] : []),
    ...(missingRequiredCarrier ? ["required_carrier_cell_missing"] : []),
    ...(scoreAvailable && quality < policy.minimumQualityBps
      ? ["quality_below_policy"]
      : []),
    ...(scoreAvailable && confidence < policy.minimumConfidenceBps
      ? ["confidence_below_policy"]
      : []),
  ];
  const tieBreaker =
    input.balanceMode === "three_carrier_balanced"
      ? minDefined(
          carriers.map(
            (carrier) => assessments[carrier]?.qualityScoreBps ?? null,
          ),
        )
      : coverage;
  const validationChecklistCodes = [
    "verify_same_prefix_after_purchase",
    "repeat_bidirectional_peak_measurement",
    ...(freshness === "aging" ? ["schedule_retest"] : []),
  ];

  return {
    recommendationState: passesPolicy ? "candidate" : "insufficient",
    freshness,
    availability: "active",
    qualityScoreBps: quality,
    tieBreakerScoreBps: tieBreaker,
    confidenceBps: confidence,
    evidenceGrade,
    coverageBps: coverage,
    operatorAssessments: assessments,
    observedFrom: snapshot.observedFrom.toISOString(),
    observedTo: snapshot.observedTo.toISOString(),
    validUntil: snapshot.validUntil?.toISOString() ?? null,
    reasonCodes: [...new Set(reasonCodes)],
    riskCodes: snapshot.riskCodes,
    missingCells: [...new Set(missingCells)],
    validationChecklistCodes,
  };
}

export function sortNetworkEvaluations(
  values: Array<{ evaluation: NetworkCandidateEvaluation; slug: string }>,
) {
  return [...values].sort((left, right) => {
    const l = left.evaluation;
    const r = right.evaluation;
    const state = (value: NetworkCandidateEvaluation["recommendationState"]) =>
      value === "candidate" ? 2 : value === "insufficient" ? 1 : 0;
    return (
      state(r.recommendationState) - state(l.recommendationState) ||
      (r.tieBreakerScoreBps ?? -1) - (l.tieBreakerScoreBps ?? -1) ||
      (r.qualityScoreBps ?? -1) - (l.qualityScoreBps ?? -1) ||
      left.slug.localeCompare(right.slug)
    );
  });
}

export function finalizeRecommendationStates(
  evaluations: Array<{ evaluation: NetworkCandidateEvaluation; slug: string }>,
  policy: NetworkScoringPolicy = DEFAULT_NETWORK_SCORING_POLICY,
) {
  const sorted = sortNetworkEvaluations(evaluations);
  const qualified = sorted.filter(
    ({ evaluation }) => evaluation.recommendationState === "candidate",
  );
  const enoughCandidates =
    qualified.length >= policy.minimumRecommendedCandidates;
  return sorted.map((item) => ({
    ...item,
    evaluation: {
      ...item.evaluation,
      recommendationState:
        enoughCandidates && item.evaluation.recommendationState === "candidate"
          ? "recommended"
          : item.evaluation.recommendationState,
      reasonCodes:
        enoughCandidates || item.evaluation.recommendationState !== "candidate"
          ? item.evaluation.reasonCodes
          : [
              ...item.evaluation.reasonCodes,
              "insufficient_qualified_candidates",
            ],
    },
  }));
}

export function networkPolicyChecksum(
  policy: Omit<NetworkScoringPolicy, "checksum">,
) {
  const payload = JSON.stringify(policy, Object.keys(policy).sort());
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(payload)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

const { checksum: _pendingChecksum, ...networkPolicyWithoutChecksum } =
  DEFAULT_NETWORK_SCORING_POLICY;
void _pendingChecksum;

export const PUBLISHED_NETWORK_SCORING_POLICY: NetworkScoringPolicy = {
  ...DEFAULT_NETWORK_SCORING_POLICY,
  checksum: networkPolicyChecksum(networkPolicyWithoutChecksum),
};
