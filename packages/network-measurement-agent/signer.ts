import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type AgentPrincipalKind = "probe" | "target_agent";

export function assertSecureBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("agent baseUrl 必须是有效的 HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("agent baseUrl 必须使用 HTTPS 且不能包含 URL 凭据");
  }
  return url;
}

export function sha256Hex(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalRequest(input: {
  method: string;
  path: string;
  principalKind: AgentPrincipalKind;
  principalExternalId: string;
  keyId: string;
  requestTimestamp: number;
  nonce: string;
  bodyHash: string;
}) {
  return [
    "fwqgo-network-v1",
    input.method.toUpperCase(),
    input.path,
    input.principalKind,
    input.principalExternalId,
    input.keyId,
    String(input.requestTimestamp),
    input.nonce,
    input.bodyHash,
  ].join("\n");
}

function signature(canonical: string, secret: string) {
  return `v1=${createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(canonical, "utf8")
    .digest()
    .toString("base64url")}`;
}

export function signAgentRequest(input: {
  method: string;
  path: string;
  principalKind: AgentPrincipalKind;
  principalExternalId: string;
  keyId: string;
  body: Uint8Array;
  secret: string;
  requestTimestamp?: number;
  nonce?: string;
}) {
  const requestTimestamp = input.requestTimestamp ?? Math.floor(Date.now() / 1000);
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const canonical = canonicalRequest({
    ...input,
    requestTimestamp,
    nonce,
    bodyHash: sha256Hex(input.body),
  });
  return {
    principalKind: input.principalKind,
    principalExternalId: input.principalExternalId,
    keyId: input.keyId,
    requestTimestamp: String(requestTimestamp),
    nonce,
    signature: signature(canonical, input.secret),
  };
}

/** Convert a signed request into the exact headers accepted by the CMS API. */
export function toAgentRequestHeaders(input: ReturnType<typeof signAgentRequest>) {
  return {
    "Content-Type": "application/json",
    "X-FWQGO-Principal-Kind": input.principalKind,
    "X-FWQGO-Principal-Id": input.principalExternalId,
    "X-FWQGO-Key-Id": input.keyId,
    "X-FWQGO-Timestamp": input.requestTimestamp,
    "X-FWQGO-Nonce": input.nonce,
    "X-FWQGO-Signature": input.signature,
  };
}

export function verifyTaskEnvelope(input: {
  envelope: {
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
  principalKind: AgentPrincipalKind;
  principalExternalId: string;
  keyId: string;
  secret: string;
  nowSeconds?: number;
}) {
  const envelope = input.envelope;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(envelope.issuedAt) ||
    !Number.isSafeInteger(envelope.expiresAt) ||
    !/^[A-Za-z0-9._:-]{1,160}$/u.test(envelope.taskId) ||
    envelope.principalKind !== input.principalKind ||
    envelope.principalExternalId !== input.principalExternalId ||
    envelope.keyId !== input.keyId ||
    envelope.issuedAt > nowSeconds + 300 ||
    envelope.expiresAt < nowSeconds ||
    envelope.expiresAt <= envelope.issuedAt ||
    !/^[0-9a-f]{32}$/u.test(envelope.nonce)
  ) {
    return false;
  }
  if (Buffer.byteLength(input.secret, "utf8") < 32) return false;
  if (
    !/^[A-Za-z0-9_-]+$/u.test(envelope.payload) ||
    envelope.payload.length % 4 === 1
  ) {
    return false;
  }
  const payload = Buffer.from(envelope.payload, "base64url");
  if (payload.toString("base64url") !== envelope.payload) return false;
  const canonical = [
    "fwqgo-network-task-v1",
    envelope.principalKind,
    envelope.principalExternalId,
    envelope.keyId,
    envelope.taskId,
    String(envelope.issuedAt),
    String(envelope.expiresAt),
    envelope.nonce,
    sha256Hex(payload),
  ].join("\n");
  if (!/^v1=[A-Za-z0-9_-]{43}$/u.test(envelope.signature)) return false;
  const expected = Buffer.from(signature(canonical, input.secret).slice(3), "base64url");
  const received = Buffer.from(envelope.signature.slice(3), "base64url");
  return (
    expected.byteLength === received.byteLength &&
    timingSafeEqual(expected, received)
  );
}
