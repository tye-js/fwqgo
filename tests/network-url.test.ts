import assert from "node:assert/strict";
import test from "node:test";

import {
  isBlockedNetworkHostname,
  parsePublicHttpUrl,
  requirePublicHttpUrl,
} from "@fwqgo/core/network-url";

void test("blocks local, private, link-local and documentation IPv4 ranges", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.1",
    "203.0.113.10",
  ]) {
    assert.equal(isBlockedNetworkHostname(host), true, host);
  }
});

void test("blocks loopback, private and mapped IPv6 addresses", () => {
  for (const host of ["::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isBlockedNetworkHostname(host), true, host);
  }
});

void test("accepts public HTTP URLs and resolves relative URLs against a public base", () => {
  assert.equal(
    parsePublicHttpUrl("https://www.example.com/article")?.hostname,
    "www.example.com",
  );
  assert.equal(
    parsePublicHttpUrl("/article", "https://www.example.com")?.toString(),
    "https://www.example.com/article",
  );
});

void test("rejects unsupported protocols and internal hostnames", () => {
  assert.equal(parsePublicHttpUrl("file:///etc/passwd"), null);
  assert.equal(parsePublicHttpUrl("http://service.internal/admin"), null);
  assert.throws(() => requirePublicHttpUrl("http://127.0.0.1/admin"), /不安全/);
});
