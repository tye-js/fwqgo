import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

void test("runtime environment merge replaces allowed keys and preserves user config", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fwqgo-env-"));
  const target = path.join(directory, ".env.production");
  const overrides = path.join(directory, "overrides.env");
  fs.writeFileSync(
    target,
    "DATABASE_URL=postgresql://write\nWEB_REVALIDATION_SECRET=old\nCUSTOM=value\n",
  );
  fs.writeFileSync(
    overrides,
    "WEB_REVALIDATION_SECRET=new-secret-value\nANALYTICS_DATABASE_URL=postgresql://analytics\nDATABASE_URL=must-not-change\n",
  );

  execFileSync(
    process.execPath,
    ["scripts/merge-runtime-env.mjs", target, overrides],
    { cwd: process.cwd(), stdio: "pipe" },
  );

  const result = fs.readFileSync(target, "utf8");
  assert.match(result, /DATABASE_URL=postgresql:\/\/write/);
  assert.match(result, /WEB_REVALIDATION_SECRET=new-secret-value/);
  assert.match(result, /ANALYTICS_DATABASE_URL=postgresql:\/\/analytics/);
  assert.match(result, /CUSTOM=value/);
  assert.equal(result.includes("must-not-change"), false);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});
