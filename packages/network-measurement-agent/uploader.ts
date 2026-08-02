import {
  assertSecureBaseUrl,
  signAgentRequest,
  toAgentRequestHeaders,
  type AgentPrincipalKind,
} from "./signer";
import type { NetworkMeasurementBatchInput } from "@fwqgo/core/network-assessment";

export async function uploadMeasurementBatch(input: {
  baseUrl: string;
  batch: NetworkMeasurementBatchInput;
  principalKind: AgentPrincipalKind;
  principalExternalId: string;
  keyId: string;
  secret: string;
  path?: string;
  fetcher?: typeof fetch;
  requestTimestamp?: number;
}) {
  const fetcher = input.fetcher ?? fetch;
  const baseUrl = assertSecureBaseUrl(input.baseUrl);
  const path = input.path ?? "/api/internal/network-measurements/ingest";
  const body = new TextEncoder().encode(JSON.stringify(input.batch));
  const headers = signAgentRequest({
    method: "POST",
    path,
    principalKind: input.principalKind,
    principalExternalId: input.principalExternalId,
    keyId: input.keyId,
    body,
    secret: input.secret,
    requestTimestamp: input.requestTimestamp,
  });
  const response = await fetcher(new URL(path, baseUrl), {
    method: "POST",
    headers: toAgentRequestHeaders(headers),
    body,
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok) throw new Error(`测量批次上传失败：HTTP ${response.status}`);
  return payload;
}
