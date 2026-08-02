import {
  normalizeServerSizingInput,
  validateServerSizingInput,
  type NormalizedServerSizingInputV1,
  type ServerSizingInputV1,
} from "./input";
import {
  PUBLISHED_SERVER_SIZING_RULE_SET,
  SERVER_SIZING_ENGINE_VERSION,
  type ServerSizingRuleSet,
  type WorkloadProfile,
} from "./rules";

export type SizingConfidence = "baseline" | "calibrated" | "validated";

export type Reason = {
  code: string;
  params?: Record<string, number | string | boolean>;
};

export type FormulaTrace = {
  formulaId: string;
  inputs: Record<string, number | string | boolean | null>;
  outputs: Record<string, number | string | boolean | null>;
  assumptions: string[];
};

export type SizingPlan = {
  replicas: number;
  vcpu: { min: number; max: number };
  memoryGiB: { min: number; max: number };
  primaryStorageGiB: { min: number; max: number };
  backupStorageGiB: { min: number; max: number };
  networkMbps: { ingress: number; egress: number };
  databaseConnections: number | null;
  topology: string[];
  confidence: SizingConfidence;
  assumptions: Reason[];
};

export type ServerSizingResultV1 = {
  status:
    | "ok"
    | "range_only"
    | "constraint_unsatisfied"
    | "unsupported"
    | "rule_unavailable"
    | "invalid_input";
  versions: {
    engineVersion: string;
    schemaVersion: 1;
    ruleSetVersion: string;
    ruleChecksum: string;
  };
  normalizedInput: NormalizedServerSizingInputV1 | null;
  start?: SizingPlan;
  recommended?: SizingPlan;
  ha?: SizingPlan;
  bottlenecks: Reason[];
  scalingTriggers: Reason[];
  assumptions: Reason[];
  warnings: Reason[];
  missingEvidence: Reason[];
  verificationChecklist: Reason[];
  recoveryChecklist: Reason[];
  trace: FormulaTrace[];
  unsupportedReasons: Reason[];
};

const roundUp = (value: number, step: number) =>
  Math.max(step, Math.ceil(value / step) * step);

function confidenceFor(input: NormalizedServerSizingInputV1): SizingConfidence {
  if (
    input.measurements.evidence === "production" &&
    input.measurements.environmentMatchesProduction &&
    input.reliability.failoverTestedAt &&
    input.reliability.restoreTestedAt
  ) {
    return "validated";
  }
  if (
    input.measurements.evidence === "synthetic" &&
    input.measurements.representativeDataset
  ) {
    return "calibrated";
  }
  return "baseline";
}

function createPlan(
  input: NormalizedServerSizingInputV1,
  values: {
    vcpu: number;
    memoryGiB: number;
    storageGiB: number;
    backupGiB: number;
    ingressMbps: number;
    egressMbps: number;
    replicas: number;
    topology: string[];
    confidence: SizingConfidence;
  },
): SizingPlan {
  const rangeFactor =
    values.confidence === "validated"
      ? 1.1
      : values.confidence === "calibrated"
        ? 1.25
        : 1.6;
  const dbConnections = input.data.peakDbConnections ?? null;
  return {
    replicas: values.replicas,
    vcpu: {
      min: roundUp(values.vcpu, 0.25),
      max: roundUp(values.vcpu * rangeFactor, 0.25),
    },
    memoryGiB: {
      min: roundUp(values.memoryGiB, 0.25),
      max: roundUp(values.memoryGiB * rangeFactor, 0.25),
    },
    primaryStorageGiB: {
      min: roundUp(values.storageGiB, 5),
      max: roundUp(values.storageGiB * rangeFactor, 5),
    },
    backupStorageGiB: {
      min: roundUp(values.backupGiB, 5),
      max: roundUp(values.backupGiB * rangeFactor, 5),
    },
    networkMbps: {
      ingress: roundUp(values.ingressMbps, 1),
      egress: roundUp(values.egressMbps, 1),
    },
    databaseConnections: dbConnections,
    topology: values.topology,
    confidence: values.confidence,
    assumptions: [],
  };
}

