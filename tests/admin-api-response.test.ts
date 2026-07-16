import assert from "node:assert/strict";
import test from "node:test";

import { adminApiFailure, adminApiSuccess } from "@/lib/admin-api-response";

void test("adminApiSuccess wraps data in a structured success body", async () => {
  const response = adminApiSuccess({ id: 7 }, { status: 201 });
  assert.equal(response.status, 201);

  const body = (await response.json()) as {
    success: boolean;
    data: { id: number };
  };
  assert.equal(body.success, true);
  assert.deepEqual(body.data, { id: 7 });
});

void test("adminApiSuccess defaults to status 200", async () => {
  const response = adminApiSuccess("ok");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { success: boolean; data: string };
  assert.equal(body.success, true);
  assert.equal(body.data, "ok");
});

void test("adminApiFailure serializes the structured admin error with the chosen status", async () => {
  const response = adminApiFailure(new Error("数据库暂时不可用"), {
    status: 500,
    code: "POST_SAVE_FAILED",
    title: "保存文章失败",
    suggestion: "稍后重试",
  });
  assert.equal(response.status, 500);

  const body = (await response.json()) as {
    success: boolean;
    errorTitle: string;
    message: string;
    actionError: { code: string; suggestion?: string };
  };
  assert.equal(body.success, false);
  assert.equal(body.errorTitle, "保存文章失败");
  assert.equal(body.message, "数据库暂时不可用");
  assert.equal(body.actionError.code, "POST_SAVE_FAILED");
  assert.equal(body.actionError.suggestion, "稍后重试");
});

void test("adminApiFailure does not leak init helper keys into the response init", async () => {
  const response = adminApiFailure("失败");
  // Default status when none is supplied.
  assert.equal(response.status, 200);
  const body = (await response.json()) as { success: boolean };
  assert.equal(body.success, false);
});
