import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpenAiChatCompletionsEndpoint,
  parseAiJsonObject,
} from "@fwqgo/ai/openai-compatible";

void test("normalizes OpenAI-compatible chat completion endpoints", () => {
  assert.equal(
    buildOpenAiChatCompletionsEndpoint("https://api.example.com"),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    buildOpenAiChatCompletionsEndpoint("https://api.example.com/v1/"),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(
    buildOpenAiChatCompletionsEndpoint(
      "https://api.example.com/v1/chat/completions",
    ),
    "https://api.example.com/v1/chat/completions",
  );
});

void test("parses compact and fenced JSON objects", () => {
  assert.deepEqual(parseAiJsonObject('{"title":"套餐"}', "AI 失败"), {
    title: "套餐",
  });
  assert.deepEqual(
    parseAiJsonObject('```json\n{"title":"套餐"}\n```', "AI 失败"),
    { title: "套餐" },
  );
});

void test("extracts one balanced JSON object from model commentary", () => {
  const parsed = parseAiJsonObject<{ description: string }>(
    '结果如下： {"description":"支持 {A} 套餐和 \\"引号\\""} 请查收',
    "AI 失败",
  );

  assert.equal(parsed.description, '支持 {A} 套餐和 "引号"');
});

void test("reports truncated JSON separately from non-JSON output", () => {
  assert.throws(
    () => parseAiJsonObject('{"title":"未结束"', "AI 元信息生成失败"),
    /JSON 格式损坏.*可能被截断/,
  );
  assert.throws(
    () => parseAiJsonObject("模型拒绝回答", "AI 元信息生成失败"),
    /返回内容不是 JSON.*模型拒绝回答/,
  );
});

void test("rejects a JSON array when an object is required", () => {
  assert.throws(
    () => parseAiJsonObject('[{"title":"套餐"}]', "AI 元信息生成失败"),
    /JSON 顶层不是对象/,
  );
});
