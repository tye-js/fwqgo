import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeSlug,
  formatDate,
  isHttpHref,
  isInternalHref,
  isSafePublicHref,
  isWithin24Hours,
  jsonLdScriptContent,
  normalizeDecodedSlug,
  parsePositiveInt,
  sanitizeFileName,
  slugify,
  toAbsoluteHttpUrl,
} from "@fwqgo/core/utils";

void test("slugify keeps Chinese, lowercases latin, and collapses separators", () => {
  assert.equal(slugify("Hello World"), "hello-world");
  assert.equal(slugify("香港 CN2 GIA 套餐"), "香港-cn2-gia-套餐");
  assert.equal(slugify("A：B，C。D"), "abcd");
  assert.equal(slugify("  ---trim---  "), "trim");
});

void test("slugify limits output length to 40 characters", () => {
  const long = "a".repeat(80);
  assert.equal(slugify(long).length, 40);
});

void test("parsePositiveInt only accepts positive integers", () => {
  assert.equal(parsePositiveInt("3"), 3);
  assert.equal(parsePositiveInt(5), 5);
  assert.equal(parsePositiveInt("0"), null);
  assert.equal(parsePositiveInt("-2"), null);
  assert.equal(parsePositiveInt("1.5"), null);
  assert.equal(parsePositiveInt("abc"), null);
  assert.equal(parsePositiveInt(2.5), null);
  assert.equal(parsePositiveInt(null), null);
  assert.equal(parsePositiveInt(undefined), null);
  assert.equal(parsePositiveInt("  4 "), 4);
});

void test("internal, http, and public href guards classify links", () => {
  assert.equal(isInternalHref("/fwq/posts/a"), true);
  assert.equal(isInternalHref("//evil.example"), false);
  assert.equal(isInternalHref("https://a.example"), false);

  assert.equal(isHttpHref("https://a.example"), true);
  assert.equal(isHttpHref("http://a.example"), true);
  assert.equal(isHttpHref("javascript:alert(1)"), false);
  assert.equal(isHttpHref(null), false);

  assert.equal(isSafePublicHref("/fwq"), true);
  assert.equal(isSafePublicHref("https://a.example"), true);
  assert.equal(isSafePublicHref("javascript:alert(1)"), false);
  assert.equal(isSafePublicHref("//evil.example"), false);
});

void test("toAbsoluteHttpUrl resolves relative links and rejects unsafe protocols", () => {
  assert.equal(
    toAbsoluteHttpUrl("/fwq/posts/a", "https://fwqgo.com"),
    "https://fwqgo.com/fwq/posts/a",
  );
  assert.equal(
    toAbsoluteHttpUrl("https://other.example/x", "https://fwqgo.com"),
    "https://other.example/x",
  );
  assert.equal(toAbsoluteHttpUrl("javascript:alert(1)", "https://fwqgo.com"), null);
  assert.equal(toAbsoluteHttpUrl(null, "https://fwqgo.com"), null);
});

void test("decodeSlug and normalizeDecodedSlug decode safely", () => {
  assert.equal(decodeSlug("%E9%A6%99%E6%B8%AF"), "香港");
  assert.equal(decodeSlug("%E0%A4%A"), "%E0%A4%A"); // malformed sequence falls back
  assert.equal(normalizeDecodedSlug("  %E9%A6%99%E6%B8%AF "), "香港");
  assert.equal(normalizeDecodedSlug("   "), null);
  assert.equal(normalizeDecodedSlug(null), null);
});

void test("jsonLdScriptContent escapes characters that could break a script tag", () => {
  const rendered = jsonLdScriptContent({ name: "</script><b>", amp: "a&b" });
  assert.doesNotMatch(rendered, /<\/script>/);
  assert.match(rendered, /\\u003c\/script\\u003e/);
  assert.match(rendered, /a\\u0026b/);
});

void test("sanitizeFileName encodes the name while preserving the extension", () => {
  assert.equal(sanitizeFileName("香港 套餐.webp"), "%E9%A6%99%E6%B8%AF%20%E5%A5%97%E9%A4%90.webp");
  const long = `${"a".repeat(300)}.png`;
  const sanitized = sanitizeFileName(long);
  assert.ok(sanitized.endsWith(".png"));
  assert.ok(sanitized.length <= 200);
});

void test("isWithin24Hours only accepts recent past timestamps", () => {
  const now = new Date();
  assert.equal(isWithin24Hours(new Date(now.getTime() - 60_000)), true);
  assert.equal(
    isWithin24Hours(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
    false,
  );
  assert.equal(isWithin24Hours(new Date(now.getTime() + 60_000)), false);
});

void test("formatDate returns empty string for invalid dates", () => {
  assert.equal(formatDate("not-a-date"), "");
  assert.notEqual(formatDate("2026-07-14T00:00:00Z"), "");
});
