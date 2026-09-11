import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { getReleaseBuildConfig } from "./build-release.mjs";

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
import {
  parseProviderMonitorConfig,
  sanitizeProviderMonitorDraftConfig,
} from "@fwqgo/core/provider-monitor-config";
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
    resolveDatabaseUrls({
      NODE_ENV: "production",
      SKIP_ENV_VALIDATION: "1",
      npm_lifecycle_event: "build:web",
    }).read,
  );
  for (const skip of ["1", "0", "false", undefined]) {
    const runtime = {
      ...fixture,
      SKIP_ENV_VALIDATION: skip,
      npm_lifecycle_event: "start:web",
    };
    assert.throws(() => resolveDatabaseUrls(runtime), /READ_DATABASE_URL/);
    assert.throws(
      () => resolveDatabaseUrls({ ...runtime, READ_DATABASE_URL: urls.read }),
      /ANALYTICS_DATABASE_URL/,
    );
  }
  assert.throws(
    () =>
      resolveDatabaseUrls({ NODE_ENV: "production", SKIP_ENV_VALIDATION: "1" }),
    /DATABASE_URL/,
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
  for (const skip of ["0", "false", "true", ""]) {
    assert.equal(
      isDatabaseFreeBuild({
        SKIP_ENV_VALIDATION: skip,
        npm_lifecycle_event: "build:web",
      }),
      false,
    );
  }
});

