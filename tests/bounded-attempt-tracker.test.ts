import assert from "node:assert/strict";
import test from "node:test";

import { BoundedAttemptTracker } from "@fwqgo/core/bounded-attempt-tracker";

function createTracker(maxEntries = 10) {
  return new BoundedAttemptTracker({
    maxAttempts: 3,
    windowMs: 10_000,
    lockMs: 20_000,
    maxEntries,
  });
}

void test("locks keys after the configured number of attempts", () => {
  const tracker = createTracker();
  tracker.recordAttempt(["ip:1"], 1_000);
  tracker.recordAttempt(["ip:1"], 2_000);
  assert.equal(tracker.getRetryAfterSeconds(["ip:1"], 2_000), 0);

  tracker.recordAttempt(["ip:1"], 3_000);
  assert.equal(tracker.getRetryAfterSeconds(["ip:1"], 3_000), 20);
  assert.equal(tracker.getRetryAfterSeconds(["ip:1"], 23_000), 0);
});

void test("deduplicates keys and clears successful login attempts", () => {
  const tracker = createTracker();
  tracker.recordAttempt(["ip:1", "ip:1"], 1_000);
  assert.equal(tracker.size, 1);
  tracker.clear(["ip:1"]);
  assert.equal(tracker.size, 0);
});

void test("prunes expired keys and never exceeds its entry cap", () => {
  const tracker = createTracker(2);
  tracker.recordAttempt(["a"], 1_000);
  tracker.recordAttempt(["b"], 1_100);
  tracker.recordAttempt(["c"], 1_200);
  assert.equal(tracker.size, 2);
  assert.equal(tracker.getRetryAfterSeconds(["a"], 1_200), 0);

  tracker.getRetryAfterSeconds(["b", "c"], 30_000);
  assert.equal(tracker.size, 0);
});

void test("starts a fresh window after a lock expires", () => {
  const tracker = new BoundedAttemptTracker({
    maxAttempts: 2,
    windowMs: 60_000,
    lockMs: 1_000,
    maxEntries: 10,
  });
  tracker.recordAttempt(["ip:1"], 0);
  tracker.recordAttempt(["ip:1"], 1);
  assert.equal(tracker.getRetryAfterSeconds(["ip:1"], 500), 1);

  tracker.recordAttempt(["ip:1"], 1_001);
  assert.equal(tracker.getRetryAfterSeconds(["ip:1"], 1_001), 0);
});