function commonTrace(
  id: string,
  inputs: FormulaTrace["inputs"],
  outputs: FormulaTrace["outputs"],
  assumptions: string[] = [],
): FormulaTrace {
  return { formulaId: id, inputs, outputs, assumptions };
}

function profileFor(
  input: Pick<ServerSizingInputV1, "workload">,
  rules: ServerSizingRuleSet,
): WorkloadProfile {
  return rules.profiles[input.workload.kind];
}

function baseResult(rules: ServerSizingRuleSet): ServerSizingResultV1 {
  return {
    status: "ok",
    versions: {
      engineVersion: SERVER_SIZING_ENGINE_VERSION,
      schemaVersion: 1,
      ruleSetVersion: rules.versionLabel,
      ruleChecksum: rules.checksum,
    },
    normalizedInput: null,
    bottlenecks: [],
    scalingTriggers: [],
    assumptions: [],
    warnings: [],
    missingEvidence: [],
    verificationChecklist: [],
    recoveryChecklist: [],
    trace: [],
    unsupportedReasons: [],
  };
}

function buildBatchResult(
  input: NormalizedServerSizingInputV1,
  rules: ServerSizingRuleSet,
  result: ServerSizingResultV1,
  profile: WorkloadProfile,
) {
  const batch = input.batch;
  const defaults = profile.batchDefaults;
  if (!batch || !defaults) return;

  const retryRate = batch.retryRate;
  const jobs = batch.jobsPerWindow * (1 + retryRate);
  const deadlineSeconds = batch.completionWindowMinutes * 60;
  const duration =
    batch.averageJobDurationSeconds ?? defaults.averageJobDurationSeconds;
  const cpuSeconds = batch.cpuSecondsPerJob ?? defaults.cpuSecondsPerJob;
  const memory =
    batch.memoryGiBPerConcurrentJob ?? defaults.memoryGiBPerConcurrentJob;
  const temporaryStorage =
    batch.temporaryStorageGiBPerConcurrentJob ??
    defaults.temporaryStorageGiBPerConcurrentJob;
  const storageRead =
    batch.storageReadGiBPerJob ?? defaults.storageReadGiBPerJob;
  const storageWrite =
    batch.storageWriteGiBPerJob ?? defaults.storageWriteGiBPerJob;
  const networkIngress =
    batch.networkIngressGiBPerJob ?? defaults.networkIngressGiBPerJob;
  const networkEgress =
    batch.networkEgressGiBPerJob ?? defaults.networkEgressGiBPerJob;
  const startRate = jobs / deadlineSeconds;
  const parallelism = Math.max(
    1,
    Math.ceil((startRate * duration) / rules.targetWorkerUtilization),
  );
  const vcpu =
    (jobs * cpuSeconds) / deadlineSeconds / rules.targetCpuUtilization +
    rules.backgroundCpu;
  const memoryGiB =
    (profile.baseRssGiB + parallelism * memory) / rules.targetMemoryUtilization;
  const temporaryStorageGiB =
    (parallelism * temporaryStorage) / rules.targetDiskUtilization;
  const storageIoMiBps =
    (jobs * (storageRead + storageWrite) * 1024) /
    deadlineSeconds /
    rules.targetStorageIoUtilization;
  const ingressMbps =
    (jobs * networkIngress * 8 * 1024 ** 3) /
    deadlineSeconds /
    1_000_000 /
    rules.targetNetworkUtilization;
  const egressMbps =
    (jobs * networkEgress * 8 * 1024 ** 3) /
    deadlineSeconds /
    1_000_000 /
    rules.targetNetworkUtilization;
  result.trace.push(
    commonTrace(
      "batch-parallelism-v1",
      { jobs, deadlineSeconds, duration },
      { startRate, parallelism },
    ),
    commonTrace(
      "batch-cpu-demand-v1",
      { jobs, cpuSeconds, deadlineSeconds },
      { vcpu },
    ),
    commonTrace("batch-memory-v1", { parallelism, memory }, { memoryGiB }),
    commonTrace(
      "batch-temporary-storage-v1",
      { parallelism, temporaryStorage },
      { temporaryStorageGiB },
    ),
    commonTrace(
      "batch-storage-io-v1",
      { jobs, storageRead, storageWrite, deadlineSeconds },
      { storageIoMiBps },
    ),
    commonTrace(
      "batch-network-v1",
      { jobs, networkIngress, networkEgress, deadlineSeconds },
      { ingressMbps, egressMbps },
    ),
  );
  result.assumptions.push(
    { code: "batch_retry_rate_normalized", params: { retryRate } },
    {
      code: "batch_profile_defaults_allowed",
      params: { evidence: input.measurements.evidence },
    },
  );

  if (
    batch.maxParallelism !== undefined &&
    parallelism > batch.maxParallelism
  ) {
    result.status = "constraint_unsatisfied";
    result.warnings.push({
      code: "batch_parallelism_limit_exceeded",
      params: {
        requiredParallelism: parallelism,
        maxParallelism: batch.maxParallelism,
      },
    });
  }

  const confidence = confidenceFor(input);
  const storageGiB =
    input.data.liveDataGiB +
    input.data.monthlyGrowthGiB * input.data.horizonMonths;
  const recommended = createPlan(input, {
    vcpu,
    memoryGiB,
    storageGiB: Math.max(storageGiB, temporaryStorageGiB + 10),
    backupGiB: Math.max(storageGiB * 2, 20),
    ingressMbps,
    egressMbps,
    replicas: Math.max(
      1,
      Math.ceil(parallelism / (batch.maxParallelism ?? parallelism)),
    ),
    topology: ["batch worker pool", "独立备份介质"],
    confidence,
  });
  result.start = recommended;
  result.recommended = recommended;
  result.ha = createPlan(input, {
    vcpu: vcpu * 2,
    memoryGiB: memoryGiB * 1.5,
    storageGiB: Math.max(storageGiB, temporaryStorageGiB + 10),
    backupGiB: Math.max(storageGiB * 3, 30),
    ingressMbps,
    egressMbps,
    replicas: Math.max(2, recommended.replicas + 1),
    topology: ["双 worker pool", "独立备份介质", "恢复演练"],
    confidence,
  });
  if (
    batch.averageJobDurationSeconds === undefined ||
    batch.cpuSecondsPerJob === undefined ||
    batch.memoryGiBPerConcurrentJob === undefined
  ) {
    result.status =
      result.status === "constraint_unsatisfied" ? result.status : "range_only";
    result.missingEvidence.push({ code: "batch_per_job_measurement_missing" });
  }
  result.bottlenecks.push(
    { code: "batch_parallelism" },
    { code: "batch_storage_io" },
  );
}

