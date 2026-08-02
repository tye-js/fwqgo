import type {
  NetworkMeasurementProtocol,
  NetworkMeasurementSampleInput,
} from "@fwqgo/core/network-assessment";

export type AgentMeasurementTarget = {
  targetRevisionId: number;
  targetAddress: string;
  port: number | null;
};

export type MeasurementAdapter = (
  protocol: NetworkMeasurementProtocol,
  target: AgentMeasurementTarget,
) => Promise<
  Pick<
    NetworkMeasurementSampleInput,
    "rttMs" | "jitterMs" | "packetLossBps" | "throughputKbps" | "ttfbMs" | "pathHash" | "qualityFlags"
  >
>;

const supportedProtocols = new Set<NetworkMeasurementProtocol>([
  "icmp",
  "tcp",
  "tls",
  "http",
  "traceroute",
]);

export async function runFixedMeasurement(input: {
  adapter: MeasurementAdapter;
  protocol: NetworkMeasurementProtocol;
  target: AgentMeasurementTarget;
  probeRevisionId: number;
  direction: "forward" | "reverse";
  observedAt?: Date;
}) {
  if (!supportedProtocols.has(input.protocol)) {
    throw new Error("measurement protocol 未在固定协议 allowlist 中");
  }
  if (!Number.isSafeInteger(input.probeRevisionId) || input.probeRevisionId <= 0) {
    throw new Error("probeRevisionId 无效");
  }
  const result = await input.adapter(input.protocol, input.target);
  return {
    targetRevisionId: input.target.targetRevisionId,
    probeRevisionId: input.probeRevisionId,
    direction: input.direction,
    protocol: input.protocol,
    observedAt: (input.observedAt ?? new Date()).toISOString(),
    ...result,
  } satisfies NetworkMeasurementSampleInput;
}
