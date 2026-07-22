import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { readMigrationManifest } from "./migration-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.production");

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(
    "ERROR: DATABASE_URL is not set in environment or .env.production",
  );
  process.exit(1);
}

console.log("Connecting to PostgreSQL to run migrations...");
const sql = postgres(dbUrl, {
  max: 1,
  connection: { TimeZone: "UTC" },
});
const db = drizzle(sql);

const migrationsFolder = path.resolve(__dirname, "../drizzle");
const manifest = readMigrationManifest(migrationsFolder);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readLatestAppliedMigration() {
  try {
    const rows = await sql`
      select "hash", "created_at"
      from "drizzle"."__drizzle_migrations"
      order by "created_at" desc
      limit 1
    `;
    /** @type {unknown} */
    const row = rows[0];
    if (!row) return null;
    if (!isRecord(row)) {
      throw new Error("Latest migration record has an invalid shape");
    }

    const hash = row.hash;
    const createdAt = Number(row.created_at);
    if (typeof hash !== "string" || !Number.isSafeInteger(createdAt)) {
      throw new Error("Latest migration record has invalid values");
    }

    return { hash, createdAt };
  } catch (error) {
    const errorCode = isRecord(error) ? error.code : null;
    if (errorCode === "42P01" || errorCode === "3F000") {
      return null;
    }
    throw error;
  }
}

try {
  const before = await readLatestAppliedMigration();
  const beforeCreatedAt = before?.createdAt ?? null;
  if (beforeCreatedAt !== null && beforeCreatedAt > manifest.latest.createdAt) {
    throw new Error(
      `Database migration timestamp ${beforeCreatedAt} is newer than release ${manifest.latest.createdAt}; refusing schema downgrade`,
    );
  }

  await migrate(db, { migrationsFolder });

  const applied = await readLatestAppliedMigration();
  if (!applied) {
    throw new Error(
      "Migration command completed but no migration record exists",
    );
  }
  if (applied.createdAt !== manifest.latest.createdAt) {
    throw new Error(
      `Latest applied migration timestamp ${applied.createdAt} does not match release ${manifest.latest.createdAt}`,
    );
  }
  if (applied.hash !== manifest.latest.hash) {
    throw new Error(
      `Latest applied migration hash does not match ${manifest.latest.fileName}`,
    );
  }

  console.log("Production database migrations completed successfully!");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
