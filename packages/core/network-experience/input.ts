export const NETWORK_EXPERIENCE_SCHEMA_VERSION = 1 as const;
export const NETWORK_EXPERIENCE_ENGINE_VERSION =
  "network-experience-engine-v1" as const;

export const REGION_CODES = [
  "beijing",
  "tianjin",
  "hebei",
  "shanxi",
  "neimenggu",
  "liaoning",
  "jilin",
  "heilongjiang",
  "shanghai",
  "jiangsu",
  "zhejiang",
  "anhui",
  "fujian",
  "jiangxi",
  "shandong",
  "henan",
  "hubei",
  "hunan",
  "guangdong",
  "guangxi",
  "hainan",
  "chongqing",
  "sichuan",
  "guizhou",
  "yunnan",
  "xizang",
  "shaanxi",
  "gansu",
  "qinghai",
  "ningxia",
  "xinjiang",
  "north_china",
  "east_china",
  "south_china",
  "southwest_china",
  "northwest_china",
  "northeast_china",
  "hong_kong",
  "japan",
  "singapore",
  "us_west",
  "other",
] as const;

export type RegionCode = (typeof REGION_CODES)[number];
export type NetworkCarrier = "telecom" | "unicom" | "mobile";
export type NetworkCarrierInput = NetworkCarrier | "multi_carrier";
export type NetworkAccessType =
  | "residential"
  | "business"
  | "mobile"
  | "unknown";
export type NetworkDestinationRegion =
  | "hong_kong"
  | "japan"
  | "singapore"
  | "us_west"
  | "other";
export type NetworkWorkload =
  | "web_api"
  | "realtime"
  | "download"
  | "background";

export type NetworkExperienceInputV1 = {
  schemaVersion: 1;
  userRegion: RegionCode;
  carrier: NetworkCarrierInput;
  accessType: NetworkAccessType;
  destinationRegion: NetworkDestinationRegion;
  workload: NetworkWorkload;
};

export type NetworkExperienceRuleDimension<T extends string> = T | "*";

export type NetworkExperienceRule = {
  ruleKey: string;
  networkLineSlug: string;
  networkLineName?: string;
  networkLineEnName?: string | null;
  userRegion: NetworkExperienceRuleDimension<RegionCode>;
  carrier: NetworkCarrier;
  accessType: NetworkExperienceRuleDimension<NetworkAccessType>;
  destinationRegion: NetworkExperienceRuleDimension<NetworkDestinationRegion>;
  workload: NetworkExperienceRuleDimension<NetworkWorkload>;
  fit: "usually_preferred" | "situational" | "usually_not_preferred" | "unknown";
  basisStrength: "established" | "common" | "limited";
  priority: number;
  conditionCodes: string[];
  advantageCodes: string[];
  riskCodes: string[];
  verificationCodes: string[];
  relatedArticleIds: number[];
  sortOrder?: number;
};

export type NetworkExperienceRuleSetSnapshot = {
  versionLabel: string;
  engineVersion: string;
  schemaVersion: 1;
  checksum: string;
  reviewDueAt?: string | null;
  validUntil?: string | null;
  rules: NetworkExperienceRule[];
};

export type NetworkInputIssue = {
  path: string;
  code: "invalid_type" | "invalid_value" | "missing";
  message: string;
};

export const NETWORK_CARRIERS: readonly NetworkCarrier[] = [
  "telecom",
  "unicom",
  "mobile",
];

export const NETWORK_ACCESS_TYPES: readonly NetworkAccessType[] = [
  "residential",
  "business",
  "mobile",
  "unknown",
];

export const NETWORK_DESTINATION_REGIONS: readonly NetworkDestinationRegion[] = [
  "hong_kong",
  "japan",
  "singapore",
  "us_west",
  "other",
];

export const NETWORK_WORKLOADS: readonly NetworkWorkload[] = [
  "web_api",
  "realtime",
  "download",
  "background",
];

const allowedKeys = new Set([
  "schemaVersion",
  "userRegion",
  "carrier",
  "accessType",
  "destinationRegion",
  "workload",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumIssue(
  issues: NetworkInputIssue[],
  path: string,
  value: unknown,
  values: readonly string[],
) {
  if (typeof value !== "string" || !values.includes(value)) {
    issues.push({
      path,
      code: "invalid_value",
      message: `必须是受控枚举：${values.join(", ")}`,
    });
  }
}

export function validateNetworkExperienceInput(
  value: unknown,
): NetworkInputIssue[] {
  if (!isRecord(value)) {
    return [
      {
        path: "input",
        code: "invalid_type",
        message: "输入必须是 JSON 对象",
      },
    ];
  }
  const issues: NetworkInputIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: key, code: "invalid_value", message: "不接受额外字段" });
    }
  }
  if (value.schemaVersion !== NETWORK_EXPERIENCE_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      code: "invalid_value",
      message: "只支持 schemaVersion 1",
    });
  }
  enumIssue(issues, "userRegion", value.userRegion, REGION_CODES);
  enumIssue(issues, "carrier", value.carrier, [...NETWORK_CARRIERS, "multi_carrier"]);
  enumIssue(issues, "accessType", value.accessType, NETWORK_ACCESS_TYPES);
  enumIssue(issues, "destinationRegion", value.destinationRegion, NETWORK_DESTINATION_REGIONS);
  enumIssue(issues, "workload", value.workload, NETWORK_WORKLOADS);
  return issues;
}

export function normalizeNetworkExperienceInput(
  value: NetworkExperienceInputV1,
): NetworkExperienceInputV1 {
  return {
    schemaVersion: 1,
    userRegion: value.userRegion,
    carrier: value.carrier,
    accessType: value.accessType,
    destinationRegion: value.destinationRegion,
    workload: value.workload,
  };
}

export const REGION_GROUPS: Record<string, readonly RegionCode[]> = {
  north_china: ["beijing", "tianjin", "hebei", "shanxi", "neimenggu"],
  northeast_china: ["liaoning", "jilin", "heilongjiang"],
  east_china: ["shanghai", "jiangsu", "zhejiang", "anhui", "fujian", "jiangxi", "shandong"],
  south_china: ["henan", "hubei", "hunan", "guangdong", "guangxi", "hainan"],
  southwest_china: ["chongqing", "sichuan", "guizhou", "yunnan", "xizang"],
  northwest_china: ["shaanxi", "gansu", "qinghai", "ningxia", "xinjiang"],
};

export function regionMatches(
  input: RegionCode,
  rule: NetworkExperienceRuleDimension<RegionCode>,
): boolean {
  if (rule === "*" || input === rule) return true;
  return REGION_GROUPS[rule]?.includes(input) ?? false;
}
