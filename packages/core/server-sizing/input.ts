export type WorkloadKind =
  | "static_content"
  | "cms_crud"
  | "api_saas"
  | "ecommerce_transactional"
  | "batch_worker"
  | "custom";

export type MeasurementEvidence =
  "unknown" | "estimated" | "synthetic" | "production";

export type ServerSizingInputV1 = {
  schemaVersion: 1;
  workload: { kind: WorkloadKind };
  traffic: {
    peakRps?: number;
    averageRps?: number;
    peakOriginRps?: number;
    dynamicRatio?: number;
    edgeCacheHitRatio?: number;
    burstFactor?: number;
    averageResponseTimeMs?: number;
    concurrentLongLivedSessions?: number;
    averageResponseBytes?: number;
    uploadMbps?: number;
  };
  batch?: {
    jobsPerWindow: number;
    completionWindowMinutes: number;
    averageJobDurationSeconds?: number;
    cpuSecondsPerJob?: number;
    memoryGiBPerConcurrentJob?: number;
    temporaryStorageGiBPerConcurrentJob?: number;
    storageReadGiBPerJob?: number;
    storageWriteGiBPerJob?: number;
    networkIngressGiBPerJob?: number;
    networkEgressGiBPerJob?: number;
    retryRate?: number;
    maxParallelism?: number;
  };
  measurements: {
    evidence: MeasurementEvidence;
    observedAt?: string;
    environmentMatchesProduction?: boolean;
    observedOriginRps?: number;
    testedVcpu?: number;
    cpuMsPerRequest?: number;
    peakAppRssGiB?: number;
    memoryPerInflightKiB?: number;
    testedBreakpointRps?: number;
    representativeDataset?: boolean;
  };
  data: {
    liveDataGiB: number;
    monthlyGrowthGiB?: number;
    horizonMonths: number;
    database?: "none" | "postgresql" | "mysql" | "other";
    peakDbConnections?: number;
    redisPeakRssGiB?: number;
  };
  reliability: {
    availabilityTargetBps?: number;
    rpoMinutes: number;
    rtoMinutes: number;
    failoverTestedAt?: string;
    restoreTestedAt?: string;
  };
  operations: {
    managedServicesAllowed: boolean;
    skill: "basic" | "advanced";
  };
};

export type NormalizedServerSizingInputV1 = ServerSizingInputV1 & {
  traffic: ServerSizingInputV1["traffic"] & {
    dynamicRatio: number;
    edgeCacheHitRatio: number;
    burstFactor: number;
  };
  data: ServerSizingInputV1["data"] & {
    monthlyGrowthGiB: number;
  };
  batch?: NonNullable<ServerSizingInputV1["batch"]> & {
    retryRate: number;
  };
};

export type InputIssue = {
  path: string;
  code: "invalid_type" | "out_of_range" | "invalid_value" | "missing";
  message: string;
};

