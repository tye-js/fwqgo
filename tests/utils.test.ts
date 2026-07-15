import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeFileName } from "../packages/core/utils";

void test("does not truncate percent-encoded Unicode file names mid-character", () => {
  const sanitized = sanitizeFileName(`${"中文封面".repeat(40)}.webp`);

  assert.ok(sanitized.length <= 200);
  assert.doesNotThrow(() => decodeURIComponent(sanitized));
  assert.match(sanitized, /\.webp$/);
});

void test("removes unsafe characters from file extensions", () => {
  const sanitized = sanitizeFileName("cover.jp<g>");

  assert.equal(sanitized, "cover.jpg");
});
