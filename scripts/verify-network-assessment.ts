import assert from "node:assert/strict";

import {
  evaluateNetworkCandidate,
  finalizeRecommendationStates,
  PUBLISHED_NETWORK_SCORING_POLICY,
  validateNetworkRecommendationInput,
  type NetworkRecommendationRequestV1,
  type PublicAssessmentSnapshot,
} from "@fwqgo/core/network-assessment";

assert.match(PUBLISHED_NETWORK_SCORING_POLICY.checksum, /^fnv1a64:/);
const input: NetworkRecommendationRequestV1 = {
  schemaVersion: 1,
  language: "zh",
  userRegionCode: "east_china",
  carrierWeightsBps: { telecom: 3334, unicom: 3333, mobile: 3333 },
  accessType: "residential",
  destinationRegionCode: "hong_kong",
  workload: "web_api",
  addressFamily: "ipv4",
  balanceMode: "weighted",
};
assert.equal(validateNetworkRecommendationInput(input).length, 0);
const snapshot: PublicAssessmentSnapshot = {
  id: 1,
  observedFrom: new Date("2026-07-20T00:00:00.000Z"),
  observedTo: new Date("2026-07-27T00:00:00.000Z"),
  validUntil: new Date("2026-08-27T00:00:00.000Z"),
  operatorAssessments: {
    telecom: { qualityScoreBps: 9000, confidenceBps: 9000, evidenceGrade: "E2", overallCoverageBps: 9000, peakCoverageBps: 9000, reasonCodes: [], missingCells: [] },
    unicom: { qualityScoreBps: 9000, confidenceBps: 9000, evidenceGrade: "E2", overallCoverageBps: 9000, peakCoverageBps: 9000, reasonCodes: [], missingCells: [] },
    mobile: { qualityScoreBps: 9000, confidenceBps: 9000, evidenceGrade: "E2", overallCoverageBps: 9000, peakCoverageBps: 9000, reasonCodes: [], missingCells: [] },
  },
  reasonCodes: [],
  riskCodes: [],
};
const evaluation = evaluateNetworkCandidate(
  { status: "active", snapshot },
  input,
  PUBLISHED_NETWORK_SCORING_POLICY,
  new Date("2026-07-28T00:00:00.000Z"),
);
assert.equal(evaluation.recommendationState, "candidate");
const finalized = finalizeRecommendationStates([
  { slug: "candidate-a", evaluation },
  { slug: "candidate-b", evaluation },
]);
assert.ok(finalized.every((item) => item.evaluation.recommendationState === "recommended"));

console.log(
  `Network assessment verified: formula=${PUBLISHED_NETWORK_SCORING_POLICY.formulaVersion}, policy=${PUBLISHED_NETWORK_SCORING_POLICY.checksum}`,
);