const finiteNonNegativeFields = [
  "peakRps",
  "averageRps",
  "peakOriginRps",
  "burstFactor",
  "averageResponseTimeMs",
  "concurrentLongLivedSessions",
  "averageResponseBytes",
  "uploadMbps",
  "observedOriginRps",
  "testedVcpu",
  "cpuMsPerRequest",
  "peakAppRssGiB",
  "memoryPerInflightKiB",
  "testedBreakpointRps",
  "liveDataGiB",
  "monthlyGrowthGiB",
  "horizonMonths",
  "peakDbConnections",
  "redisPeakRssGiB",
  "rpoMinutes",
  "rtoMinutes",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function addNumberIssues(
  issues: InputIssue[],
  path: string,
  value: unknown,
  options: { min?: number; max?: number } = {},
) {
  if (value === undefined) return;
  if (!isFiniteNumber(value)) {
    issues.push({ path, code: "invalid_type", message: "必须是有限数字" });
    return;
  }
  if (options.min !== undefined && value < options.min) {
    issues.push({
      path,
      code: "out_of_range",
      message: `不能小于 ${options.min}`,
    });
  }
  if (options.max !== undefined && value > options.max) {
    issues.push({
      path,
      code: "out_of_range",
      message: `不能大于 ${options.max}`,
    });
  }
}

function pickNested(input: ServerSizingInputV1, path: string): unknown {
  const [section, field] = path.split(".");
  if (!section || !field) return undefined;
  const value = input[section as keyof ServerSizingInputV1];
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[field]
    : undefined;
}

export function validateServerSizingInput(
  input: ServerSizingInputV1,
): InputIssue[] {
  const issues: InputIssue[] = [];

  if (input.schemaVersion !== 1) {
    issues.push({
      path: "schemaVersion",
      code: "invalid_value",
      message: "只支持 schemaVersion 1",
    });
  }

  const allowedWorkloads: WorkloadKind[] = [
    "static_content",
    "cms_crud",
    "api_saas",
    "ecommerce_transactional",
    "batch_worker",
    "custom",
  ];
  if (!allowedWorkloads.includes(input.workload?.kind)) {
    issues.push({
      path: "workload.kind",
      code: "invalid_value",
      message: "不支持的工作负载类型",
    });
  }

  const dataFields = new Set([
    "liveDataGiB",
    "monthlyGrowthGiB",
    "horizonMonths",
    "peakDbConnections",
    "redisPeakRssGiB",
  ]);
  const measurementFields = new Set([
    "observedOriginRps",
    "testedVcpu",
    "cpuMsPerRequest",
    "peakAppRssGiB",
    "memoryPerInflightKiB",
    "testedBreakpointRps",
  ]);
  for (const field of finiteNonNegativeFields) {
    const path = dataFields.has(field)
      ? `data.${field}`
      : measurementFields.has(field)
        ? `measurements.${field}`
        : field === "rpoMinutes" || field === "rtoMinutes"
          ? `reliability.${field}`
          : `traffic.${field}`;
    addNumberIssues(issues, path, pickNested(input, path), { min: 0 });
  }

  const trafficRatios = [
    ["traffic.dynamicRatio", input.traffic?.dynamicRatio],
    ["traffic.edgeCacheHitRatio", input.traffic?.edgeCacheHitRatio],
  ] as const;
  for (const [path, value] of trafficRatios) {
    addNumberIssues(issues, path, value, { min: 0, max: 1 });
  }

  const batch = input.batch;
  if (input.workload?.kind === "batch_worker" && !batch) {
    issues.push({
      path: "batch",
      code: "missing",
      message: "batch_worker 必须提供批处理输入",
    });
  }
  if (input.workload?.kind !== "batch_worker" && batch) {
    issues.push({
      path: "batch",
      code: "invalid_value",
      message: "只有 batch_worker 可以提供批处理输入",
    });
  }
  if (batch) {
    for (const [path, value] of Object.entries(batch)) {
      addNumberIssues(issues, `batch.${path}`, value, { min: 0 });
    }
    addNumberIssues(issues, "batch.retryRate", batch.retryRate, {
      min: 0,
      max: 1,
    });
    if (batch.jobsPerWindow <= 0) {
      issues.push({
        path: "batch.jobsPerWindow",
        code: "out_of_range",
        message: "任务数必须大于 0",
      });
    }
    if (batch.completionWindowMinutes <= 0) {
      issues.push({
        path: "batch.completionWindowMinutes",
        code: "out_of_range",
        message: "完成窗口必须大于 0",
      });
    }
  }

  if (input.data?.horizonMonths === undefined) {
    issues.push({
      path: "data.horizonMonths",
      code: "missing",
      message: "必须提供规划周期",
    });
  }
  if (input.data?.liveDataGiB === undefined) {
    issues.push({
      path: "data.liveDataGiB",
      code: "missing",
      message: "必须提供在线数据量",
    });
  }

  const observedAt = input.measurements?.observedAt;
  if (observedAt && Number.isNaN(Date.parse(observedAt))) {
    issues.push({
      path: "measurements.observedAt",
      code: "invalid_value",
      message: "必须是有效的 ISO 日期",
    });
  }
  for (const field of ["failoverTestedAt", "restoreTestedAt"] as const) {
    const value = input.reliability?.[field];
    if (value && Number.isNaN(Date.parse(value))) {
      issues.push({
        path: `reliability.${field}`,
        code: "invalid_value",
        message: "必须是有效的 ISO 日期",
      });
    }
  }

  const availability = input.reliability?.availabilityTargetBps;
  addNumberIssues(issues, "reliability.availabilityTargetBps", availability, {
    min: 0,
    max: 10_000,
  });

  if (
    input.traffic?.peakOriginRps !== undefined &&
    input.traffic?.peakRps !== undefined &&
    input.traffic.peakOriginRps > input.traffic.peakRps
  ) {
    issues.push({
      path: "traffic.peakOriginRps",
      code: "invalid_value",
      message: "峰值源站 RPS 不能大于峰值总 RPS",
    });
  }

  return issues;
}

export function normalizeServerSizingInput(
  input: ServerSizingInputV1,
  defaults: {
    dynamicRatio: number;
    edgeCacheHitRatio: number;
    burstFactor: number;
  },
): NormalizedServerSizingInputV1 {
  const normalized = {
    ...input,
    traffic: {
      ...input.traffic,
      dynamicRatio: input.traffic.dynamicRatio ?? defaults.dynamicRatio,
      edgeCacheHitRatio:
        input.traffic.edgeCacheHitRatio ?? defaults.edgeCacheHitRatio,
      burstFactor: input.traffic.burstFactor ?? defaults.burstFactor,
    },
    data: {
      ...input.data,
      monthlyGrowthGiB: input.data.monthlyGrowthGiB ?? 0,
    },
    batch: input.batch
      ? {
          ...input.batch,
          retryRate: input.batch.retryRate ?? 0,
        }
      : undefined,
  } as NormalizedServerSizingInputV1;
  return normalized;
}
