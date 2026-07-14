import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { isPriceLikeTag } from "@/features/cms/lib/tag-price-filter";
import {
  adminActionFailure,
  adminActionSuccess,
  getErrorMessage,
} from "@/lib/admin-action-result";

void test("detects Chinese and English price-oriented tags without broad matches", () => {
  assert.equal(isPriceLikeTag({ name: "便宜 VPS" }), true);
  assert.equal(isPriceLikeTag({ name: "Coupon Codes", slug: "coupon" }), true);
  assert.equal(isPriceLikeTag({ name: "美国服务器", slug: "us-vps" }), false);
});

void test("returns stable structured admin action success and failure results", () => {
  assert.deepEqual(adminActionSuccess({ id: 1 }, "保存成功"), {
    success: true,
    data: { id: 1 },
    message: "保存成功",
  });

  const failure = adminActionFailure(new Error("数据库暂时不可用"), {
    code: "POST_SAVE_FAILED",
    title: "保存文章失败",
    suggestion: "稍后重试",
  });
  assert.equal(failure.success, false);
  assert.equal(failure.actionError.code, "POST_SAVE_FAILED");
  assert.equal(failure.errorTitle, "保存文章失败");
  assert.equal(failure.message, "数据库暂时不可用");
  assert.equal(failure.actionError.suggestion, "稍后重试");
});

void test("uses the first readable Zod issue as the operator error", () => {
  const schema = z.object({
    title: z.string().min(2, "标题至少需要 2 个字符"),
  });
  const result = schema.safeParse({ title: "A" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(getErrorMessage(result.error), "标题至少需要 2 个字符");
  }
});
