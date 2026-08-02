import { createHash } from "node:crypto";

import { and, asc, eq, gte, lt } from "drizzle-orm";

import { db } from "@fwqgo/db";
import {
  networkMeasurementRollups,
  networkMeasurementCampaigns,
  networkMeasurementRuns,
  networkMeasurementProbeRevisions,
  networkMeasurementProbes,
  networkMeasurementSamples,
  networkMeasurementTargets,
  networkMeasurementTargetRevisions,
  networkLineCandidates,
} from "@fwqgo/db/schema";

export const NETWORK_ROLLUP_SCHEMA_VERSION = 1 as const;

export type NetworkRollupWindowKind = "hour" | "day" | "campaign";

export type NetworkRollupSample = {
  id?: number;
  probeRevisionId: number;
  targetRevisionId: number;
  observedAt: Date;
  rttMs?: number | null;
  jitterMs?: number | null;
  packetLossBps?: number | null;
  throughputKbps?: number | null;
  ttfbMs?: number | null;
  qualityFlags?: string[];
};

export type NetworkCampaignRollupSample = NetworkRollupSample & {
  campaignRevisionId: number;
  countryCode: string | null;
  regionCode: string;
  carrier: string;
  accessType: string;
  direction: string;
  protocol: string;
  addressFamily: string;
  targetPrefix: string;
  port: number | null;
};

export type NetworkRollupInput = {
  candidateId: number;
  targetRevisionId?: number | null;
  probeRevisionId?: number | null;
  campaignRevisionId?: number | null;
  windowKind: NetworkRollupWindowKind;
  windowStart: Date;
  windowEnd: Date;
  dimensionJson: Record<string, unknown>;
  samples: NetworkRollupSample[];
  rollupSchemaVersion?: number;
};

export type NetworkMetricDistribution = {
  count: number;
  min: number | null;
  max: number | null;
  sum: number;
};

export type NetworkRollupResult = {
  sampleCount: number;
  probeCount: number;
  distribution: Record<string, NetworkMetricDistribution>;
  percentiles: Record<string, Record<"p50" | "p95" | "p99", number | null>>;
  inputHash: string;
};

const metricNames = [
  "rttMs",
  "jitterMs",
  "packetLossBps",
  "throughputKbps",
  "ttfbMs",
] as const;

type MetricName = (typeof metricNames)[number];

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function finiteMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function percentile(sorted: number[], fraction: number) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? null;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

function metricValues(samples: NetworkRollupSample[], name: MetricName) {
  return samples
    .map((sample) => finiteMetric(sample[name]))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
}

function distribution(values: number[]): NetworkMetricDistribution {
  return {
    count: values.length,
    min: values[0] ?? null,
    max: values.at(-1) ?? null,
    sum: values.reduce((total, value) => total + value, 0),
  };
}

export function aggregateNetworkMeasurementSamples(
  input: Pick<NetworkRollupInput, "samples" | "dimensionJson" | "windowStart" | "windowEnd" | "candidateId" | "targetRevisionId" | "probeRevisionId" | "campaignRevisionId" | "windowKind">,
): NetworkRollupResult {
  if (!Number.isSafeInteger(input.candidateId) || input.candidateId <= 0) {
    throw new Error("candidateId 无效");
  }
  if (input.windowEnd <= input.windowStart) {
    throw new Error("rollup 时间窗口必须正向");
  }
  if (input.samples.length === 0) {
    throw new Error("rollup 至少需要一条样本");
  }
  const normalizedSamples = input.samples.map((sample) => ({
    id: sample.id ?? null,
    probeRevisionId: sample.probeRevisionId,
    targetRevisionId: sample.targetRevisionId,
    observedAt: sample.observedAt.toISOString(),
    rttMs: finiteMetric(sample.rttMs),
    jitterMs: finiteMetric(sample.jitterMs),
    packetLossBps: finiteMetric(sample.packetLossBps),
    throughputKbps: finiteMetric(sample.throughputKbps),
    ttfbMs: finiteMetric(sample.ttfbMs),
    qualityFlags: [...new Set(sample.qualityFlags ?? [])].sort(),
  }));
  const distributionJson = Object.fromEntries(
    metricNames.map((name) => [name, distribution(metricValues(input.samples, name))]),
  );
  const percentileJson = Object.fromEntries(
    metricNames.map((name) => {
      const values = metricValues(input.samples, name);
      return [
        name,
        {
          p50: percentile(values, 0.5),
          p95: percentile(values, 0.95),
          p99: percentile(values, 0.99),
        },
      ];
    }),
  );
  const hashInput = {
    schemaVersion: NETWORK_ROLLUP_SCHEMA_VERSION,
    candidateId: input.candidateId,
    targetRevisionId: input.targetRevisionId ?? null,
    probeRevisionId: input.probeRevisionId ?? null,
    campaignRevisionId: input.campaignRevisionId ?? null,
    windowKind: input.windowKind,
    windowStart: input.windowStart.toISOString(),
    windowEnd: input.windowEnd.toISOString(),
    dimensionJson: input.dimensionJson,
    samples: normalizedSamples.sort((left, right) =>
      `${left.observedAt}:${left.probeRevisionId}:${left.targetRevisionId}`.localeCompare(
        `${right.observedAt}:${right.probeRevisionId}:${right.targetRevisionId}`,
      ),
    ),
  };
  return {
    sampleCount: input.samples.length,
    probeCount: new Set(input.samples.map((sample) => sample.probeRevisionId)).size,
    distribution: distributionJson,
    percentiles: percentileJson,
    inputHash: `sha256:${createHash("sha256").update(stableJson(hashInput)).digest("hex")}`,
  };
}

