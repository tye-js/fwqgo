import { randomUUID } from "node:crypto";

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const SENSITIVE_KEY =
  /(authorization|cookie|password|secret|token|api[-_]?key|database[-_]?url)/i;

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message.slice(0, 1_000) };
  }
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(key, item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, item]) => [childKey, sanitizeValue(childKey, item)],
      ),
    );
  }
  return value;
}

export function sanitizeLogContext(context: LogContext) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sanitizeValue(key, value),
    ]),
  );
}

export function getRequestId(headers: Headers) {
  const supplied = headers.get("x-request-id")?.trim();
  return supplied && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : randomUUID();
}

export function attachRequestId<T extends Response>(
  response: T,
  requestId: string,
) {
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export function structuredLog(
  level: LogLevel,
  event: string,
  context: LogContext = {},
) {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    releaseId: process.env.RELEASE_ID ?? null,
    ...sanitizeLogContext(context),
  });
  const writer =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  writer(record);
}
