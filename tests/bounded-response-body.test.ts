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

void test("rejects an oversized declared response before reading", async () => {
  const body = await readResponseBodyWithLimit(
    new Response("ok", { headers: { "content-length": "5" } }),
    4,
  );
  assert.equal(body, null);
});

void test("keeps a hard response boundary for an invalid limit", async () => {
  const body = await readResponseBodyWithLimit(
    new Response(new Uint8Array([1, 2])),
    Number.NaN,
  );
  assert.equal(body, null);
});

void test("decodes bounded response text", async () => {
  const text = await readResponseTextWithLimit(new Response("中文内容"), 32);
  assert.equal(text, "中文内容");
});
