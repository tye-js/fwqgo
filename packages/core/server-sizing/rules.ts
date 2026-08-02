import type { WorkloadKind } from "./input";

export const SERVER_SIZING_ENGINE_VERSION = "server-sizing-engine-v1";
export const SERVER_SIZING_SCHEMA_VERSION = 1 as const;

export type WorkloadProfile = {
  baseRssGiB: number;
  workerReserveGiB: number;
  defaultDynamicRatio: number;
  defaultEdgeCacheHitRatio: number;
  defaultBurstFactor: number;
  defaultCpuMsPerRequest: number;
  defaultResponseTimeMs: number;
  defaultResponseBytes: number;
  defaultRpsPerVcpu: number;
  batchDefaults?: {
    averageJobDurationSeconds: number;
    cpuSecondsPerJob: number;
    memoryGiBPerConcurrentJob: number;
    temporaryStorageGiBPerConcurrentJob: number;
    storageReadGiBPerJob: number;
    storageWriteGiBPerJob: number;
    networkIngressGiBPerJob: number;
    networkEgressGiBPerJob: number;
  };
};

export type ServerSizingRuleSet = {
  versionLabel: string;
  engineVersion: string;
  schemaVersion: 1;
  status: "draft" | "published" | "retired";
  validUntil?: string;
  targetCpuUtilization: number;
  targetMemoryUtilization: number;
  targetNetworkUtilization: number;
  targetDiskUtilization: number;
  targetStorageIoUtilization: number;
  targetWorkerUtilization: number;
  backgroundCpu: number;
  failureSpare: number;
  safeCapacityFactor: number;
  profiles: Record<WorkloadKind, WorkloadProfile>;
  checksum: string;
};

const common: WorkloadProfile = {
  baseRssGiB: 0.5,
  workerReserveGiB: 0.25,
  defaultDynamicRatio: 0.6,
  defaultEdgeCacheHitRatio: 0.25,
  defaultBurstFactor: 2,
  defaultCpuMsPerRequest: 8,
  defaultResponseTimeMs: 120,
  defaultResponseBytes: 128 * 1024,
  defaultRpsPerVcpu: 35,
};

function profile(overrides: Partial<WorkloadProfile>): WorkloadProfile {
  return { ...common, ...overrides };
}

export const DEFAULT_SERVER_SIZING_RULE_SET: ServerSizingRuleSet = {
  versionLabel: "2026.08.1",
  engineVersion: SERVER_SIZING_ENGINE_VERSION,
  schemaVersion: SERVER_SIZING_SCHEMA_VERSION,
  status: "published",
  targetCpuUtilization: 0.7,
  targetMemoryUtilization: 0.75,
  targetNetworkUtilization: 0.7,
  targetDiskUtilization: 0.7,
  targetStorageIoUtilization: 0.7,
  targetWorkerUtilization: 0.7,
  backgroundCpu: 0.2,
  failureSpare: 1,
  safeCapacityFactor: 0.7,
  profiles: {
    static_content: profile({
      baseRssGiB: 0.25,
      defaultDynamicRatio: 0.1,
      defaultEdgeCacheHitRatio: 0.8,
      defaultCpuMsPerRequest: 3,
      defaultResponseTimeMs: 80,
      defaultResponseBytes: 96 * 1024,
      defaultRpsPerVcpu: 120,
    }),
    cms_crud: profile({
      baseRssGiB: 0.75,
      defaultCpuMsPerRequest: 12,
      defaultResponseTimeMs: 180,
      defaultResponseBytes: 64 * 1024,
      defaultRpsPerVcpu: 28,
    }),
    api_saas: profile({
      baseRssGiB: 1,
      defaultCpuMsPerRequest: 10,
      defaultResponseTimeMs: 140,
      defaultResponseBytes: 48 * 1024,
      defaultRpsPerVcpu: 32,
    }),
    ecommerce_transactional: profile({
      baseRssGiB: 1.5,
      defaultCpuMsPerRequest: 18,
      defaultResponseTimeMs: 240,
      defaultResponseBytes: 96 * 1024,
      defaultRpsPerVcpu: 20,
    }),
    batch_worker: profile({
      baseRssGiB: 0.5,
      defaultDynamicRatio: 1,
      defaultEdgeCacheHitRatio: 0,
      defaultRpsPerVcpu: 1,
      batchDefaults: {
        averageJobDurationSeconds: 30,
        cpuSecondsPerJob: 8,
        memoryGiBPerConcurrentJob: 0.25,
        temporaryStorageGiBPerConcurrentJob: 0.5,
        storageReadGiBPerJob: 0.05,
        storageWriteGiBPerJob: 0.02,
        networkIngressGiBPerJob: 0.01,
        networkEgressGiBPerJob: 0.01,
      },
    }),
    custom: profile({}),
  },
  checksum: "fnv1a64:pending",
};

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function stableRuleChecksum(
  rules: Omit<ServerSizingRuleSet, "checksum">,
): string {
  const payload = stableJson(rules);
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(payload)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export function withRuleChecksum(
  rules: Omit<ServerSizingRuleSet, "checksum">,
): ServerSizingRuleSet {
  return { ...rules, checksum: stableRuleChecksum(rules) };
}

const { checksum, ...defaultRulesWithoutChecksum } =
  DEFAULT_SERVER_SIZING_RULE_SET;
void checksum;

export const PUBLISHED_SERVER_SIZING_RULE_SET = withRuleChecksum(
  defaultRulesWithoutChecksum,
);
