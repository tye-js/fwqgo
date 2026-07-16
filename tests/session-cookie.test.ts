import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import {
  clearCmsSessionCookies,
  getCmsSessionCookieName,
  getCmsSessionCookieOptions,
  getCmsSessionId,
} from "@fwqgo/auth/session-cookie";

function withNodeEnv(value: string | undefined, run: () => void) {
  const original = process.env.NODE_ENV;
  try {
    if (value === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      (process.env as Record<string, string | undefined>).NODE_ENV = value;
    }
    run();
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = original;
  }
}

void test("cookie name switches between production __Host- and development names", () => {
  withNodeEnv("production", () => {
    assert.equal(getCmsSessionCookieName(), "__Host-fwqgo-cms-session");
  });
  withNodeEnv("development", () => {
    assert.equal(getCmsSessionCookieName(), "fwqgo-cms-session");
  });
});

void test("getCmsSessionId reads the active cookie name and returns null when absent", () => {
  withNodeEnv("development", () => {
    const reader = {
      get(name: string) {
        return name === "fwqgo-cms-session" ? { value: "sid-123" } : undefined;
      },
    };
    assert.equal(getCmsSessionId(reader), "sid-123");

    const empty = { get: () => undefined };
    assert.equal(getCmsSessionId(empty), null);
  });
});

void test("cookie options are hardened, and Secure follows the environment", () => {
  const expires = new Date("2030-01-01T00:00:00Z");

  withNodeEnv("production", () => {
    const options = getCmsSessionCookieOptions(expires);
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/");
    assert.equal(options.priority, "high");
    assert.equal(options.expires, expires);
  });

  withNodeEnv("development", () => {
    assert.equal(getCmsSessionCookieOptions(expires).secure, false);
  });
});

void test("clearCmsSessionCookies expires the active and legacy cookies", () => {
  withNodeEnv("development", () => {
    const response = NextResponse.next();
    clearCmsSessionCookies(response);

    const setCookies = response.headers.getSetCookie();
    const joined = setCookies.join("\n");

    // Active dev cookie plus legacy session_id variants are expired.
    assert.ok(setCookies.some((c) => c.startsWith("fwqgo-cms-session=")));
    assert.ok(setCookies.some((c) => c.startsWith("session_id=")));
    assert.match(joined, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    assert.match(joined, /Max-Age=0/);
    assert.match(joined, /HttpOnly/);
  });
});

void test("clearCmsSessionCookies in production also clears domain-scoped legacy cookies", () => {
  withNodeEnv("production", () => {
    const response = NextResponse.next();
    clearCmsSessionCookies(response);

    const joined = response.headers.getSetCookie().join("\n");
    assert.match(joined, /__Host-fwqgo-cms-session=/);
    assert.match(joined, /Domain=\.fwqgo\.com/);
    assert.match(joined, /Secure/);
  });
});