void test("environment schema validation cannot be disabled by runtime or false-valued flags", () => {
  for (const [lifecycle, skip, expectedStatus] of [
    ["build:web", "1", 0],
    ["build:web", "0", 1],
    ["build:web", "false", 1],
    ["build:web", "", 1],
    ["start:web", "1", 1],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      ["-e", "import('./src/env.js').catch(() => { process.exitCode = 1; });"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production",
          NEXT_PHASE: "",
          DATABASE_URL: "not-a-database-url",
          READ_DATABASE_URL: "",
          SKIP_ENV_VALIDATION: skip,
          npm_lifecycle_event: lifecycle,
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(
      result.status,
      expectedStatus,
      `${lifecycle} with SKIP_ENV_VALIDATION=${skip}`,
    );
  }
});

type App = {
  name: string;
  env: Record<string, string | undefined>;
  filter_env: string[];
};

function runtimeApps(
  fileEnv: Record<string, string>,
  launcherEnv: Record<string, string> = {},
) {
  const fixtureModule = { exports: {} as { apps: App[] } };
  vm.runInNewContext(fs.readFileSync("ecosystem.config.cjs", "utf8"), {
    module: fixtureModule,
    URL,
    __dirname: "/fixture",
    process: { env: launcherEnv },
    require: (name: string) => {
      if (name === "node:fs")
        return {
          existsSync: () => true,
          readFileSync: () =>
            Object.entries(fileEnv)
              .map(([key, value]) => `${key}=${value}`)
              .join("\n"),
        };
      if (name === "node:path") return path;
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
  });
  return fixtureModule.exports.apps;
}

const databaseFixture = {
  DATABASE_URL: "postgresql://writer:fixture@localhost/db",
  CMS_DATABASE_URL: "postgresql://writer:fixture@localhost/db",
  READ_DATABASE_URL: "postgresql://reader:fixture@localhost/db",
  ANALYTICS_DATABASE_URL: "postgresql://analytics:fixture@localhost/db",
};

void test("Web receives no CMS secrets even when the PM2 launcher has them", () => {
  const apps = runtimeApps(
    {},
    {
      ...databaseFixture,
      SECRET_ENCRYPTION_KEYS: "fixture-key",
      CMS_BASIC_AUTH_PASSWORD: "fixture-password",
      CLOUDFLARE_CACHE_PURGE_TOKEN: "fixture-purge",
      WEB_PORT: "3300",
      SKIP_ENV_VALIDATION: "1",
    },
  );
  const web = apps.find((app) => app.name === "fwqgo-web")!;
  const cms = apps.find((app) => app.name === "fwqgo-cms")!;
  assert.equal(web.env.SECRET_ENCRYPTION_KEYS, "");
  assert.equal(web.env.CMS_BASIC_AUTH_PASSWORD, "");
  assert.equal(cms.env.SECRET_ENCRYPTION_KEYS, "fixture-key");
  assert.equal(web.env.CLOUDFLARE_CACHE_PURGE_TOKEN, "fixture-purge");
  assert.equal(cms.env.WEB_PORT, "3300");
  assert.equal(web.env.HOSTNAME, "127.0.0.1");
  assert.equal(web.env.ENABLE_CMS_BACKGROUND_WORKERS, "false");
  assert.equal(cms.env.ENABLE_CMS_BACKGROUND_WORKERS, undefined);
  assert.ok(web.filter_env.includes("SECRET_ENCRYPTION_"));
  for (const app of apps) assert.equal(app.env.SKIP_ENV_VALIDATION, "");
});

void test("PM2 preserves file-only CMS tuning and explicit launcher overrides", () => {
  const tuning = {
    AI_REWRITE_TIMEOUT_MS: "600000",
    ADMIN_BACKGROUND_JOB_CONCURRENCY: "4",
    ADMIN_BACKGROUND_JOB_RETENTION_DAYS: "30",
  };
  const fileEnv = {
    ...databaseFixture,
    ...tuning,
    SECRET_ENCRYPTION_KEYS: "file-fixture-key",
    UNDECLARED_SECRET: "do-not-forward",
    SKIP_ENV_VALIDATION: "1",
  };
  const launcherEnvironments: Record<string, string>[] = [
    {},
    { AI_REWRITE_TIMEOUT_MS: "900000" },
  ];
  for (const launcherEnv of launcherEnvironments) {
    const apps = runtimeApps(fileEnv, launcherEnv);
    const cms = apps.find((app) => app.name === "fwqgo-cms")!;
    const web = apps.find((app) => app.name === "fwqgo-web")!;
    for (const [key, value] of Object.entries({ ...tuning, ...launcherEnv })) {
      assert.equal(cms.env[key], value);
      assert.equal(web.env[key], "");
    }
    assert.equal(cms.env.SECRET_ENCRYPTION_KEYS, "file-fixture-key");
    for (const app of apps) {
      assert.equal(app.env.UNDECLARED_SECRET, undefined);
      assert.equal(app.env.SKIP_ENV_VALIDATION, "");
    }
  }
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

void test("provider pattern eviction survives sustained churn beyond the old WASM heap limit", () => {
  for (let cycle = 0; cycle < 100; cycle++) {
    for (let index = 0; index < 129; index++) {
      assert.equal(
        matchProviderFieldPattern(`LABEL${index}`, `^(label${index})$`, 1),
        `LABEL${index}`,
      );
    }
  }
  assert.equal(
    matchProviderFieldPattern("new rule", "(new rule)", 1),
    "new rule",
  );
});

void test("provider patterns preserve JS escapes and optional capture behavior", () => {
  assert.equal(
    matchProviderFieldPattern("月付 12.50/月", "(?<price>\\d+\\.\\d+)", 1),
    "12.50",
  );
  assert.equal(matchProviderFieldPattern("héllo", "h\\u00e9llo", 0), "héllo");
  assert.equal(matchProviderFieldPattern("a", "(a)(b)?", 2), "");
  assert.equal(matchProviderFieldPattern("a", "(a)", 8), "");
  assert.throws(
    () => matchProviderFieldPattern("a", "a".repeat(201), 0),
    /200/,
  );
});

void test("monitor drafts retain collection rules without headers or unknown secret fields", () => {
  const input = JSON.stringify({
    itemSelector: ".offer",
    fields: { price: { selector: ".amount", pattern: "([0-9.]+)", group: 1 } },
    defaults: { currency: "EUR" },
    headers: {
      Authorization: "fixture-secret",
      "X-Custom-Credential": "fixture-secret",
      Cookie: "fixture-secret",
    },
    apiKey: "fixture-secret",
  });
  const output = sanitizeProviderMonitorDraftConfig(input, "html");
  const config = parseProviderMonitorConfig(JSON.parse(output), "html");
  assert.equal(config.itemSelector, ".offer");
  assert.equal(config.fields.price.selector, ".amount");
  assert.equal(config.fields.price.pattern, "([0-9.]+)");
  assert.equal(config.defaults.currency, "EUR");
  assert.deepEqual(config.headers, {});
  assert.doesNotMatch(output, /fixture-secret|apiKey/);
  assert.equal(sanitizeProviderMonitorDraftConfig(output, "html"), output);
  const jsonOutput = sanitizeProviderMonitorDraftConfig(
    JSON.stringify({ itemsPath: "offers.items", priceField: "cost" }),
    "json",
  );
  const jsonConfig = parseProviderMonitorConfig(JSON.parse(jsonOutput), "json");
  assert.equal(jsonConfig.itemsPath, "offers.items");
  assert.equal(jsonConfig.priceField, "cost");
  for (const value of [
    "",
    "null",
    "[]",
    '{"headers":{"Authorization":"fixture-secret"',
  ]) {
    assert.equal(sanitizeProviderMonitorDraftConfig(value, "html"), "");
  }
});

void test("RSC authorization shares one lookup per request and rechecks revoked sessions", () => {
  const result = spawnSync(
    "node",
    ["--conditions=react-server", "--import", "tsx", "--input-type=module"],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...databaseFixture },
      encoding: "utf8",
      timeout: 10000,
      input: String.raw`
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { Writable } from "node:stream";
import { createElement } from "react";
import { renderToPipeableStream } from "next/dist/compiled/react-server-dom-turbopack/server.node.js";
const fixture = { reads: 0, cookies: 0, session: { id: "fixture-session", userId: "fixture-user", user: { id: "fixture-user", username: "admin", role: "admin", status: "active" } } };
globalThis.sessionCacheFixture = fixture;
const modules = {
  "next/headers": 'export async function cookies(){globalThis.sessionCacheFixture.cookies++;return {get:()=>({value:"fixture-session"})};}',
  "@fwqgo/db": 'export const db={select(){const f=globalThis.sessionCacheFixture;f.reads++;const chain={from:()=>chain,innerJoin:()=>chain,where:()=>chain,limit:async()=>f.session?[f.session]:[]};return chain;}};',
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const source = modules[specifier];
  return source ? {url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true} : nextResolve(specifier, context);
} });
const { requireAdminSession, isUnauthorizedError } = await import("./packages/auth/session.ts");
const outcomes = [];
async function View() {
  outcomes.push(await Promise.all(Array.from({length: 7}, async () => {
    try { await requireAdminSession(); return true; }
    catch (error) { if (!isUnauthorizedError(error)) throw error; return false; }
  })));
  return null;
}
async function render() {
  await new Promise((resolve, reject) => {
    const destination = new Writable({write(_chunk, _encoding, done) {done();}});
    destination.on("finish", resolve).on("error", reject);
    renderToPipeableStream(createElement(View), {}, {onError: reject}).pipe(destination);
  });
}
await render();
assert.equal(fixture.reads, 1);
assert.equal(fixture.cookies, 1);
assert.deepEqual(outcomes[0], Array(7).fill(true));
fixture.session = null;
await render();
assert.equal(fixture.reads, 2);
assert.equal(fixture.cookies, 2);
assert.deepEqual(outcomes[1], Array(7).fill(false));
console.log("session-request-cache-ok");
`,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /session-request-cache-ok/);
});

void test("outbound short links preserve Chinese and English labels without re-reading existing links", () => {
  const result = spawnSync("node", ["--import", "tsx", "--input-type=module"], {
    cwd: process.cwd(),
    env: { ...process.env, ...databaseFixture },
    encoding: "utf8",
    timeout: 10000,
    input: String.raw`
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
const databaseModule = [
  'const provider = { officialUrl: "https://merchant.example", affUrl: "https://merchant.example/?aff=42", affParam: "aff", affValue: "42" };',
  'export const db = { select() { return {from(table) {',
  'if (table[Symbol.for("drizzle:Name")] === "aff_service_providers") return Promise.resolve([provider]);',
  'return {where: () => ({limit: async () => [{id: 1, slug: "safe123"}]})};',
  '}}; }};',
  'export const readDb = { select() { throw new Error("Existing short links must not query the database"); } };',
].join(" ");
registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier === "@fwqgo/db" ? {url: "data:text/javascript," + encodeURIComponent(databaseModule), shortCircuit: true} : nextResolve(specifier, context);
} });
const { shortenMarkdownOutboundLinks } = await import("./src/server/links/outbound-short-link.ts");
for (const label of ["链接", "**点击链接**", "购买套餐", "link", "click here", "learn more", "Buy VPS"]) {
  const existing = "[" + label + "](/go/safe123)";
  assert.equal(await shortenMarkdownOutboundLinks(existing), existing);
  assert.equal(await shortenMarkdownOutboundLinks("[" + label + "](https://merchant.example/product?pid=4&aff=old)"), existing);
}
console.log("outbound-labels-ok");
`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /outbound-labels-ok/);
});

void test("release builds use read-only credentials and forward server loopback URLs without changing deployment configuration", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    const original = {
      ...databaseFixture,
      READ_DATABASE_URL: `postgresql://reader:fixture%2Fpass@${host}:5433/fwqgo?sslmode=require`,
      SKIP_ENV_VALIDATION: "1",
    };
    const config = getReleaseBuildConfig(original);
    assert.equal(config.forwardTarget, `${host}:5433`);
    const forwarded = new URL(config.databaseUrl);
    assert.equal(forwarded.hostname, "127.0.0.1");
    assert.equal(forwarded.port, "55433");
    assert.equal(forwarded.username, "reader");
    assert.equal(forwarded.password, "fixture%2Fpass");
    assert.equal(forwarded.searchParams.get("sslmode"), "require");
    for (const key of [
      "DATABASE_URL",
      "CMS_DATABASE_URL",
      "READ_DATABASE_URL",
      "ANALYTICS_DATABASE_URL",
    ] as const) {
      assert.equal(config.buildEnvironment[key], config.databaseUrl);
    }
    assert.equal(config.buildEnvironment.SKIP_ENV_VALIDATION, undefined);
    assert.equal(
      config.buildEnvironment.ENABLE_CMS_BACKGROUND_WORKERS,
      "false",
    );
    assert.equal(original.CMS_DATABASE_URL, databaseFixture.CMS_DATABASE_URL);
    assert.equal(
      original.READ_DATABASE_URL,
      `postgresql://reader:fixture%2Fpass@${host}:5433/fwqgo?sslmode=require`,
    );
    assert.equal(original.SKIP_ENV_VALIDATION, "1");
  }
  const directUrl = "postgresql://reader:fixture@db.example/fwqgo";
  const direct = getReleaseBuildConfig({ READ_DATABASE_URL: directUrl });
  assert.equal(direct.forwardTarget, null);
  assert.equal(direct.databaseUrl, directUrl);
  assert.throws(() => getReleaseBuildConfig({}), /READ_DATABASE_URL/);
  assert.throws(
    () => getReleaseBuildConfig({ READ_DATABASE_URL: "https://db.example" }),
    /PostgreSQL/,
  );
});

void test("release runner closes its temporary tunnel on success and build, database or SSH failures", () => {
  for (const scenario of [
    "success",
    "build-failure",
    "database-failure",
    "tunnel-failure",
  ]) {
    const result = spawnSync("node", ["--input-type=module"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...databaseFixture,
        RELEASE_BUILD_TEST_SCENARIO: scenario,
      },
      encoding: "utf8",
      timeout: 10000,
      input: String.raw`
import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
const fixture = { calls: [], scenario: process.env.RELEASE_BUILD_TEST_SCENARIO };
globalThis.releaseBuildFixture = fixture;
const modules = {
  "node:fs": 'export default {mkdtempSync(){globalThis.releaseBuildFixture.calls.push("directory");return "/fixture/build-db";},rmSync(directory){if(directory!=="/fixture/build-db")throw new Error("unexpected cleanup");globalThis.releaseBuildFixture.calls.push("directory.close");}};',
  "node:child_process": [
    'import assert from "node:assert/strict";',
    'export function spawnSync(command,args,options){const f=globalThis.releaseBuildFixture;',
    'if(command==="ssh"){const closing=args.includes("-O");f.calls.push(closing?"tunnel.close":"tunnel.open");',
    'if(!closing){assert.ok(args.includes("StrictHostKeyChecking=yes"));assert.ok(args.includes("ExitOnForwardFailure=yes"));assert.ok(args.includes("127.0.0.1:55433:localhost:5432"));}',
    'return {status:!closing&&f.scenario==="tunnel-failure"?1:0};}',
    'assert.equal(command,"bun");f.calls.push("build");assert.deepEqual(args,["run","build"]);',
    'assert.equal(options.env.SKIP_ENV_VALIDATION,undefined);',
    'for(const key of ["DATABASE_URL","READ_DATABASE_URL","CMS_DATABASE_URL","ANALYTICS_DATABASE_URL"]){assert.equal(new URL(options.env[key]).username,"reader");assert.equal(new URL(options.env[key]).port,"55433");}',
    'return {status:f.scenario==="build-failure"?1:0};}',
  ].join(" "),
  "postgres": 'export default function(url){const f=globalThis.releaseBuildFixture;if(new URL(url).username!=="reader")throw new Error("writer used");const sql=async()=>{f.calls.push("database.probe");if(f.scenario==="database-failure")throw new Error("fixture database down");};sql.end=async()=>{f.calls.push("database.close");};return sql;}',
};
registerHooks({resolve(specifier,context,nextResolve){const source=modules[specifier];return source?{url:"data:text/javascript,"+encodeURIComponent(source),shortCircuit:true}:nextResolve(specifier,context);}});
Object.assign(process.env,{READ_DATABASE_URL:"postgresql://reader:fixture@localhost/fwqgo",DEPLOY_HOST:"deploy.example",DEPLOY_USER:"deployer",SKIP_ENV_VALIDATION:"1"});
process.argv[1]=path.resolve("scripts/build-release.mjs");
await import("./scripts/build-release.mjs");
const expected=fixture.scenario==="tunnel-failure"
  ? ["directory","tunnel.open","directory.close"]
  : ["directory","tunnel.open","database.probe","database.close",...(fixture.scenario==="database-failure"?[]:["build"]),"tunnel.close","directory.close"];
assert.deepEqual(fixture.calls,expected);
assert.equal(process.exitCode ?? 0,fixture.scenario==="success"?0:1);
assert.equal(process.env.SKIP_ENV_VALIDATION,"1");
assert.equal(process.env.READ_DATABASE_URL,"postgresql://reader:fixture@localhost/fwqgo");
process.exitCode=0;
console.log("release-runner-cleanup-ok");
`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /release-runner-cleanup-ok/);
  }
});
