import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import postgres from "postgres";

const databaseUrl = process.env.SECURITY_MIGRATION_SMOKE_DATABASE_URL;
if (!databaseUrl)
  throw new Error("SECURITY_MIGRATION_SMOKE_DATABASE_URL is required");
const parsed = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
  !parsed.pathname.endsWith("_smoke")
) {
  throw new Error(
    "Security migration smoke tests require a localhost database ending in _smoke",
  );
}
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
const schema = `security_smoke_${randomUUID().replaceAll("-", "")}`;
let created = false;
try {
  await sql.unsafe(`create schema "${schema}"`);
  created = true;
  await sql.unsafe(`set search_path to "${schema}"`);
  await sql`create table users (id text primary key, username text not null)`;
  await sql`create table sessions (id text primary key, "userId" text references users(id))`;
  await sql`insert into users values ('existing-admin', 'existing_admin')`;
  await sql`insert into sessions values ('existing-session', 'existing-admin')`;
  for (const migration of [
    "0069_skinny_tomas.sql",
    "0070_default_new_users_to_viewer.sql",
  ]) {
    for (const statement of fs
      .readFileSync(`drizzle/${migration}`, "utf8")
      .split("--> statement-breakpoint")) {
      if (statement.trim()) await sql.unsafe(statement);
    }
  }
  await sql`insert into users (id, username) values ('new-user', 'new_user')`;
  const rows = await sql`select id, role, status from users order by id`;
  assert.deepEqual(
    rows.map(({ id, role, status }) => ({
      id: String(id),
      role: String(role),
      status: String(status),
    })),
    [
      { id: "existing-admin", role: "admin", status: "active" },
      { id: "new-user", role: "viewer", status: "active" },
    ],
  );
  assert.equal((await sql`select id from sessions`).length, 1);
  await assert.rejects(
    sql`insert into users (id, username, role) values ('invalid', 'invalid', 'superuser')`,
  );
  console.log(
    "Security migrations verified: existing admin and session preserved, new users default to viewer",
  );
} finally {
  try {
    if (created) await sql.unsafe(`drop schema "${schema}" cascade`);
  } finally {
    await sql.end();
  }
}
