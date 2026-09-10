import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { getAuthRateLimitKeys } from "@fwqgo/auth/rate-limit";
import { BoundedAttemptTracker } from "@fwqgo/core/bounded-attempt-tracker";
import {
  readRequestBodyWithLimit,
  readRequestFormDataWithLimit,
  RequestBodyTooLargeError,
} from "@fwqgo/core/bounded-request-body";
import { getTrustedClientIp } from "@fwqgo/core/client-ip";
import { isDatabaseFreeBuild } from "@fwqgo/core/build-verification";
import {
  fetchPublicHttpUrlOnce,
  parsePublicHttpUrl,
} from "@fwqgo/core/network-url";
import { fetchPinnedHttpUrl } from "@fwqgo/core/pinned-http";
import { PostViewRateLimiter } from "@fwqgo/core/post-view-rate-limit";
import { getSecurityHeaders } from "@fwqgo/core/security-headers.mjs";
import { resolveWebRevalidationUrl } from "@fwqgo/core/web-revalidation-url";
import { resolveDatabaseUrls } from "@fwqgo/db/connection-config";
import { parseProviderMonitorConfig } from "@fwqgo/core/provider-monitor-config";
import {
  matchProviderFieldPattern,
  validateProviderFieldPatterns,
} from "@/server/offers/provider-field-pattern";

