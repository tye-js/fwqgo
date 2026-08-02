import {
  NETWORK_EXPERIENCE_ENGINE_VERSION,
  type NetworkCarrier,
  type NetworkExperienceInputV1,
  type NetworkExperienceRule,
  type NetworkExperienceRuleSetSnapshot,
  regionMatches,
} from "./input";
import { unavailableNetworkExperienceResult, type NetworkExperienceResultV1 } from "./result";

const MAX_SUGGESTIONS = 3;

function specificity(rule: NetworkExperienceRule, input: NetworkExperienceInputV1): number {
  const regionWeight = rule.userRegion === "*" ? 0 : rule.userRegion === input.userRegion ? 2 : 1;
  return regionWeight + [rule.accessType, rule.destinationRegion, rule.workload].filter(
    (value) => value !== "*",
  ).length;
}

function compatible(rule: NetworkExperienceRule, input: NetworkExperienceInputV1, carrier: NetworkCarrier) {
  return (
    rule.carrier === carrier &&
    regionMatches(input.userRegion, rule.userRegion) &&
    (rule.accessType === "*" || rule.accessType === input.accessType) &&
    (rule.destinationRegion === "*" || rule.destinationRegion === input.destinationRegion) &&
    (rule.workload === "*" || rule.workload === input.workload)
  );
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function matchCarrier(
  input: NetworkExperienceInputV1,
  snapshot: NetworkExperienceRuleSetSnapshot,
  carrier: NetworkCarrier,
) {
  const rules = snapshot.rules.filter((rule) => compatible(rule, input, carrier));
  if (rules.length === 0) {
    return {
      carrier,
      suggestions: [],
      unresolvedCodes: ["no_matching_rule"],
      additionalSuggestionCount: 0,
    };
  }

  const highest = Math.max(...rules.map((rule) => specificity(rule, input)));
  const highestRules = rules.filter((rule) => specificity(rule, input) === highest);
  const byLine = new Map<string, NetworkExperienceRule[]>();
  for (const rule of highestRules) {
    const group = byLine.get(rule.networkLineSlug) ?? [];
    group.push(rule);
    byLine.set(rule.networkLineSlug, group);
  }

  const conflicts = new Set<string>();
  for (const [line, lineRules] of byLine) {
    const fits = new Set(lineRules.map((rule) => rule.fit));
    if (fits.size > 1) {
      conflicts.add(line);
    }
  }

  const sorted = [...byLine.entries()]
    .filter(([line]) => !conflicts.has(line))
    .map(([line, lineRules]) => {
      const ordered = [...lineRules].sort((a, b) => (b.priority - a.priority) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || a.ruleKey.localeCompare(b.ruleKey));
      const first = ordered[0]!;
      return {
        networkLineSlug: line,
        networkLineName: first.networkLineName,
        networkLineEnName: first.networkLineEnName,
        fit: first.fit === "unknown" ? "situational" : first.fit,
        basisStrength: first.basisStrength,
        conditionCodes: unique(lineRules.flatMap((rule) => rule.conditionCodes)),
        advantageCodes: unique(lineRules.flatMap((rule) => rule.advantageCodes)),
        riskCodes: unique(lineRules.flatMap((rule) => rule.riskCodes)),
        verificationCodes: unique(lineRules.flatMap((rule) => rule.verificationCodes)),
        relatedArticleIds: unique(lineRules.flatMap((rule) => rule.relatedArticleIds)),
        priority: first.priority,
        ruleKey: first.ruleKey,
      };
    })
    .sort((a, b) => (b.priority - a.priority) || a.ruleKey.localeCompare(b.ruleKey));

  const suggestions = sorted.slice(0, MAX_SUGGESTIONS).map(({ priority: _priority, ruleKey: _ruleKey, ...suggestion }) => suggestion);
  return {
    carrier,
    suggestions,
    unresolvedCodes: [...(conflicts.size > 0 ? ["conflicting_rules_at_same_specificity"] : []), ...(sorted.length > MAX_SUGGESTIONS ? ["additional_matching_rules_hidden"] : [])],
    additionalSuggestionCount: Math.max(0, sorted.length - MAX_SUGGESTIONS),
  };
}

export function matchNetworkExperience(
  input: NetworkExperienceInputV1,
  snapshot: NetworkExperienceRuleSetSnapshot | null,
): NetworkExperienceResultV1 {
  if (snapshot?.schemaVersion !== 1 || snapshot.engineVersion !== NETWORK_EXPERIENCE_ENGINE_VERSION) {
    return unavailableNetworkExperienceResult(input, snapshot ?? undefined);
  }
  const carriers: NetworkCarrier[] = input.carrier === "multi_carrier" ? ["telecom", "unicom", "mobile"] : [input.carrier];
  const carrierResults = carriers.map((carrier) => matchCarrier(input, snapshot, carrier));
  const matched = carrierResults.filter((result) => result.suggestions.length > 0).length;
  const hasConflict = carrierResults.some((result) => result.unresolvedCodes.includes("conflicting_rules_at_same_specificity"));
  return {
    status: matched === carriers.length && !hasConflict ? "matched" : matched > 0 ? "partial" : "unknown",
    versions: {
      engineVersion: snapshot.engineVersion,
      schemaVersion: 1,
      ruleSetVersion: snapshot.versionLabel,
      checksum: snapshot.checksum,
      reviewDueAt: snapshot.reviewDueAt ?? null,
    },
    normalizedInput: input,
    carrierResults,
    globalRiskCodes: unique([
      "provider_label_may_not_match_delivered_route",
      "return_path_may_differ",
      ...(input.carrier === "multi_carrier" ? ["multi_carrier_split"] : []),
    ]),
    verificationChecklistCodes: unique([
      "request_test_ip_and_looking_glass",
      "confirm_test_ip_matches_delivery_prefix",
      "run_ping_mtr_and_traceroute",
      "test_tcp_tls_and_real_request",
      "repeat_during_peak_hours",
      ...(input.carrier === "multi_carrier" ? ["test_with_each_relevant_carrier"] : []),
    ]),
  };
}
