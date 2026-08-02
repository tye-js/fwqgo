import type {
  NetworkCarrier,
  NetworkExperienceInputV1,
  NetworkExperienceRuleSetSnapshot,
} from "./input";

export type NetworkExperienceSuggestion = {
  networkLineSlug: string;
  networkLineName?: string;
  networkLineEnName?: string | null;
  fit: "usually_preferred" | "situational" | "usually_not_preferred";
  basisStrength: "established" | "common" | "limited";
  conditionCodes: string[];
  advantageCodes: string[];
  riskCodes: string[];
  verificationCodes: string[];
  relatedArticleIds: number[];
};

export type NetworkExperienceCarrierResult = {
  carrier: NetworkCarrier;
  suggestions: NetworkExperienceSuggestion[];
  unresolvedCodes: string[];
  additionalSuggestionCount: number;
};

export type NetworkExperienceResultV1 = {
  status: "matched" | "partial" | "unknown" | "rule_unavailable";
  versions: {
    engineVersion: string;
    schemaVersion: 1;
    ruleSetVersion: string;
    checksum: string;
    reviewDueAt?: string | null;
  };
  normalizedInput: NetworkExperienceInputV1;
  carrierResults: NetworkExperienceCarrierResult[];
  globalRiskCodes: string[];
  verificationChecklistCodes: string[];
};

export function unavailableNetworkExperienceResult(
  input: NetworkExperienceInputV1,
  snapshot?: Pick<NetworkExperienceRuleSetSnapshot, "versionLabel" | "engineVersion" | "checksum" | "reviewDueAt">,
): NetworkExperienceResultV1 {
  const carriers: NetworkCarrier[] =
    input.carrier === "multi_carrier"
      ? ["telecom", "unicom", "mobile"]
      : [input.carrier];
  return {
    status: "rule_unavailable",
    versions: {
      engineVersion: snapshot?.engineVersion ?? "unavailable",
      schemaVersion: 1,
      ruleSetVersion: snapshot?.versionLabel ?? "unavailable",
      checksum: snapshot?.checksum ?? "unavailable",
      reviewDueAt: snapshot?.reviewDueAt ?? null,
    },
    normalizedInput: input,
    carrierResults: carriers.map((carrier) => ({
      carrier,
      suggestions: [],
      unresolvedCodes: ["no_published_rule"],
      additionalSuggestionCount: 0,
    })),
    globalRiskCodes: ["no_published_rule"],
    verificationChecklistCodes: ["request_test_ip_and_looking_glass", "run_ping_mtr_and_traceroute"],
  };
}
