export const NETWORK_ASSESSMENT_SCHEMA_VERSION = 1 as const;
export const NETWORK_ASSESSMENT_FORMULA_VERSION =
  "network-assessment-formula-v1" as const;
export const NETWORK_ASSESSMENT_POLICY_VERSION =
  "network-launch-scope-v1" as const;

export const NETWORK_REGION_CODES = [
  "north_china",
  "east_china",
  "south_china",
  "southwest_china",
  "hong_kong",
  "japan",
  "singapore",
  "us_west",
] as const;

export type NetworkRegionCode = (typeof NETWORK_REGION_CODES)[number];
export type NetworkCarrier = "telecom" | "unicom" | "mobile";
export type NetworkAccessType =
  "residential" | "business" | "mobile" | "unknown";
export type NetworkWorkload =
  "web_api" | "realtime" | "download" | "background";
export type NetworkBalanceMode = "weighted" | "three_carrier_balanced";

export type NetworkRecommendationRequestV1 = {
  schemaVersion: 1;
  language: "zh" | "en";
  userRegionCode: NetworkRegionCode;
  carrierWeightsBps: Record<NetworkCarrier, number>;
  accessType: NetworkAccessType;
  destinationRegionCode: NetworkRegionCode;
  workload: NetworkWorkload;
  addressFamily: "ipv4";
  balanceMode: NetworkBalanceMode;
};

export type NetworkInputIssue = {
  path: string;
  code: "invalid_type" | "invalid_value" | "out_of_range" | "missing";
  message: string;
};

const allowedKeys = new Set([
  "schemaVersion",
  "language",
  "userRegionCode",
  "carrierWeightsBps",
  "accessType",
  "destinationRegionCode",
  "workload",
  "addressFamily",
  "balanceMode",
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

export function validateNetworkRecommendationInput(
  value: unknown,
): NetworkInputIssue[] {
  const issues: NetworkInputIssue[] = [];
  if (!isRecord(value)) {
    return [
      {
        path: "body",
        code: "invalid_type",
        message: "请求体必须是 JSON 对象",
      },
    ];
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push({
        path: key,
        code: "invalid_value",
        message: "不接受额外字段",
      });
    }
  }

  if (value.schemaVersion !== 1) {
    issues.push({
      path: "schemaVersion",
      code: "invalid_value",
      message: "只支持 schemaVersion 1",
    });
  }
  enumIssue(issues, "language", value.language, ["zh", "en"]);
  enumIssue(
    issues,
    "userRegionCode",
    value.userRegionCode,
    NETWORK_REGION_CODES,
  );
  enumIssue(
    issues,
    "destinationRegionCode",
    value.destinationRegionCode,
    NETWORK_REGION_CODES,
  );
  enumIssue(issues, "accessType", value.accessType, [
    "residential",
    "business",
    "mobile",
    "unknown",
  ]);
  enumIssue(issues, "workload", value.workload, [
    "web_api",
    "realtime",
    "download",
    "background",
  ]);
  enumIssue(issues, "addressFamily", value.addressFamily, ["ipv4"]);
  enumIssue(issues, "balanceMode", value.balanceMode, [
    "weighted",
    "three_carrier_balanced",
  ]);

  const weights = value.carrierWeightsBps;
  if (!isRecord(weights)) {
    issues.push({
      path: "carrierWeightsBps",
      code: "invalid_type",
      message: "运营商权重必须是对象",
    });
  } else {
    const carrierKeys = ["telecom", "unicom", "mobile"] as const;
    for (const key of carrierKeys) {
      const weight = weights[key];
      if (!Number.isInteger(weight)) {
        issues.push({
          path: `carrierWeightsBps.${key}`,
          code: "invalid_type",
          message: "权重必须是整数基点",
        });
      } else if ((weight as number) < 0 || (weight as number) > 10_000) {
        issues.push({
          path: `carrierWeightsBps.${key}`,
          code: "out_of_range",
          message: "权重必须在 0 到 10000 之间",
        });
      }
    }
    for (const key of Object.keys(weights)) {
      if (!carrierKeys.includes(key as (typeof carrierKeys)[number])) {
        issues.push({
          path: `carrierWeightsBps.${key}`,
          code: "invalid_value",
          message: "只接受电信、联通、移动权重",
        });
      }
    }
    const total = carrierKeys.reduce((sum, key) => {
      const weight = weights[key];
      return sum + (Number.isInteger(weight) ? (weight as number) : 0);
    }, 0);
    if (total !== 10_000) {
      issues.push({
        path: "carrierWeightsBps",
        code: "invalid_value",
        message: "运营商权重总和必须等于 10000",
      });
    }
  }

  return issues;
}

export function normalizeNetworkRecommendationInput(
  value: NetworkRecommendationRequestV1,
): NetworkRecommendationRequestV1 {
  const weights = {
    telecom: value.carrierWeightsBps.telecom,
    unicom: value.carrierWeightsBps.unicom,
    mobile: value.carrierWeightsBps.mobile,
  };
  return {
    ...value,
    schemaVersion: 1,
    carrierWeightsBps: weights,
    addressFamily: "ipv4",
  };
}

export function audienceProfileKey(
  input: Pick<
    NetworkRecommendationRequestV1,
    | "userRegionCode"
    | "accessType"
    | "destinationRegionCode"
    | "workload"
    | "addressFamily"
  >,
) {
  return [
    input.userRegionCode,
    input.accessType,
    input.destinationRegionCode,
    input.workload,
    input.addressFamily,
  ].join(":");
}
