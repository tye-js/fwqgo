import {
  normalizeSignedTargets,
  type AgentTarget,
} from "./allowlist";
import {
  assertSecureBaseUrl,
  signAgentRequest,
  toAgentRequestHeaders,
  verifyTaskEnvelope,
  type AgentPrincipalKind,
} from "./signer";

export type SignedTaskEnvelope = {
  version: 1;
  principalKind: AgentPrincipalKind;
  principalExternalId: string;
  keyId: string;
  taskId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  payload: string;
  signature: string;
};

export type NetworkTaskPayload = {
  version: 1;
  taskId: string;
  runId: number;
  runGeneration: number;
  campaignId: number;
  campaignRevisionId: number;
  candidateId: number;
  protocolVersion: string;
  probeSelector: Record<string, unknown>;
  metricProfile: Record<string, unknown>;
  targets: AgentTarget[];
};

function parseEnvelope(value: unknown): SignedTaskEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("服务端任务 envelope 无效");
  }
  const envelope = value as Record<string, unknown>;
  if (
    envelope.version !== 1 ||
    typeof envelope.principalKind !== "string" ||
    typeof envelope.principalExternalId !== "string" ||
    typeof envelope.keyId !== "string" ||
    typeof envelope.taskId !== "string" ||
    typeof envelope.issuedAt !== "number" ||
    typeof envelope.expiresAt !== "number" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.payload !== "string" ||
    typeof envelope.signature !== "string"
  ) {
    throw new Error("服务端任务字段无效");
  }
  return envelope as unknown as SignedTaskEnvelope;
}

function parsePayload(envelope: SignedTaskEnvelope) {
  const payload = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8")) as Record<string, unknown>;
  if (
    payload.version !== 1 ||
    payload.taskId !== envelope.taskId ||
    !Number.isSafeInteger(payload.runId) ||
    !Number.isSafeInteger(payload.runGeneration) ||
    !Number.isSafeInteger(payload.campaignId) ||
    !Number.isSafeInteger(payload.campaignRevisionId) ||
    !Number.isSafeInteger(payload.candidateId)
  ) {
    throw new Error("服务端任务 payload 无效");
  }
  return {
    ...payload,
    targets: normalizeSignedTargets(payload.targets),
  } as unknown as NetworkTaskPayload;
}

export async function pullSignedTask(input: {
  baseUrl: string;
  path?: string;
  principalKind: AgentPrincipalKind;
  principalExternalId: string;
  keyId: string;
  secret: string;
  fetcher?: typeof fetch;
  nowSeconds?: number;
}) {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = assertSecureBaseUrl(input.baseUrl);
  const path = input.path ?? "/api/internal/network-measurements/tasks/pull";
  const body = new TextEncoder().encode("{}");
  const headers = signAgentRequest({
    method: "POST",
    path,
    principalKind: input.principalKind,
    principalExternalId: input.principalExternalId,
    keyId: input.keyId,
    body,
    secret: input.secret,
    requestTimestamp: input.nowSeconds,
  });
  const response = await fetcher(new URL(path, baseUrl), {
    method: "POST",
    headers: toAgentRequestHeaders(headers),
    body,
  });
  if (!response.ok) throw new Error(`任务拉取失败：HTTP ${response.status}`);
  const envelope = parseEnvelope(await response.json());
  if (
    !verifyTaskEnvelope({
      envelope,
      principalKind: input.principalKind,
      principalExternalId: input.principalExternalId,
      keyId: input.keyId,
      secret: input.secret,
      nowSeconds: input.nowSeconds,
    })
  ) {
    throw new Error("任务 envelope 验签失败");
  }
  return parsePayload(envelope);
}
