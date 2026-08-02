import {
  NETWORK_EXPERIENCE_ENGINE_VERSION,
  NETWORK_EXPERIENCE_SCHEMA_VERSION,
  NETWORK_ACCESS_TYPES,
  NETWORK_CARRIERS,
  NETWORK_DESTINATION_REGIONS,
  NETWORK_WORKLOADS,
  REGION_CODES,
  type NetworkExperienceRule,
  type NetworkExperienceRuleSetSnapshot,
  stableNetworkExperienceChecksum,
} from "@fwqgo/core/network-experience";

export { stableNetworkExperienceChecksum } from "@fwqgo/core/network-experience";

function validRule(rule: NetworkExperienceRule) {
  const dimension = (value: string, values: readonly string[]) => value === "*" || values.includes(value);
  return (
    Boolean(rule.ruleKey) &&
    Boolean(rule.networkLineSlug) &&
    Number.isInteger(rule.priority) &&
    dimension(rule.userRegion, REGION_CODES) &&
    NETWORK_CARRIERS.includes(rule.carrier) &&
    dimension(rule.accessType, NETWORK_ACCESS_TYPES) &&
    dimension(rule.destinationRegion, NETWORK_DESTINATION_REGIONS) &&
    dimension(rule.workload, NETWORK_WORKLOADS) &&
    ["usually_preferred", "situational", "usually_not_preferred", "unknown"].includes(rule.fit) &&
    ["established", "common", "limited"].includes(rule.basisStrength) &&
    rule.conditionCodes.length <= 12 &&
    rule.advantageCodes.length <= 12 &&
    rule.riskCodes.length > 0 &&
    rule.verificationCodes.length > 0
  );
}

export function validateNetworkExperienceSnapshot(
  value: unknown,
): value is NetworkExperienceRuleSetSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<NetworkExperienceRuleSetSnapshot>;
  if (
    snapshot.schemaVersion !== NETWORK_EXPERIENCE_SCHEMA_VERSION ||
    snapshot.engineVersion !== NETWORK_EXPERIENCE_ENGINE_VERSION ||
    typeof snapshot.versionLabel !== "string" ||
    typeof snapshot.checksum !== "string" ||
    !Array.isArray(snapshot.rules) ||
    snapshot.rules.length > 5000
  ) {
    return false;
  }
  const keys = new Set<string>();
  if (!snapshot.rules.every((rule) => {
    if (keys.has(rule.ruleKey)) return false;
    keys.add(rule.ruleKey);
    return validRule(rule);
  })) return false;
  const { checksum, ...withoutChecksum } = snapshot as NetworkExperienceRuleSetSnapshot;
  return stableNetworkExperienceChecksum(withoutChecksum) === checksum;
}
