import { RE2JS, RE2JSSyntaxException } from "re2js";
import type { ProviderMonitorConfig } from "@fwqgo/core/provider-monitor-config";

const MAX_PATTERN_LENGTH = 200;
const MAX_FIELD_BYTES = 64 * 1024;
const MAX_CACHED_PATTERNS = 128;
// Compiled patterns are ordinary JS objects and are collected after eviction.
const patterns = new Map<string, RE2JS>();

function compilePattern(pattern: string) {
  if (pattern.length > MAX_PATTERN_LENGTH)
    throw new Error("HTML 字段正则不能超过 200 个字符");
  const existing = patterns.get(pattern);
  if (existing) return existing;
  let compiled: RE2JS;
  try {
    compiled = RE2JS.compile(
      RE2JS.translateRegExp(pattern),
      RE2JS.CASE_INSENSITIVE,
    );
  } catch (error) {
    if (!(error instanceof RE2JSSyntaxException)) {
      throw new Error("HTML 字段正则编译失败，请稍后重试", { cause: error });
    }
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
  const matcher = compilePattern(pattern).matcher(text);
  if (
    !Number.isInteger(group) ||
    group < 0 ||
    group > matcher.groupCount() ||
    !matcher.find()
  )
    return "";
  return matcher.group(group) ?? "";
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
