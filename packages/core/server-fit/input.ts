export const SERVER_FIT_SCHEMA_VERSION = 1 as const;

export type SuitabilityFit =
  | "usually_suitable"
  | "conditional"
  | "usually_unsuitable"
  | "insufficient_data";

export type SuitabilityScenario =
  | "mainland_web_api"
  | "overseas_web_api"
  | "mixed_audience"
  | "remote_ai_development"
  | "ai_api_backend"
  | "transactional_ecommerce"
  | "realtime_service"
  | "large_transfer"
  | "self_hosted_streaming"
  | "third_party_streaming_access"
  | "dev_test";

export const SUITABILITY_SCENARIOS: readonly SuitabilityScenario[] = [
  "mainland_web_api",
  "overseas_web_api",
  "mixed_audience",
  "remote_ai_development",
  "ai_api_backend",
  "transactional_ecommerce",
  "realtime_service",
  "large_transfer",
  "self_hosted_streaming",
  "third_party_streaming_access",
  "dev_test",
];

/**
 * Only fields that are already structured in the offer inventory belong here.
 * The evaluator deliberately does not parse marketing prose or produce a
 * network quality score.
 */
export type ServerFitOffer = {
  region: string | null;
  lineType: string | null;
  productType: string | null;
  vcpuCount: number | null;
  memoryMb: number | null;
  storageGb: number | null;
  storageType: string | null;
  bandwidthMbps: number | null;
  trafficGb: number | null;
  ipv4: string | null;
  ipv6: string | null;
};

export type ServerFitCollectionInput = {
  offers: ServerFitOffer[];
  scopeKind: "topic" | "region" | "line" | "provider" | "all";
  scopeLabel?: string | null;
  scenarios?: SuitabilityScenario[];
};

export type ServerFitRecommendation = {
  scenario: SuitabilityScenario;
  fit: SuitabilityFit;
  usuallySuitable: string[];
  conditional: string[];
  usuallyUnsuitable: string[];
  checkBeforeOrder: string[];
  missingFields: string[];
};

export type ServerFitCollectionResult = {
  schemaVersion: 1;
  scopeKind: ServerFitCollectionInput["scopeKind"];
  scopeLabel: string | null;
  offerCount: number;
  overallFit: SuitabilityFit;
  overallSummary: string;
  recommendations: ServerFitRecommendation[];
};
