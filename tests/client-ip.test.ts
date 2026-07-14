import assert from "node:assert/strict";
import test from "node:test";

import { getTrustedClientIp } from "@fwqgo/core/client-ip";

function headers(values: Record<string, string>) {
  return new Headers(values);
}

void test("prefers the reverse proxy supplied real IP", () => {
  assert.equal(
    getTrustedClientIp(
      headers({
        "x-real-ip": "203.0.113.8",
        "x-forwarded-for": "198.51.100.4, 192.0.2.5",
      }),
    ),
    "203.0.113.8",
  );
});

void test("uses the proxy-adjacent valid forwarded address", () => {
  assert.equal(
    getTrustedClientIp(
      headers({ "x-forwarded-for": "not-an-ip, 198.51.100.4, 192.0.2.5" }),
    ),
    "192.0.2.5",
  );
});

void test("accepts IPv6 and rejects malformed header values", () => {
  assert.equal(
    getTrustedClientIp(headers({ "cf-connecting-ip": "2001:db8::8" })),
    "2001:db8::8",
  );
  assert.equal(
    getTrustedClientIp(headers({ "x-real-ip": "127.0.0.1:3000" })),
    null,
  );
});
