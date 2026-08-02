import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const NETWORK_REQUEST_DOMAIN = "fwqgo-network-v1" as const;
export const NETWORK_TASK_DOMAIN = "fwqgo-network-task-v1" as const;
export const NETWORK_SIGNATURE_HEADER = /^v1=[A-Za-z0-9_-]{43}$/;
export const NETWORK_NONCE_PATTERN = /^[0-9a-f]{32}$/;
export const NETWORK_KEY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
export const NETWORK_PRINCIPAL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
export const NETWORK_CLOCK_SKEW_SECONDS = 300;
export const NETWORK_MAX_BODY_BYTES = 1024 * 1024;

export type NetworkPrincipalKind = "probe" | "target_agent";

export type NetworkRequestSigningInput = {
  method: string;
  path: string;
  principalKind: NetworkPrincipalKind;
  principalExternalId: string;
  keyId: string;
  requestTimestamp: number;
  nonce: string;
  body: Uint8Array;
  secret: string | Uint8Array;
};

export type NetworkRequestSignatureHeaders = {
  principalKind: NetworkPrincipalKind;
  principalExternalId: string;
  keyId: string;
  requestTimestamp: string;
  nonce: string;
  signature: string;
};

export type NetworkSignatureFailureCode =
  | "invalid_method"
  | "invalid_path"
  | "invalid_principal"
  | "invalid_key_id"
  | "invalid_timestamp"
  | "invalid_nonce"
  | "invalid_body"
  | "clock_skew"
  | "invalid_secret"
  | "invalid_signature";

export type NetworkSignatureVerification =
  | { ok: true; canonical: string; bodyHash: string }
  | { ok: false; code: NetworkSignatureFailureCode };

function secretBytes(secret: string | Uint8Array) {
  return typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
}

function isSafeOpaque(value: string, pattern: RegExp) {
  return pattern.test(value) && !/[\r\n]/u.test(value);
}

export function sha256Hex(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

export function createNetworkRequestCanonicalString(
  input: Omit<NetworkRequestSigningInput, "secret" | "body"> & {
    bodyHash: string;
  },
) {
  return [
    NETWORK_REQUEST_DOMAIN,
    input.method,
    input.path,
    input.principalKind,
    input.principalExternalId,
    input.keyId,
    String(input.requestTimestamp),
    input.nonce,
    input.bodyHash,
  ].join("\n");
}

export function createNetworkTaskCanonicalString(input: {
  principalKind: NetworkPrincipalKind;
  principalExternalId: string;
  keyId: string;
  taskId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  payload: Uint8Array;
}) {
  return [
    NETWORK_TASK_DOMAIN,
    input.principalKind,
    input.principalExternalId,
    input.keyId,
    input.taskId,
    String(input.issuedAt),
    String(input.expiresAt),
    input.nonce,
    sha256Hex(input.payload),
  ].join("\n");
}

function encodeSignature(canonical: string, secret: string | Uint8Array) {
  return `v1=${createHmac("sha256", secretBytes(secret))
    .update(canonical, "utf8")
    .digest()
    .toString("base64url")}`;
}

export function signNetworkRequest(input: NetworkRequestSigningInput) {
  const bodyHash = sha256Hex(input.body);
  const canonical = createNetworkRequestCanonicalString({
    ...input,
    method: input.method.toUpperCase(),
    bodyHash,
  });
  return {
    canonical,
    bodyHash,
    signature: encodeSignature(canonical, input.secret),
  };
}

export function signNetworkTask(input: {
  principalKind: NetworkPrincipalKind;
  principalExternalId: string;
  keyId: string;
  taskId: string;
  issuedAt: number;
  expiresAt: number;
  nonce?: string;
  payload: Uint8Array;
  secret: string | Uint8Array;
}) {
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const canonical = createNetworkTaskCanonicalString({ ...input, nonce });
  return {
    nonce,
    canonical,
    signature: encodeSignature(canonical, input.secret),
  };
}

function failure(code: NetworkSignatureFailureCode): NetworkSignatureVerification {
  return { ok: false, code };
}

export function verifyNetworkRequestSignature(input: {
  method: string;
  path: string;
  allowedPath: string;
  headers: NetworkRequestSignatureHeaders;
  body: Uint8Array;
  secret: string | Uint8Array;
  nowSeconds?: number;
  clockSkewSeconds?: number;
}) : NetworkSignatureVerification {
  const method = input.method.toUpperCase();
  if (!/^[A-Z]+$/u.test(method)) return failure("invalid_method");
  if (input.path !== input.allowedPath || input.path.includes("?")) {
    return failure("invalid_path");
  }
  if (
    !isSafeOpaque(
      input.headers.principalExternalId,
      NETWORK_PRINCIPAL_ID_PATTERN,
    ) ||
    !["probe", "target_agent"].includes(input.headers.principalKind)
  ) {
    return failure("invalid_principal");
  }
  if (!isSafeOpaque(input.headers.keyId, NETWORK_KEY_ID_PATTERN)) {
    return failure("invalid_key_id");
  }
  if (!/^\d{1,12}$/u.test(input.headers.requestTimestamp)) {
    return failure("invalid_timestamp");
  }
  const requestTimestamp = Number(input.headers.requestTimestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const clockSkewSeconds = input.clockSkewSeconds ?? NETWORK_CLOCK_SKEW_SECONDS;
  if (
    !Number.isSafeInteger(requestTimestamp) ||
    Math.abs(nowSeconds - requestTimestamp) > clockSkewSeconds
  ) {
    return failure("clock_skew");
  }
  if (!NETWORK_NONCE_PATTERN.test(input.headers.nonce)) {
    return failure("invalid_nonce");
  }
  if (input.body.byteLength > NETWORK_MAX_BODY_BYTES) {
    return failure("invalid_body");
  }
  const secretBuffer = secretBytes(input.secret);
  if (secretBuffer.byteLength < 32) return failure("invalid_secret");
  if (!NETWORK_SIGNATURE_HEADER.test(input.headers.signature)) {
    return failure("invalid_signature");
  }
  const bodyHash = sha256Hex(input.body);
  const canonical = createNetworkRequestCanonicalString({
    method,
    path: input.path,
    principalKind: input.headers.principalKind,
    principalExternalId: input.headers.principalExternalId,
    keyId: input.headers.keyId,
    requestTimestamp,
    nonce: input.headers.nonce,
    bodyHash,
  });
  const expected = Buffer.from(encodeSignature(canonical, secretBuffer).slice(3), "base64url");
  const received = Buffer.from(input.headers.signature.slice(3), "base64url");
  if (
    expected.byteLength !== received.byteLength ||
    !timingSafeEqual(expected, received)
  ) {
    return failure("invalid_signature");
  }
  return { ok: true, canonical, bodyHash };
}
