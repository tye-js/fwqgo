import assert from "node:assert/strict";
import test from "node:test";

import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "../packages/core/bounded-request-body";

function postRequest(body: BodyInit, headers?: HeadersInit) {
  return new Request("https://cms.example.com/api/auth/login", {
    method: "POST",
    body,
    headers,
  });
}

void test("reads a request body at the configured byte limit", async () => {
  assert.equal(await readRequestTextWithLimit(postRequest("1234"), 4), "1234");
  assert.equal(
    await readRequestTextWithLimit(new Request("https://example.com"), 4),
    "",
  );
});

void test("counts UTF-8 request bytes instead of characters", async () => {
  assert.equal(await readRequestTextWithLimit(postRequest("中文"), 6), "中文");
  await assert.rejects(
    readRequestTextWithLimit(postRequest("中文"), 5),
    RequestBodyTooLargeError,
  );
});

void test("rejects an oversized declared content length before parsing", async () => {
  await assert.rejects(
    readRequestTextWithLimit(
      postRequest("{}", { "content-length": "8193" }),
      8192,
    ),
    (error) =>
      error instanceof RequestBodyTooLargeError && error.maxBytes === 8192,
  );
});

void test("rejects an oversized streamed body without content length", async () => {
  await assert.rejects(
    readRequestTextWithLimit(postRequest("12345"), 4),
    RequestBodyTooLargeError,
  );
});

void test("keeps a hard boundary for invalid limit configuration", async () => {
  await assert.rejects(
    readRequestTextWithLimit(postRequest("12"), Number.NaN),
    (error) =>
      error instanceof RequestBodyTooLargeError && error.maxBytes === 1,
  );
});
