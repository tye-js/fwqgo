import assert from "node:assert/strict";
import test from "node:test";

import {
  readResponseBodyWithLimit,
  readResponseTextWithLimit,
} from "../packages/core/bounded-response-body";

void test("reads a response body within the byte limit", async () => {
  const body = await readResponseBodyWithLimit(
    new Response(new Uint8Array([1, 2, 3])),
    3,
  );
  assert.deepEqual(body, new Uint8Array([1, 2, 3]));
});

void test("stops reading a response body after the byte limit", async () => {
  const body = await readResponseBodyWithLimit(
    new Response(new Uint8Array([1, 2, 3, 4])),
    3,
  );
  assert.equal(body, null);
});

void test("decodes bounded response text", async () => {
  const text = await readResponseTextWithLimit(new Response("中文内容"), 32);
  assert.equal(text, "中文内容");
});
