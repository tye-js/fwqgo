import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CMS_SESSION_TTL_MS,
  getCmsSessionExpiresAt,
} from "@fwqgo/auth/session-store";

const loginRouteSource = fs.readFileSync(
  "src/features/cms/routes/api/auth/login/route.ts",
  "utf8",
);
const sessionStoreSource = fs.readFileSync(
  "packages/auth/session-store.ts",
  "utf8",
);
const schemaSource = fs.readFileSync("packages/db/schema.ts", "utf8");

void test("CMS session expiry uses a stable 30 day TTL", () => {
  const now = new Date("2026-07-16T00:00:00.000Z");

  assert.equal(CMS_SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(
    getCmsSessionExpiresAt(now).toISOString(),
    "2026-08-15T00:00:00.000Z",
  );
  assert.equal(now.toISOString(), "2026-07-16T00:00:00.000Z");
});

void test("login delegates transactional session lifecycle management", () => {
  assert.match(loginRouteSource, /createCmsSession\(user\.id\)/);
  assert.doesNotMatch(loginRouteSource, /\.insert\(sessions\)/);
  assert.match(sessionStoreSource, /db\.transaction\(async \(tx\)/);
  assert.match(
    sessionStoreSource,
    /tx\.delete\(sessions\)\.where\(lte\(sessions\.expires, now\)\)/,
  );

  const deleteOffset = sessionStoreSource.indexOf(".delete(sessions)");
  const insertOffset = sessionStoreSource.indexOf(".insert(sessions)");
  assert.ok(deleteOffset >= 0);
  assert.ok(insertOffset > deleteOffset);
});

void test("session expiry index is declared in schema and migration", () => {
  assert.match(
    schemaSource,
    /expiresIdx:\s*index\("sessions_expires_idx"\)\.on\(table\.expires\)/,
  );

  const migrationFiles = fs
    .readdirSync("drizzle")
    .filter((fileName) => /^\d{4}_.+\.sql$/.test(fileName));
  const matchingMigrations = migrationFiles.filter((fileName) =>
    fs
      .readFileSync(path.join("drizzle", fileName), "utf8")
      .includes('CREATE INDEX "sessions_expires_idx"'),
  );

  assert.equal(matchingMigrations.length, 1);
  const migrationSql = fs.readFileSync(
    path.join("drizzle", matchingMigrations[0]!),
    "utf8",
  );
  assert.match(
    migrationSql,
    /CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree \("expires"\)/,
  );
});
