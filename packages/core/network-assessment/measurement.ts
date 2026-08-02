export const NETWORK_MEASUREMENT_PROTOCOLS = [
  "icmp",
  "tcp",
  "tls",
  "http",
  "traceroute",
] as const;

export type NetworkMeasurementProtocol =
  (typeof NETWORK_MEASUREMENT_PROTOCOLS)[number];
export type NetworkMeasurementDirection = "forward" | "reverse";

export type NetworkMeasurementSampleInput = {
  targetRevisionId: number;
  probeRevisionId: number;
  direction: NetworkMeasurementDirection;
  protocol: NetworkMeasurementProtocol;
  observedAt: string;
  rttMs?: number | null;
  jitterMs?: number | null;
  packetLossBps?: number | null;
  throughputKbps?: number | null;
  ttfbMs?: number | null;
  pathHash?: string | null;
  qualityFlags?: string[];
};

export type NetworkMeasurementBatchInput = {
  version: 1;
  batchId: string;
  runId: number;
  runGeneration: number;
  samples: NetworkMeasurementSampleInput[];
};

export type MeasurementBatchIssue = {
  path: string;
  code:
    | "invalid_type"
    | "invalid_value"
    | "out_of_range"
    | "missing"
    | "too_many";
};

const MAX_BATCH_SAMPLES = 500;
const MAX_BATCH_ID_LENGTH = 160;
const MAX_PATH_HASH_LENGTH = 128;
const SAMPLE_KEYS = new Set([
  "targetRevisionId",
  "probeRevisionId",
  "direction",
  "protocol",
  "observedAt",
  "rttMs",
  "jitterMs",
  "packetLossBps",
  "throughputKbps",
  "ttfbMs",
  "pathHash",
  "qualityFlags",
]);
const BATCH_KEYS = new Set([
  "version",
  "batchId",
  "runId",
  "runGeneration",
  "samples",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addUnknownKeys(
  issues: MeasurementBatchIssue[],
  record: Record<string, unknown>,
  allowed: Set<string>,
  prefix: string,
) {
  Object.keys(record)
    .filter((key) => !allowed.has(key))
    .slice(0, 20)
    .forEach((key) => issues.push({ path: `${prefix}${key}`, code: "invalid_value" }));
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function optionalMetric(
  issues: MeasurementBatchIssue[],
  value: unknown,
  path: string,
  maximum?: number,
) {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, code: "invalid_type" });
    return;
  }
  if (value < 0 || (maximum !== undefined && value > maximum)) {
    issues.push({ path, code: "out_of_range" });
  }
}

function validateSample(
  value: unknown,
  index: number,
  issues: MeasurementBatchIssue[],
) {
  const path = `samples.${index}`;
  if (!isRecord(value)) {
    issues.push({ path, code: "invalid_type" });
    return;
  }
  addUnknownKeys(issues, value, SAMPLE_KEYS, `${path}.`);
  for (const key of ["targetRevisionId", "probeRevisionId"] as const) {
    if (!positiveInteger(value[key])) {
      issues.push({
        path: `${path}.${key}`,
        code: value[key] === undefined ? "missing" : "invalid_type",
      });
    }
  }
  if (value.direction !== "forward" && value.direction !== "reverse") {
    issues.push({ path: `${path}.direction`, code: "invalid_value" });
  }
  if (
    typeof value.protocol !== "string" ||
    !NETWORK_MEASUREMENT_PROTOCOLS.includes(
      value.protocol as NetworkMeasurementProtocol,
    )
  ) {
    issues.push({ path: `${path}.protocol`, code: "invalid_value" });
  }
  if (
    typeof value.observedAt !== "string" ||
    Number.isNaN(Date.parse(value.observedAt))
  ) {
    issues.push({ path: `${path}.observedAt`, code: "invalid_value" });
  }
  optionalMetric(issues, value.rttMs, `${path}.rttMs`);
  optionalMetric(issues, value.jitterMs, `${path}.jitterMs`);
  optionalMetric(issues, value.packetLossBps, `${path}.packetLossBps`, 10_000);
  optionalMetric(issues, value.throughputKbps, `${path}.throughputKbps`);
  optionalMetric(issues, value.ttfbMs, `${path}.ttfbMs`);
  if (
    value.pathHash !== undefined &&
    value.pathHash !== null &&
    (typeof value.pathHash !== "string" ||
      value.pathHash.length === 0 ||
      value.pathHash.length > MAX_PATH_HASH_LENGTH)
  ) {
    issues.push({ path: `${path}.pathHash`, code: "invalid_value" });
  }
  if (
    value.qualityFlags !== undefined &&
    (!Array.isArray(value.qualityFlags) ||
      value.qualityFlags.some((flag) => typeof flag !== "string"))
  ) {
    issues.push({ path: `${path}.qualityFlags`, code: "invalid_type" });
  }
}

