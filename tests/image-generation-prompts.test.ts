import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultCoverPromptTemplate,
  defaultEnglishCoverPromptTemplate,
  getMandatoryCoverVisualRules,
  renderCoverPromptTemplate,
} from "../packages/core/image-generation-prompts";

void test("default cover prompts only expose description and keywords", () => {
  for (const template of [
    defaultCoverPromptTemplate,
    defaultEnglishCoverPromptTemplate,
  ]) {
    assert.doesNotMatch(template, /\{title\}|\{content\}/);
    assert.match(template, /\{description\}/);
    assert.match(template, /\{keywords\}/);
  }
});

void test("legacy title and content placeholder lines are removed at runtime", () => {
  const rendered = renderCoverPromptTemplate(
    [
      "文章标题：{title}",
      "文章摘要：{description}",
      "关键词：{keywords}",
      "正文：{content}",
    ].join("\n"),
    { description: "香港 VPS 优惠", keywords: "香港,VPS" },
  );

  assert.equal(rendered, "文章摘要：香港 VPS 优惠\n关键词：香港,VPS");
});

void test("both cover languages prohibit Taiwan flag imagery", () => {
  assert.match(getMandatoryCoverVisualRules("zh"), /台湾旗帜/);
  assert.match(getMandatoryCoverVisualRules("en"), /Taiwan flag/i);
});
