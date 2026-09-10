import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
/** @type {unknown} */
const loaded = require(path.resolve(process.argv[2] ?? "ecosystem.config.cjs"));
const config =
  /** @type {{ apps: Array<{ name: string, env: Record<string, string | undefined> }> }} */ (
    loaded
  );
const web = config.apps.find((app) => app.name === "fwqgo-web");
const cms = config.apps.find((app) => app.name === "fwqgo-cms");
assert.ok(web && cms, "Both runtime applications must be configured");
for (const app of [web, cms]) {
  assert.equal(
    app.env.TRUST_PROXY_HEADERS,
    "true",
    `${app.name}: verify Nginx X-Real-IP handling and set TRUST_PROXY_HEADERS=true before release`,
  );
  assert.equal(
    app.env.HOSTNAME,
    "127.0.0.1",
    `${app.name}: bind to loopback behind Nginx`,
  );
  assert.ok(
    app.env.READ_DATABASE_URL,
    `${app.name}: READ_DATABASE_URL is required`,
  );
  assert.ok(
    app.env.ANALYTICS_DATABASE_URL,
    `${app.name}: ANALYTICS_DATABASE_URL is required`,
  );
}
for (const key of [
  "SECRET_ENCRYPTION_KEYS",
  "SECRET_ENCRYPTION_KEY",
  "SECRET_ENCRYPTION_ACTIVE_KEY_ID",
  "CMS_DATABASE_URL",
  "CMS_PASSWORD",
  "CMS_BASIC_AUTH_PASSWORD",
]) {
  assert.ok(web.env[key] === "", `Web must not receive ${key}`);
}
assert.ok(
  web.env.DATABASE_URL === web.env.READ_DATABASE_URL,
  "Web's primary database must be its read connection",
);
assert.notEqual(
  cms.env.ENABLE_BROWSER_SCRAPING,
  "true",
  "Browser scraping must run in a separately isolated worker, not the CMS process",
);
console.log(
  "Runtime configuration verified: separated database roles, CMS keys isolated, trusted ingress configured",
);
