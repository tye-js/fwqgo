import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BACKGROUND_JOB_RETENTION_DAYS,
  getBackgroundJobRetentionCutoff,
  getBackgroundJobRetryDelayMs,
  normalizeBackgroundJobMaxAttempts,
  normalizeBackgroundJobRetentionDays,
} from "@fwqgo/core/background-job-policy";

void test("normalizes background job attempts into the supported range", () => {
  assert.equal(normalizeBackgroundJobMaxAttempts(undefined), 3);
  assert.equal(normalizeBackgroundJobMaxAttempts(0), 3);
  assert.equal(normalizeBackgroundJobMaxAttempts(2.9), 2);
  assert.equal(normalizeBackgroundJobMaxAttempts(99), 20);
});

void test("uses capped exponential retry delays", () => {
  assert.equal(getBackgroundJobRetryDelayMs(1), 30_000);
  assert.equal(getBackgroundJobRetryDelayMs(2), 60_000);
  assert.equal(getBackgroundJobRetryDelayMs(3), 120_000);
  assert.equal(getBackgroundJobRetryDelayMs(99), 15 * 60 * 1000);
});

void test("normalizes task retention and calculates a stable cutoff", () => {
  assert.equal(
    normalizeBackgroundJobRetentionDays(undefined),
    DEFAULT_BACKGROUND_JOB_RETENTION_DAYS,
  );
  assert.equal(normalizeBackgroundJobRetentionDays("30"), 30);
  assert.equal(normalizeBackgroundJobRetentionDays("0"), 14);
  assert.equal(normalizeBackgroundJobRetentionDays(999), 365);

  const now = new Date("2026-07-14T00:00:00.000Z");
  assert.equal(
    getBackgroundJobRetentionCutoff(now, 14).toISOString(),
    "2026-06-30T00:00:00.000Z",
  );
});
