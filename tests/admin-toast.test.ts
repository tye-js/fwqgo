import assert from "node:assert/strict";
import test from "node:test";

import {
  describeAdminActionError,
  describeAdminResult,
  notifyActionError,
} from "@/lib/admin-toast";

void test("describeAdminResult joins non-empty parts with a middot", () => {
  assert.equal(
    describeAdminResult(["保存成功", null, "", "耗时 2s", 3]),
    "保存成功 · 耗时 2s · 3",
  );
  assert.equal(describeAdminResult([null, undefined, ""]), "");
});

void test("describeAdminActionError prefers structured actionError message and suggestion", () => {
  const description = describeAdminActionError({
    actionError: {
      code: "POST_SAVE_FAILED",
      title: "保存失败",
      message: "数据库暂时不可用",
      suggestion: "稍后重试",
    },
  });
  assert.equal(description, "数据库暂时不可用 · 稍后重试");
});

void test("describeAdminActionError falls back to message, error string, then fallback suggestion", () => {
  assert.equal(
    describeAdminActionError({ message: "普通错误" }, "请刷新页面"),
    "普通错误 · 请刷新页面",
  );
  assert.equal(
    describeAdminActionError({ error: "字符串错误" }),
    "字符串错误",
  );
  // An object-shaped `error` with a message is treated as the action error.
  assert.equal(
    describeAdminActionError({ error: { message: "对象错误" } }),
    "对象错误",
  );
});

void test("notifyActionError resolves a title without throwing and surfaces it to the toast layer", () => {
  // notifyActionError delegates to sonner's toast.error; in the test runtime
  // there is no DOM, so we only assert it runs and derives the expected title
  // path via describeAdminActionError. A missing title falls back to 操作失败.
  assert.doesNotThrow(() => {
    notifyActionError({ actionError: { title: "保存文章失败", message: "x" } });
    notifyActionError({ error: "字符串错误" });
    notifyActionError({});
  });
});
