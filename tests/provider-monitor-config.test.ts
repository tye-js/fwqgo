import assert from "node:assert/strict";
import test from "node:test";

import {
  getProviderMonitorCheckRetentionCutoff,
  parseProviderMonitorConfig,
} from "@fwqgo/core/provider-monitor-config";

void test("provider monitor config supplies stable JSON mapping defaults", () => {
  const config = parseProviderMonitorConfig({});

  assert.equal(config.itemsPath, "data");
  assert.equal(config.externalIdField, "id");
  assert.equal(config.statusField, "status");
  assert.deepEqual(config.headers, {});
});

void test("provider monitor config rejects request headers that can alter routing", () => {
  assert.throws(
    () => parseProviderMonitorConfig({ headers: { Host: "127.0.0.1" } }),
    /不允许配置请求头 Host/,
  );
});

void test("provider monitor history uses a stable 30 day retention cutoff", () => {
  const now = new Date("2026-07-15T00:00:00.000Z");
  assert.equal(
    getProviderMonitorCheckRetentionCutoff(now).toISOString(),
    "2026-06-15T00:00:00.000Z",
  );
  assert.equal(
    getProviderMonitorCheckRetentionCutoff(now, 0).toISOString(),
    "2026-07-14T00:00:00.000Z",
  );
});
