import assert from "node:assert/strict";
import test from "node:test";

import { createAsyncTtlLoader } from "@fwqgo/core/async-ttl-loader";

void test("deduplicates concurrent loads and caches the result until expiry", async () => {
  let now = 1_000;
  let calls = 0;
  const load = createAsyncTtlLoader(
    async () => {
      calls += 1;
      await Promise.resolve();
      return calls;
    },
    { ttlMs: 3_000, now: () => now },
  );

  const [first, second] = await Promise.all([load(), load()]);
  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(calls, 1);

  now = 3_999;
  assert.equal(await load(), 1);
  assert.equal(calls, 1);

  now = 4_000;
  assert.equal(await load(), 2);
  assert.equal(calls, 2);
});

void test("does not cache rejected loads", async () => {
  let calls = 0;
  const load = createAsyncTtlLoader(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary failure");
      return "ok";
    },
    { ttlMs: 3_000 },
  );

  await assert.rejects(load(), /temporary failure/);
  assert.equal(await load(), "ok");
  assert.equal(calls, 2);
});
