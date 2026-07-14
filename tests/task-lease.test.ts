import assert from "node:assert/strict";
import test from "node:test";

import {
  getTaskLeaseExpiry,
  isTaskLeaseExpired,
  withTaskLeaseHeartbeat,
} from "../packages/core/task-lease";

void test("task lease expiry is calculated from the supplied clock", () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  assert.equal(
    getTaskLeaseExpiry(now, 30_000).toISOString(),
    "2026-07-14T00:00:30.000Z",
  );
});

void test("missing and elapsed task leases are expired", () => {
  const now = new Date("2026-07-14T00:00:30.000Z");
  assert.equal(isTaskLeaseExpired(null, now), true);
  assert.equal(
    isTaskLeaseExpired(new Date("2026-07-14T00:00:30.000Z"), now),
    true,
  );
  assert.equal(
    isTaskLeaseExpired(new Date("2026-07-14T00:00:31.000Z"), now),
    false,
  );
});

void test("task heartbeat stops after work completes", async () => {
  let renewals = 0;
  await withTaskLeaseHeartbeat({
    intervalMs: 5,
    renew: async () => {
      renewals += 1;
      return true;
    },
    run: () => new Promise<void>((resolve) => setTimeout(resolve, 18)),
  });
  const completedRenewals = renewals;
  await new Promise<void>((resolve) => setTimeout(resolve, 12));
  assert.ok(completedRenewals >= 2);
  assert.equal(renewals, completedRenewals);
});
