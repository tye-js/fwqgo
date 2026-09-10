import { RE2 } from "re2-wasm";
import type { ProviderMonitorConfig } from "@fwqgo/core/provider-monitor-config";

const MAX_PATTERN_LENGTH = 200;
const MAX_FIELD_BYTES = 64 * 1024;
const MAX_CACHED_PATTERNS = 128;
const patterns = new Map<string, RE2>();

function compilePattern(pattern: string) {
  if (pattern.length > MAX_PATTERN_LENGTH)
    throw new Error("HTML 字段正则不能超过 200 个字符");
  const existing = patterns.get(pattern);
  if (existing) return existing;
  let compiled: RE2;
  try {
    compiled = new RE2(pattern, "iu");
  } catch (error) {
    throw new Error(
      "HTML 字段正则无效：请使用 RE2 语法，不支持回溯引用和前后向断言",
      { cause: error },
    );
  }
  if (patterns.size >= MAX_CACHED_PATTERNS) {
    const oldest = patterns.keys().next().value;
    if (oldest !== undefined) patterns.delete(oldest);
  }
  patterns.set(pattern, compiled);
  return compiled;
}

export function matchProviderFieldPattern(
  text: string,
  pattern: string,
  group: number,
) {
  if (Buffer.byteLength(text, "utf8") > MAX_FIELD_BYTES) {
    throw new Error("HTML 字段内容超过 64 KB，请缩小字段选择器范围");
  }
  return compilePattern(pattern).exec(text)?.[group] ?? "";
}

export function validateProviderFieldPatterns(config: ProviderMonitorConfig) {
  const fields =
    "fields" in config
      ? config.fields
      : "collection" in config && config.collection.type === "html_listing"
        ? config.collection.fields
        : null;
  if (!fields) return;
  for (const field of Object.values(fields)) {
    if (field?.pattern) compilePattern(field.pattern);
  }
}
