import assert from "node:assert/strict";
import test from "node:test";

import {
  getRequestId,
  sanitizeLogContext,
  structuredLog,
} from "../packages/core/structured-log";

void test("request id accepts a bounded safe caller value", () => {
  assert.equal(
    getRequestId(new Headers({ "x-request-id": "edge:abc-123" })),
    "edge:abc-123",
  );
  assert.match(
    getRequestId(new Headers({ "x-request-id": "bad value" })),
    /^[0-9a-f-]{36}$/,
  );
});

void test("structured log context redacts secrets and serializes errors safely", () => {
  const sanitized = sanitizeLogContext({
    password: "do-not-log",
    nested: { apiKey: "secret", taskId: 42 },
    error: new Error("provider failed"),
  });
  assert.equal(sanitized.password, "[REDACTED]");
  assert.deepEqual(sanitized.nested, { apiKey: "[REDACTED]", taskId: 42 });
  assert.deepEqual(sanitized.error, {
    name: "Error",
    message: "provider failed",
  });
});

void test("structured log context handles circular values and bigint", () => {
  const circular: Record<string, unknown> = { count: 42n };
  circular.self = circular;
  assert.deepEqual(sanitizeLogContext({ circular }), {
    circular: { count: "42", self: "[CIRCULAR]" },
  });
});

void test("structured log context cannot replace reserved record fields", () => {
  const originalInfo = console.info;
  let output = "";
  console.info = (value?: unknown) => {
    output = String(value);
  };
  try {
    structuredLog("info", "real.event", {
      level: "error",
      event: "forged.event",
      timestamp: "forged",
    });
  } finally {
    console.info = originalInfo;
  }

  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.equal(parsed.level, "info");
  assert.equal(parsed.event, "real.event");
  assert.notEqual(parsed.timestamp, "forged");
});