void test("the installed HTTP transport pins DNS and retains the original host on Bun and Node", async () => {
  const hosts: string[] = [];
  const server = createServer((request, response) => {
    hosts.push(request.headers.host ?? "");
    response.setHeader("set-cookie", ["first=1; Path=/", "second=2; Path=/"]);
    if (request.url === "/redirect")
      response.writeHead(302, { location: "http://127.0.0.1/private" }).end();
    else response.end("pinned response");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    // .invalid cannot resolve. Only the supplied lookup can reach this fixture.
    const origin = `http://security-probe.invalid:${address.port}`;
    const approved = [{ address: "127.0.0.1", family: 4 }];
    const response = await fetchPinnedHttpUrl(new URL(origin), approved, {
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(await response.text(), "pinned response");
    assert.equal(response.url, `${origin}/`);
    assert.deepEqual(response.headers.getSetCookie(), [
      "first=1; Path=/",
      "second=2; Path=/",
    ]);
    const redirect = await fetchPinnedHttpUrl(
      new URL(`${origin}/redirect`),
      approved,
      { signal: AbortSignal.timeout(3000) },
    );
    assert.equal(redirect.status, 302);
    await redirect.body?.cancel();
    assert.deepEqual(hosts, [
      `security-probe.invalid:${address.port}`,
      `security-probe.invalid:${address.port}`,
    ]);
    await assert.rejects(
      fetchPublicHttpUrlOnce(`http://127.0.0.1:${address.port}`),
      /不安全/,
    );
    assert.equal(hosts.length, 2);
  } finally {
    server.closeAllConnections();
    // Bun may stop the listener as part of closeAllConnections().
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
});

void test("URL validation covers canonical IPv6, embedded IPv4, userinfo and controls", () => {
  for (const url of [
    "http://[0:0:0:0:0:0:0:1]/",
    "http://[::10.0.0.1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[64:ff9b::127.0.0.1]/",
    "http://[2001::1]/",
    "http://[2002:7f00:1::]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://localhost./",
    "http://127.1/",
    "https://user:password@example.com/",
    "https://example.com/\\admin",
    "https://example.com/\nadmin",
  ])
    assert.equal(parsePublicHttpUrl(url), null, url);
  assert.ok(parsePublicHttpUrl("https://[2606:4700:4700::1111]/"));
  assert.ok(parsePublicHttpUrl("https://example.com/path?x=1"));
});

function withProductionHeaders(trust: string | undefined, action: () => void) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS,
  };
  Object.assign(process.env, { NODE_ENV: "production" });
  if (trust === undefined) delete process.env.TRUST_PROXY_HEADERS;
  else process.env.TRUST_PROXY_HEADERS = trust;
  try {
    action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

void test("missing IPs cannot lock unrelated accounts or bypass account throttling", () => {
  withProductionHeaders(undefined, () => {
    const attacker = new Headers({ "x-real-ip": "192.0.2.10" });
    const other = new Headers({ "x-real-ip": "198.51.100.20" });
    const limiter = new BoundedAttemptTracker({
      maxAttempts: 8,
      windowMs: 900000,
      lockMs: 900000,
      maxEntries: 100,
    });
    for (let attempt = 0; attempt < 8; attempt++)
      limiter.recordAttempt(getAuthRateLimitKeys(attacker, "wrong_user"), 1000);
    assert.equal(
      limiter.getRetryAfterSeconds(
        getAuthRateLimitKeys(other, "real_admin"),
        1000,
      ),
      0,
    );
    assert.equal(
      limiter.getRetryAfterSeconds(
        getAuthRateLimitKeys(other, "wrong_user"),
        1000,
      ),
      900,
    );
  });
  withProductionHeaders("true", () => {
    assert.equal(
      getTrustedClientIp(
        new Headers({
          "x-forwarded-for": "192.0.2.10",
          "cf-connecting-ip": "192.0.2.20",
        }),
      ),
      null,
    );
    assert.equal(
      getTrustedClientIp(
        new Headers({
          "x-real-ip": "192.0.2.30",
          "x-forwarded-for": "192.0.2.10",
        }),
      ),
      "192.0.2.30",
    );
  });
});

void test("analytics refuses unidentified requests and releases failed write claims", () => {
  const limiter = new PostViewRateLimiter(1000, 10);
  assert.equal(limiter.claim(null, "article", 1000), false);
  const claim = limiter.claim("192.0.2.10", "article", 1000);
  assert.equal(typeof claim, "string");
  assert.equal(limiter.claim("192.0.2.10", "article", 1001), false);
  if (claim) limiter.release(claim);
  assert.ok(limiter.claim("192.0.2.10", "article", 1002));
  assert.ok(limiter.claim("192.0.2.20", "article", 1002));
  assert.ok(limiter.claim("192.0.2.10", "article", 2002));
});

void test("multipart parsing preserves files and caps the full body without a length header", async () => {
  const form = new FormData();
  form.set(
    "file",
    new File(["image-bytes"], "image.webp", { type: "image/webp" }),
  );
  form.set("caption", "测试");
  const request = new Request("https://cms.example.com/api/upload", {
    method: "POST",
    body: form,
  });
  const exactSize = (await request.clone().arrayBuffer()).byteLength;
  const parsed = await readRequestFormDataWithLimit(request.clone(), exactSize);
  const file = parsed.get("file");
  assert.ok(file instanceof File);
  assert.equal(await file.text(), "image-bytes");
  assert.equal(parsed.get("caption"), "测试");
  await assert.rejects(
    readRequestFormDataWithLimit(request, exactSize - 1),
    RequestBodyTooLargeError,
  );
  await assert.rejects(
    readRequestBodyWithLimit(
      new Request("https://cms.example.com", {
        method: "POST",
        body: "too-large",
        headers: { "content-length": "1" },
      }),
      4,
    ),
    RequestBodyTooLargeError,
  );
});

void test("oversized streaming uploads are cancelled before all chunks are consumed", async () => {
  let chunks = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull(controller) {
        chunks++;
        controller.enqueue(new Uint8Array(12));
        if (chunks === 100) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    readRequestBodyWithLimit({ body, headers: new Headers() }, 20),
    RequestBodyTooLargeError,
  );
  assert.equal(cancelled, true);
  assert.equal(chunks, 2);
});

void test("production database clients never fall back to the writer", () => {
  const fixture = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://writer:fixture@127.0.0.1/db",
  };
  assert.throws(() => resolveDatabaseUrls(fixture), /READ_DATABASE_URL/);
  assert.throws(
    () =>
      resolveDatabaseUrls({
        ...fixture,
        READ_DATABASE_URL: "postgresql://reader:fixture@127.0.0.1/db",
      }),
    /ANALYTICS_DATABASE_URL/,
  );
  const urls = resolveDatabaseUrls({
    ...fixture,
    READ_DATABASE_URL: "postgresql://reader:fixture@127.0.0.1/db",
    ANALYTICS_DATABASE_URL: "postgresql://analytics:fixture@127.0.0.1/db",
  });
  assert.equal(new URL(urls.read).username, "reader");
  assert.equal(new URL(urls.analytics).username, "analytics");
  assert.ok(
    resolveDatabaseUrls({ NODE_ENV: "production", SKIP_ENV_VALIDATION: "1" })
      .read,
  );
});

void test("database-free defaults are restricted to explicit local build phases", () => {
  assert.equal(
    isDatabaseFreeBuild({
      SKIP_ENV_VALIDATION: "1",
      NEXT_PHASE: "phase-production-build",
    }),
    true,
  );
  assert.equal(
    isDatabaseFreeBuild({
      SKIP_ENV_VALIDATION: "1",
      npm_lifecycle_event: "build:web",
    }),
    true,
  );
  assert.equal(
    isDatabaseFreeBuild({
      SKIP_ENV_VALIDATION: "1",
      npm_lifecycle_event: "start:web",
    }),
    false,
  );
  assert.equal(isDatabaseFreeBuild({ SKIP_ENV_VALIDATION: "1" }), false);
  assert.equal(
    isDatabaseFreeBuild({ NEXT_PHASE: "phase-production-build" }),
    false,
  );
});

void test("Web receives no CMS secrets even when the PM2 launcher has them", () => {
  type App = {
    name: string;
    env: Record<string, string | undefined>;
    filter_env: string[];
  };
  const fixtureModule = { exports: {} as { apps: App[] } };
  vm.runInNewContext(fs.readFileSync("ecosystem.config.cjs", "utf8"), {
    module: fixtureModule,
    URL,
    __dirname: "/fixture",
    process: {
      env: {
        DATABASE_URL: "postgresql://writer:fixture@localhost/db",
        READ_DATABASE_URL: "postgresql://reader:fixture@localhost/db",
        ANALYTICS_DATABASE_URL: "postgresql://analytics:fixture@localhost/db",
        SECRET_ENCRYPTION_KEYS: "fixture-key",
        CMS_BASIC_AUTH_PASSWORD: "fixture-password",
        CLOUDFLARE_CACHE_PURGE_TOKEN: "fixture-purge",
        WEB_PORT: "3300",
      },
    },
    require: (name: string) => {
      if (name === "node:fs") return { existsSync: () => false };
      if (name === "node:path") return path;
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
  });
  const web = fixtureModule.exports.apps.find(
    (app) => app.name === "fwqgo-web",
  )!;
  const cms = fixtureModule.exports.apps.find(
    (app) => app.name === "fwqgo-cms",
  )!;
  assert.equal(web.env.SECRET_ENCRYPTION_KEYS, "");
  assert.equal(web.env.CMS_BASIC_AUTH_PASSWORD, "");
  assert.equal(cms.env.SECRET_ENCRYPTION_KEYS, "fixture-key");
  assert.equal(web.env.CLOUDFLARE_CACHE_PURGE_TOKEN, "fixture-purge");
  assert.equal(cms.env.WEB_PORT, "3300");
  assert.equal(web.env.HOSTNAME, "127.0.0.1");
  assert.ok(web.filter_env.includes("SECRET_ENCRYPTION_"));
});

void test("CSP permits CMS object URL previews and keeps development on HTTP", () => {
  const production = new Map(
    getSecurityHeaders({ cms: true, production: true }).map(
      ({ key, value }) => [key, value],
    ),
  );
  const development = new Map(
    getSecurityHeaders({ cms: true, production: false }).map(
      ({ key, value }) => [key, value],
    ),
  );
  assert.match(production.get("Content-Security-Policy")!, /img-src[^;]*blob:/);
  assert.match(
    production.get("Content-Security-Policy")!,
    /frame-ancestors 'none'/,
  );
  assert.doesNotMatch(
    production.get("Content-Security-Policy")!,
    /unsafe-eval/,
  );
  assert.doesNotMatch(
    development.get("Content-Security-Policy")!,
    /upgrade-insecure-requests/,
  );
  assert.equal(development.has("Strict-Transport-Security"), false);
});

void test("revalidation secrets can only target the configured Web service", () => {
  assert.equal(
    resolveWebRevalidationUrl({ WEB_PORT: "3300" }),
    "http://127.0.0.1:3300/api/internal/revalidate",
  );
  assert.equal(
    resolveWebRevalidationUrl({
      WEB_REVALIDATION_URL: "http://[::1]:3000/api/internal/revalidate",
    }),
    "http://[::1]:3000/api/internal/revalidate",
  );
  assert.equal(
    resolveWebRevalidationUrl({
      WEB_REVALIDATION_URL: "https://fwqgo.com/api/internal/revalidate",
    }),
    "https://fwqgo.com/api/internal/revalidate",
  );
  for (const url of [
    "https://attacker.example/api/internal/revalidate",
    "http://127.0.0.1:3100/api/internal/revalidate",
    "https://user:password@fwqgo.com/api/internal/revalidate",
    "https://fwqgo.com/api/internal/revalidate?next=other",
  ]) {
    assert.throws(
      () => resolveWebRevalidationUrl({ WEB_REVALIDATION_URL: url }),
      /WEB_REVALIDATION_URL/,
    );
  }
});

void test("provider regexes use linear matching and reject unsupported syntax at save time", () => {
  assert.equal(
    matchProviderFieldPattern(
      "Price: $12.50/month",
      "([0-9]+(?:\\.[0-9]+)?)",
      1,
    ),
    "12.50",
  );
  const config = parseProviderMonitorConfig(
    { fields: { title: { pattern: "^(a|aa)+$" } } },
    "html",
  );
  validateProviderFieldPatterns(config);
  const started = performance.now();
  assert.equal(
    matchProviderFieldPattern("a".repeat(32000) + "!", "^(a|aa)+$", 1),
    "",
  );
  assert.ok(
    performance.now() - started < 2000,
    "adversarial input must not cause catastrophic backtracking",
  );
  for (const pattern of ["(a)\\1", "a(?=b)", "(?<=a)b"]) {
    assert.throws(
      () =>
        validateProviderFieldPatterns(
          parseProviderMonitorConfig(
            { fields: { title: { pattern } } },
            "html",
          ),
        ),
      /RE2/,
    );
  }
  assert.throws(
    () => matchProviderFieldPattern("a".repeat(65537), "a", 0),
    /64 KB/,
  );
});