export function validateMeasurementBatchPayload(
  value: unknown,
): MeasurementBatchIssue[] {
  const issues: MeasurementBatchIssue[] = [];
  if (!isRecord(value)) return [{ path: "body", code: "invalid_type" }];
  addUnknownKeys(issues, value, BATCH_KEYS, "");
  if (value.version !== 1) {
    issues.push({ path: "version", code: "invalid_value" });
  }
  if (
    typeof value.batchId !== "string" ||
    value.batchId.length === 0 ||
    value.batchId.length > MAX_BATCH_ID_LENGTH ||
    /[\r\n]/u.test(value.batchId)
  ) {
    issues.push({ path: "batchId", code: "invalid_value" });
  }
  if (!positiveInteger(value.runId)) {
    issues.push({
      path: "runId",
      code: value.runId === undefined ? "missing" : "invalid_type",
    });
  }
  if (!positiveInteger(value.runGeneration)) {
    issues.push({
      path: "runGeneration",
      code: value.runGeneration === undefined ? "missing" : "invalid_type",
    });
  }
  if (!Array.isArray(value.samples)) {
    issues.push({ path: "samples", code: "invalid_type" });
  } else {
    if (value.samples.length === 0) {
      issues.push({ path: "samples", code: "missing" });
    }
    if (value.samples.length > MAX_BATCH_SAMPLES) {
      issues.push({ path: "samples", code: "too_many" });
    }
    value.samples
      .slice(0, MAX_BATCH_SAMPLES)
      .forEach((sample, index) => validateSample(sample, index, issues));
  }
  return issues;
}

export function parseMeasurementBatchPayload(
  value: unknown,
): { value: NetworkMeasurementBatchInput; issues: [] } | {
  value: null;
  issues: MeasurementBatchIssue[];
} {
  const issues = validateMeasurementBatchPayload(value);
  if (issues.length > 0) return { value: null, issues };
  const record = value as Record<string, unknown>;
  const samples = record.samples as Array<Record<string, unknown>>;
  return {
    value: {
      version: 1,
      batchId: record.batchId as string,
      runId: record.runId as number,
      runGeneration: record.runGeneration as number,
      samples: samples.map((sample) => ({
        targetRevisionId: sample.targetRevisionId as number,
        probeRevisionId: sample.probeRevisionId as number,
        direction: sample.direction as NetworkMeasurementDirection,
        protocol: sample.protocol as NetworkMeasurementProtocol,
        observedAt: sample.observedAt as string,
        rttMs: (sample.rttMs as number | null | undefined) ?? null,
        jitterMs: (sample.jitterMs as number | null | undefined) ?? null,
        packetLossBps:
          (sample.packetLossBps as number | null | undefined) ?? null,
        throughputKbps:
          (sample.throughputKbps as number | null | undefined) ?? null,
        ttfbMs: (sample.ttfbMs as number | null | undefined) ?? null,
        pathHash: (sample.pathHash as string | null | undefined) ?? null,
        qualityFlags: Array.isArray(sample.qualityFlags)
          ? sample.qualityFlags.filter(
              (flag): flag is string => typeof flag === "string",
            )
          : [],
      })),
    },
    issues: [],
  };
}
