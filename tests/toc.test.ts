import assert from "node:assert/strict";
import test from "node:test";

import { addIdsToHeadings, generateToc, generateUniqueId } from "@fwqgo/core/toc";

void test("generateUniqueId keeps Chinese and latin while dropping punctuation", () => {
  assert.equal(generateUniqueId("Hello World"), "hello-world");
  assert.equal(generateUniqueId("香港 CN2 套餐!"), "香港-cn2-套餐");
  assert.equal(generateUniqueId("  --Trim Me--  "), "trim-me");
  assert.equal(generateUniqueId("A___B"), "ab");
});

void test("generateToc extracts headings with ids produced by the render pipeline", () => {
  const html = addIdsToHeadings("## 套餐详情\n\n### 价格\n\n## 套餐详情");
  const toc = generateToc(html);

  assert.deepEqual(
    toc.map((item) => ({ level: item.level, text: item.text })),
    [
      { level: 2, text: "套餐详情" },
      { level: 3, text: "价格" },
      { level: 2, text: "套餐详情" },
    ],
  );

  // Repeated heading text must get unique ids so anchors don't collide.
  assert.equal(toc[0]!.id, "套餐详情");
  assert.equal(toc[2]!.id, "套餐详情-2");
});

void test("generateToc strips inline markup from heading text", () => {
  const toc = generateToc('<h2 id="a">价格 <strong>说明</strong></h2>');
  assert.equal(toc.length, 1);
  assert.equal(toc[0]!.text, "价格 说明");
  assert.equal(toc[0]!.id, "a");
});

void test("generateToc ignores headings without an id attribute", () => {
  const toc = generateToc("<h2>无锚点</h2>");
  assert.equal(toc.length, 0);
});
