import assert from "node:assert/strict";
import test from "node:test";

import { withAsyncRollback } from "../packages/core/async-rollback";

void test("does not run rollback actions after success", async () => {
  const events: string[] = [];
  const result = await withAsyncRollback(async (defer) => {
    defer(() => {
      events.push("cleanup");
    });
    events.push("work");
    return "saved";
  });

  assert.equal(result, "saved");
  assert.deepEqual(events, ["work"]);
});

void test("runs every rollback in reverse order and preserves the work error", async () => {
  const events: string[] = [];
  const workError = new Error("database insert failed");
  let receivedError: unknown;

  try {
    await withAsyncRollback(async (defer) => {
      defer(() => {
        events.push("main");
      });
      defer(() => {
        events.push("thumb");
        throw new Error("cleanup failed");
      });
      defer(async () => {
        await Promise.resolve();
        events.push("large");
      });
      throw workError;
    });
  } catch (error) {
    receivedError = error;
  }

  assert.equal(receivedError, workError);
  assert.deepEqual(events, ["large", "thumb", "main"]);
});