export function calculateServerSizing(
  input: ServerSizingInputV1,
  rules: ServerSizingRuleSet = PUBLISHED_SERVER_SIZING_RULE_SET,
  now = new Date(),
): ServerSizingResultV1 {
  const result = baseResult(rules);
  const issues = validateServerSizingInput(input);
  if (issues.length > 0) {
    result.status = "invalid_input";
    result.unsupportedReasons = issues.map((issue) => ({
      code: `input_${issue.code}`,
      params: { path: issue.path, message: issue.message },
    }));
    return result;
  }
  if (
    rules.status !== "published" ||
    (rules.validUntil && new Date(rules.validUntil).getTime() <= now.getTime())
  ) {
    result.status = "rule_unavailable";
    result.unsupportedReasons.push({ code: "rule_not_current" });
    return result;
  }

  const profile = profileFor(input, rules);
  const normalized = normalizeServerSizingInput(input, {
    dynamicRatio: profile.defaultDynamicRatio,
    edgeCacheHitRatio: profile.defaultEdgeCacheHitRatio,
    burstFactor: profile.defaultBurstFactor,
  });
  result.normalizedInput = normalized;

  if (normalized.workload.kind === "batch_worker") {
    buildBatchResult(normalized, rules, result, profile);
    result.verificationChecklist.push(
      { code: "run_representative_batch_load" },
      { code: "verify_completion_window" },
      { code: "test_restore_from_independent_backup" },
    );
    result.recoveryChecklist.push(
      { code: "replay_failed_batch_idempotently" },
      { code: "verify_dead_letter_path" },
    );
    return result;
  }

  const traffic = normalized.traffic;
  const peakTotalRps =
    traffic.peakOriginRps ??
    traffic.peakRps ??
    (traffic.averageRps ?? 0) * traffic.burstFactor;
  const originRps =
    traffic.peakOriginRps ??
    peakTotalRps *
      (traffic.dynamicRatio +
        (1 - traffic.dynamicRatio) * (1 - traffic.edgeCacheHitRatio));
  const responseTimeMs =
    traffic.averageResponseTimeMs ?? profile.defaultResponseTimeMs;
  const responseBytes =
    traffic.averageResponseBytes ?? profile.defaultResponseBytes;
  const cpuMsPerRequest =
    normalized.measurements.cpuMsPerRequest ?? profile.defaultCpuMsPerRequest;
  const inflight = (originRps * responseTimeMs) / 1000;
  const cpuDemand = (originRps * cpuMsPerRequest) / 1000;
  const vcpu = cpuDemand / rules.targetCpuUtilization + rules.backgroundCpu;
  const requestMemoryGiB =
    (inflight * (normalized.measurements.memoryPerInflightKiB ?? 32)) /
    1_048_576;
  const appWorkingMemoryGiB =
    normalized.measurements.peakAppRssGiB ??
    profile.baseRssGiB + requestMemoryGiB + profile.workerReserveGiB;
  const memoryGiB = appWorkingMemoryGiB / rules.targetMemoryUtilization;
  const egressMbps =
    (originRps * responseBytes * 8) /
    1_000_000 /
    rules.targetNetworkUtilization;
  const ingressMbps =
    (traffic.uploadMbps ?? 0) / rules.targetNetworkUtilization;
  const projectedLiveData =
    normalized.data.liveDataGiB +
    normalized.data.monthlyGrowthGiB * normalized.data.horizonMonths;
  const storageGiB =
    (projectedLiveData * 1.25 + 5 + 5 + 5) / rules.targetDiskUtilization;
  const backupGiB = Math.max(projectedLiveData * 2, 20);
  const safeRpsPerReplica =
    (normalized.measurements.testedBreakpointRps ??
      profile.defaultRpsPerVcpu * Math.max(vcpu, 1)) * rules.safeCapacityFactor;
  const recommendedReplicas = Math.max(
    1,
    Math.ceil(originRps / Math.max(safeRpsPerReplica, 1)),
  );
  const availability = normalized.reliability.availabilityTargetBps ?? 0;
  const requiredHa =
    availability >= 9_990 || normalized.reliability.rtoMinutes <= 60;
  const confidence = confidenceFor(normalized);

  result.trace.push(
    commonTrace(
      "peak-origin-rps-v1",
      {
        peakTotalRps,
        dynamicRatio: traffic.dynamicRatio,
        edgeCacheHitRatio: traffic.edgeCacheHitRatio,
      },
      { originRps },
    ),
    commonTrace(
      "inflight-at-peak-v1",
      { originRps, responseTimeMs },
      { inflight },
    ),
    commonTrace(
      "cpu-demand-v1",
      { originRps, cpuMsPerRequest },
      { cpuDemand, vcpu },
    ),
    commonTrace(
      "request-memory-v1",
      {
        inflight,
        memoryPerInflightKiB:
          normalized.measurements.memoryPerInflightKiB ?? 32,
      },
      { requestMemoryGiB, memoryGiB },
    ),
    commonTrace(
      "egress-demand-v1",
      { originRps, responseBytes },
      { egressMbps },
    ),
    commonTrace(
      "ingress-demand-v1",
      { uploadMbps: traffic.uploadMbps ?? 0 },
      { ingressMbps },
    ),
    commonTrace(
      "safe-replica-capacity-v1",
      { originRps, safeRpsPerReplica },
      { replicas: recommendedReplicas },
    ),
    commonTrace(
      "storage-horizon-v1",
      { projectedLiveData },
      { storageGiB, backupGiB },
    ),
  );

  result.assumptions.push(
    {
      code: "profile_defaults_used",
      params: { workload: normalized.workload.kind },
    },
    { code: "backup_is_separate_capacity", params: { backupGiB } },
  );
  if (
    normalized.measurements.cpuMsPerRequest === undefined &&
    normalized.measurements.testedBreakpointRps === undefined
  ) {
    result.status = "range_only";
    result.missingEvidence.push({ code: "cpu_measurement_missing" });
  }
  if (
    normalized.measurements.peakAppRssGiB === undefined &&
    normalized.measurements.memoryPerInflightKiB === undefined
  ) {
    result.status = "range_only";
    result.missingEvidence.push({ code: "memory_measurement_missing" });
  }
  if (traffic.averageResponseBytes === undefined) {
    result.status = "range_only";
    result.missingEvidence.push({ code: "response_size_measurement_missing" });
  }

  const start = createPlan(normalized, {
    vcpu: Math.max(vcpu, 0.5),
    memoryGiB: Math.max(memoryGiB, profile.baseRssGiB),
    storageGiB,
    backupGiB,
    ingressMbps,
    egressMbps,
    replicas: 1,
    topology: [
      "单应用实例",
      normalized.data.database && normalized.data.database !== "none"
        ? "独立数据库或托管数据库"
        : "无独立数据库",
    ],
    confidence,
  });
  const recommended = createPlan(normalized, {
    vcpu: Math.max(vcpu * 1.25, 1),
    memoryGiB: Math.max(memoryGiB * 1.2, 1),
    storageGiB,
    backupGiB,
    ingressMbps,
    egressMbps,
    replicas: recommendedReplicas,
    topology: [
      "应用实例池",
      "独立备份介质",
      ...(normalized.data.database && normalized.data.database !== "none"
        ? ["数据库连接上限与慢查询监控"]
        : []),
    ],
    confidence,
  });
  const ha = createPlan(normalized, {
    vcpu: Math.max(vcpu * 1.5, 1),
    memoryGiB: Math.max(memoryGiB * 1.35, 1),
    storageGiB,
    backupGiB: Math.max(backupGiB * 1.5, 30),
    ingressMbps,
    egressMbps,
    replicas: Math.max(
      requiredHa ? 2 : recommendedReplicas,
      recommendedReplicas + (requiredHa ? 1 : 0),
    ),
    topology: [
      "多副本应用",
      "健康检查/负载均衡",
      "独立备份介质",
      "故障切换与恢复演练",
    ],
    confidence,
  });
  result.start = start;
  result.recommended = recommended;
  result.ha = ha;
  result.bottlenecks.push(
    { code: cpuDemand >= memoryGiB * 10 ? "cpu" : "memory" },
    ...(normalized.data.database && normalized.data.database !== "none"
      ? [{ code: "database_connections" }]
      : []),
  );
  result.scalingTriggers.push(
    { code: "cpu_utilization_sustained", params: { threshold: 0.7 } },
    { code: "memory_utilization_sustained", params: { threshold: 0.75 } },
    { code: "response_time_slo_breach" },
    { code: "backup_restore_window_breach" },
  );
  result.verificationChecklist.push(
    { code: "run_representative_load_test" },
    { code: "verify_database_restore" },
    { code: "verify_peak_network_capacity" },
  );
  result.recoveryChecklist.push(
    { code: "test_failover" },
    { code: "test_restore_from_independent_backup" },
  );
  return result;
}