export async function createNetworkMeasurementRollup(input: NetworkRollupInput) {
  const rollupSchemaVersion = input.rollupSchemaVersion ?? NETWORK_ROLLUP_SCHEMA_VERSION;
  if (rollupSchemaVersion !== NETWORK_ROLLUP_SCHEMA_VERSION) {
    throw new Error("不支持的 rollup schema version");
  }
  const aggregate = aggregateNetworkMeasurementSamples(input);
  const [created] = await db
    .insert(networkMeasurementRollups)
    .values({
      candidateId: input.candidateId,
      targetRevisionId: input.targetRevisionId ?? null,
      probeRevisionId: input.probeRevisionId ?? null,
      campaignRevisionId: input.campaignRevisionId ?? null,
      windowKind: input.windowKind,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      dimensionJson: input.dimensionJson,
      sampleCount: aggregate.sampleCount,
      probeCount: aggregate.probeCount,
      distributionJson: aggregate.distribution,
      percentileJson: aggregate.percentiles,
      rollupSchemaVersion,
      inputHash: aggregate.inputHash,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(networkMeasurementRollups)
    .where(eq(networkMeasurementRollups.inputHash, aggregate.inputHash))
    .limit(1);
  if (!existing) throw new Error("rollup 幂等读取失败");
  return existing;
}

export async function loadMeasurementSamplesForRollup(input: {
  candidateId: number;
  targetRevisionId: number;
  probeRevisionId?: number;
  windowStart: Date;
  windowEnd: Date;
}) {
  const conditions = [
    eq(networkMeasurementSamples.targetRevisionId, input.targetRevisionId),
    gte(networkMeasurementSamples.observedAt, input.windowStart),
    lt(networkMeasurementSamples.observedAt, input.windowEnd),
  ];
  if (input.probeRevisionId) {
    conditions.push(eq(networkMeasurementSamples.probeRevisionId, input.probeRevisionId));
  }
  return db
    .select({
      id: networkMeasurementSamples.id,
      probeRevisionId: networkMeasurementSamples.probeRevisionId,
      targetRevisionId: networkMeasurementSamples.targetRevisionId,
      observedAt: networkMeasurementSamples.observedAt,
      rttMs: networkMeasurementSamples.rttMs,
      jitterMs: networkMeasurementSamples.jitterMs,
      packetLossBps: networkMeasurementSamples.packetLossBps,
      throughputKbps: networkMeasurementSamples.throughputKbps,
      ttfbMs: networkMeasurementSamples.ttfbMs,
      qualityFlags: networkMeasurementSamples.qualityFlags,
    })
    .from(networkMeasurementSamples)
    .innerJoin(
      networkMeasurementTargetRevisions,
      eq(
        networkMeasurementTargetRevisions.id,
        networkMeasurementSamples.targetRevisionId,
      ),
    )
    .innerJoin(
      networkMeasurementTargets,
      eq(networkMeasurementTargets.id, networkMeasurementTargetRevisions.targetId),
    )
    .innerJoin(
      networkLineCandidates,
      eq(networkLineCandidates.id, networkMeasurementTargets.candidateId),
    )
    .where(and(eq(networkLineCandidates.id, input.candidateId), ...conditions))
    .limit(10_000);
}

const MAX_CAMPAIGN_ROLLUP_SAMPLES = 50_000;

/**
 * Loads only completed-run samples for one UTC window. The query deliberately
 * returns probe/target dimensions needed for carrier and direction cells, but
 * never returns a target address to the rollup payload.
 */
export async function loadMeasurementSamplesForCampaignRollup(input: {
  campaignId: number;
  windowStart: Date;
  windowEnd: Date;
}) {
  if (!Number.isSafeInteger(input.campaignId) || input.campaignId <= 0) {
    throw new Error("campaignId 无效");
  }
  const [campaign] = await db
    .select({
      id: networkMeasurementCampaigns.id,
      candidateId: networkMeasurementCampaigns.candidateId,
    })
    .from(networkMeasurementCampaigns)
    .where(eq(networkMeasurementCampaigns.id, input.campaignId))
    .limit(1);
  if (!campaign) throw new Error("测量活动不存在");

  const rows = await db
    .select({
      id: networkMeasurementSamples.id,
      probeRevisionId: networkMeasurementSamples.probeRevisionId,
      targetRevisionId: networkMeasurementSamples.targetRevisionId,
      observedAt: networkMeasurementSamples.observedAt,
      rttMs: networkMeasurementSamples.rttMs,
      jitterMs: networkMeasurementSamples.jitterMs,
      packetLossBps: networkMeasurementSamples.packetLossBps,
      throughputKbps: networkMeasurementSamples.throughputKbps,
      ttfbMs: networkMeasurementSamples.ttfbMs,
      qualityFlags: networkMeasurementSamples.qualityFlags,
      campaignRevisionId: networkMeasurementRuns.campaignRevisionId,
      countryCode: networkMeasurementProbeRevisions.countryCode,
      regionCode: networkMeasurementProbeRevisions.regionCode,
      carrier: networkMeasurementProbeRevisions.carrier,
      accessType: networkMeasurementProbeRevisions.accessType,
      direction: networkMeasurementSamples.direction,
      protocol: networkMeasurementSamples.protocol,
      addressFamily: networkMeasurementTargetRevisions.addressFamily,
      targetPrefix: networkMeasurementTargetRevisions.targetPrefix,
      port: networkMeasurementTargetRevisions.port,
    })
    .from(networkMeasurementSamples)
    .innerJoin(
      networkMeasurementRuns,
      eq(networkMeasurementRuns.id, networkMeasurementSamples.runId),
    )
    .innerJoin(
      networkMeasurementCampaigns,
      eq(networkMeasurementCampaigns.id, networkMeasurementRuns.campaignId),
    )
    .innerJoin(
      networkMeasurementProbeRevisions,
      eq(
        networkMeasurementProbeRevisions.id,
        networkMeasurementSamples.probeRevisionId,
      ),
    )
    .innerJoin(
      networkMeasurementProbes,
      eq(networkMeasurementProbes.id, networkMeasurementProbeRevisions.probeId),
    )
    .innerJoin(
      networkMeasurementTargetRevisions,
      eq(
        networkMeasurementTargetRevisions.id,
        networkMeasurementSamples.targetRevisionId,
      ),
    )
    .innerJoin(
      networkMeasurementTargets,
      eq(networkMeasurementTargets.id, networkMeasurementTargetRevisions.targetId),
    )
    .where(
      and(
        eq(networkMeasurementCampaigns.id, campaign.id),
        eq(networkMeasurementRuns.status, "succeeded"),
        gte(networkMeasurementSamples.observedAt, input.windowStart),
        lt(networkMeasurementSamples.observedAt, input.windowEnd),
      ),
    )
    .orderBy(asc(networkMeasurementSamples.observedAt), asc(networkMeasurementSamples.id))
    .limit(MAX_CAMPAIGN_ROLLUP_SAMPLES + 1);

  if (rows.length > MAX_CAMPAIGN_ROLLUP_SAMPLES) {
    throw new Error("rollup 样本超过单窗口上限，请缩小窗口或分批处理");
  }
  return { campaign, rows };
}

function campaignRollupDimension(sample: NetworkCampaignRollupSample) {
  return {
    countryCode: sample.countryCode,
    regionCode: sample.regionCode,
    carrier: sample.carrier,
    accessType: sample.accessType,
    direction: sample.direction,
    protocol: sample.protocol,
    addressFamily: sample.addressFamily,
    targetPrefix: sample.targetPrefix,
    port: sample.port,
  };
}

export async function rollupNetworkMeasurementCampaignWindow(input: {
  campaignId: number;
  windowStart: Date;
  windowEnd: Date;
}) {
  if (input.windowEnd <= input.windowStart) {
    throw new Error("rollup 时间窗口必须正向");
  }
  const { campaign, rows } = await loadMeasurementSamplesForCampaignRollup(input);
  const groups = new Map<
    string,
    {
      campaignRevisionId: number;
      dimensionJson: Record<string, unknown>;
      samples: NetworkRollupSample[];
    }
  >();

  for (const row of rows) {
    const sample = row as NetworkCampaignRollupSample;
    const dimensionJson = campaignRollupDimension(sample);
    const key = `${sample.campaignRevisionId}:${stableJson(dimensionJson)}`;
    const group = groups.get(key);
    const rollupSample: NetworkRollupSample = {
      id: sample.id,
      probeRevisionId: sample.probeRevisionId,
      targetRevisionId: sample.targetRevisionId,
      observedAt: sample.observedAt,
      rttMs: sample.rttMs,
      jitterMs: sample.jitterMs,
      packetLossBps: sample.packetLossBps,
      throughputKbps: sample.throughputKbps,
      ttfbMs: sample.ttfbMs,
      qualityFlags: sample.qualityFlags,
    };
    if (group) {
      group.samples.push(rollupSample);
      continue;
    }
    groups.set(key, {
      campaignRevisionId: sample.campaignRevisionId,
      dimensionJson,
      samples: [rollupSample],
    });
  }

  const rollups = [];
  for (const group of groups.values()) {
    rollups.push(
      await createNetworkMeasurementRollup({
        candidateId: campaign.candidateId,
        campaignRevisionId: group.campaignRevisionId,
        windowKind: "hour",
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        dimensionJson: group.dimensionJson,
        samples: group.samples,
      }),
    );
  }
  return {
    campaignId: input.campaignId,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    sampleCount: rows.length,
    rollupCount: rollups.length,
    rollups,
  };
}
