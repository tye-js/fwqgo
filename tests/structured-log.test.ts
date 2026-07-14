import assert from "node:assert/strict";
import test from "node:test";

import {
  getRequestId,
  sanitizeLogContext,
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
