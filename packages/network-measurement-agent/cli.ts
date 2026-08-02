import { assertTargetAllowlist, type AgentTarget } from "./allowlist";
import { runFixedMeasurement, type MeasurementAdapter } from "./measurement-adapters";
import { pullSignedTask } from "./task-client";
import { uploadMeasurementBatch } from "./uploader";

export async function runAgentOnce(input: {
  baseUrl: string;
  principalKind: "probe" | "target_agent";
  principalExternalId: string;
  keyId: string;
  secret: string;
  probeRevisionId: number;
  direction: "forward" | "reverse";
  protocol: Parameters<MeasurementAdapter>[0];
  adapter: MeasurementAdapter;
  allowedTargets: readonly AgentTarget[];
  fetcher?: typeof fetch;
  nowSeconds?: number;
}) {
  const task = await pullSignedTask(input);
  const samples = [];
  for (const target of task.targets) {
    assertTargetAllowlist(target, input.allowedTargets);
    samples.push(
      await runFixedMeasurement({
        adapter: input.adapter,
        protocol: input.protocol,
        target: {
          targetRevisionId: target.targetRevisionId,
          targetAddress: target.targetAddress,
          port: target.port,
        },
        probeRevisionId: input.probeRevisionId,
        direction: input.direction,
      }),
    );
  }
  return uploadMeasurementBatch({
    baseUrl: input.baseUrl,
    batch: {
      version: 1,
      batchId: `${task.taskId}-${input.direction}-${input.protocol}`,
      runId: task.runId,
      runGeneration: task.runGeneration,
      samples,
    },
    principalKind: input.principalKind,
    principalExternalId: input.principalExternalId,
    keyId: input.keyId,
    secret: input.secret,
    fetcher: input.fetcher,
    requestTimestamp: input.nowSeconds,
  });
}
