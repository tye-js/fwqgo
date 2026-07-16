import assert from "node:assert/strict";
import test from "node:test";

import { getLatestDateValue, parseDateValue } from "@fwqgo/core/date-value";

void test("date values normalize database strings and preserve Date instances", () => {
  const date = new Date("2026-07-16T12:00:00.000Z");

  assert.equal(parseDateValue(date), date);
  assert.equal(
    parseDateValue("2026-07-16T13:00:00.000Z")?.toISOString(),
    "2026-07-16T13:00:00.000Z",
  );
  assert.equal(parseDateValue(null), null);
  assert.equal(parseDateValue("not-a-date"), null);
});

void test("latest date ignores invalid aggregate values", () => {
  assert.equal(
    getLatestDateValue([
      "2026-07-16T12:00:00.000Z",
      new Date("2026-07-16T14:00:00.000Z"),
      "invalid",
      null,
    ])?.toISOString(),
    "2026-07-16T14:00:00.000Z",
  );
  assert.equal(getLatestDateValue([null, undefined, "invalid"]), null);
});
