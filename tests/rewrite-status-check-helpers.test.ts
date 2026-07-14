import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyHttpError,
  parseStatusResponse,
} from "@fwqgo/ai/rewrite-status-check";

void test("classifyHttpError maps status codes to operator-facing titles and advice", () => {
  const auth = classifyHttpError({
    status: 401,
    statusText: "Unauthorized",
    payload: null,
    bodyText: "",
  });
  assert.equal(auth.errorTitle, "认证失败");
  assert.match(auth.error, /HTTP 401 Unauthorized/);
  assert.match(auth.suggestion, /API Key/);

  assert.equal(
    classifyHttpError({ status: 403, statusText: "Forbidden", payload: null, bodyText: "" }).errorTitle,
    "认证失败",
  );
  assert.equal(
    classifyHttpError({ status: 404, statusText: "Not Found", payload: null, bodyText: "" }).errorTitle,
    "接口或模型不存在",
  );
  assert.equal(
    classifyHttpError({ status: 429, statusText: "Too Many Requests", payload: null, bodyText: "" }).errorTitle,
    "额度或频率受限",
  );
  assert.equal(
    classifyHttpError({ status: 503, statusText: "Service Unavailable", payload: null, bodyText: "" }).errorTitle,
    "服务商接口异常",
  );
  assert.equal(
    classifyHttpError({ status: 400, statusText: "Bad Request", payload: null, bodyText: "" }).errorTitle,
    "接口请求失败",
  );
});

void test("classifyHttpError prefers provider error message over raw body", () => {
  const withProvider = classifyHttpError({
    status: 400,
    statusText: "Bad Request",
    payload: { error: { message: "  invalid model  " } },
    bodyText: "raw body text",
  });
  assert.match(withProvider.error, /invalid model/);
  assert.doesNotMatch(withProvider.error, /raw body text/);

  const withBody = classifyHttpError({
    status: 400,
    statusText: "Bad Request",
    payload: null,
    bodyText: "raw body detail",
  });
  assert.match(withBody.error, /raw body detail/);

  const withNothing = classifyHttpError({
    status: 400,
    statusText: "Bad Request",
    payload: null,
    bodyText: "   ",
  });
  assert.match(withNothing.error, /服务商没有返回错误详情/);
});

void test("classifyHttpError truncates a very long response body preview", () => {
  const longBody = "x".repeat(500);
  const result = classifyHttpError({
    status: 400,
    statusText: "Bad Request",
    payload: null,
    bodyText: longBody,
  });
  // Body preview is capped at 220 chars; the error string also carries the HTTP prefix.
  assert.ok(result.error.length < longBody.length);
  assert.match(result.error, /x{220}/);
});

void test("parseStatusResponse tolerates empty and malformed JSON", () => {
  assert.deepEqual(parseStatusResponse(""), {});
  assert.deepEqual(parseStatusResponse('{"usage":{"total_tokens":5}}'), {
    usage: { total_tokens: 5 },
  });
  assert.equal(parseStatusResponse("not json"), null);
});
