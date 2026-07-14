import { randomUUID } from "node:crypto";

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const SENSITIVE_KEY =
  /(authorization|cookie|password|secret|token|api[-_]?key|database[-_]?url)/i;
const MAX_LOG_DEPTH = 8;

function sanitizeValue(
  key: string,
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (depth > MAX_LOG_DEPTH) return "[MAX_DEPTH]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message.slice(0, 1_000) };
  }
  if (typeof value === "string") return value.slice(0, 2_000);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol" || typeof value === "function") {
    return `[${typeof value}]`;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const result = value
      .slice(0, 50)
      .map((item) => sanitizeValue(key, item, seen, depth + 1));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, item]) => [
          childKey,
          sanitizeValue(childKey, item, seen, depth + 1),
        ],
      ),
    );
    seen.delete(value);
    return result;
  }
  return value;
}

export function sanitizeLogContext(context: LogContext) {
  const seen = new WeakSet<object>();
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sanitizeValue(key, value, seen, 0),
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
    ...sanitizeLogContext(context),
    timestamp: new Date().toISOString(),
    level,
    event,
    releaseId: process.env.RELEASE_ID ?? null,
  });
  const writer =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  writer(record);
}
