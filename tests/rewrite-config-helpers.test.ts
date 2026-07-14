import assert from "node:assert/strict";
import test from "node:test";

import { maskApiKey, normalizeBaseUrl } from "@fwqgo/ai/rewrite-config";

void test("normalizeBaseUrl trims whitespace and strips trailing slashes", () => {
  assert.equal(normalizeBaseUrl("  https://api.example.com/  "), "https://api.example.com");
  assert.equal(normalizeBaseUrl("https://api.example.com/v1///"), "https://api.example.com/v1");
  assert.equal(normalizeBaseUrl("https://api.example.com"), "https://api.example.com");
});

void test("maskApiKey hides the secret while keeping a recognizable preview", () => {
  assert.equal(maskApiKey(null), null);
  // Short keys are fully masked so no meaningful prefix leaks.
  assert.equal(maskApiKey("short"), "********");
  assert.equal(maskApiKey("12345678"), "********");
  // Longer keys reveal only the first and last four characters.
  assert.equal(maskApiKey("sk-abcdef1234567890"), "sk-a...7890");
});
