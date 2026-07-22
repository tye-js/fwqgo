import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function databaseUrl(name: string, fallback?: string) {
  const value = process.env[name]?.trim() ?? fallback;
  if (value) return value;
  if (process.env.SKIP_ENV_VALIDATION) {
    return "postgresql://build:build@127.0.0.1:5432/fwqgo_build";
  }
  throw new Error(`${name} is required`);
}

const primaryDatabaseUrl = databaseUrl(
  "DATABASE_URL",
  process.env.READ_DATABASE_URL,
);

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  writeConn: postgres.Sql | undefined;
  readConn: postgres.Sql | undefined;
  analyticsConn: postgres.Sql | undefined;
};

function withCredentials(
  baseUrl: string,
  input: {
    username?: string;
    password?: string;
  },
) {
  const url = new URL(baseUrl);

  if (input.username) {
    url.username = input.username;
  }

  if (input.password) {
    url.password = input.password;
  }

  return url.toString();
}

function resolveWriteDatabaseUrl() {
  if (process.env.CMS_DATABASE_URL) {
    return databaseUrl("CMS_DATABASE_URL");
  }

  if (!process.env.CMS_PASSWORD && !process.env.CMS_USERNAME) {
    return primaryDatabaseUrl;
  }

  const baseUrl = new URL(primaryDatabaseUrl);

  return withCredentials(primaryDatabaseUrl, {
    username: process.env.CMS_USERNAME ?? baseUrl.username,
    password: process.env.CMS_PASSWORD,
  });
}

function resolveReadDatabaseUrl() {
  if (process.env.READ_DATABASE_URL) {
    return databaseUrl("READ_DATABASE_URL");
  }

  if (!process.env.READ_PASSWORD && !process.env.READ_USERNAME) {
    return resolveWriteDatabaseUrl();
  }

  const baseUrl = new URL(primaryDatabaseUrl);

  return withCredentials(primaryDatabaseUrl, {
    username: process.env.READ_USERNAME ?? `${baseUrl.username}_readonly`,
    password: process.env.READ_PASSWORD,
  });
}

function resolveAnalyticsDatabaseUrl() {
  return process.env.ANALYTICS_DATABASE_URL
    ? databaseUrl("ANALYTICS_DATABASE_URL")
    : resolveWriteDatabaseUrl();
}

function isBuildProcess() {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event?.startsWith("build")
  );
}

function resolveMaxConnections() {
  const fallback = isBuildProcess() ? 1 : 4;
  const parsed = Number.parseInt(
    process.env.DB_MAX_CONNECTIONS ?? String(fallback),
    10,
  );

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const connectionOptions = {
  connect_timeout: 10,
  idle_timeout: 20,
  max: resolveMaxConnections(),
  connection: { TimeZone: "UTC" },
};

const writeConn =
  globalForDb.writeConn ?? postgres(resolveWriteDatabaseUrl(), connectionOptions);
const readConn =
  globalForDb.readConn ?? postgres(resolveReadDatabaseUrl(), connectionOptions);
const analyticsConn =
  globalForDb.analyticsConn ??
  postgres(resolveAnalyticsDatabaseUrl(), { ...connectionOptions, max: 1 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.writeConn = writeConn;
  globalForDb.readConn = readConn;
  globalForDb.analyticsConn = analyticsConn;
}

export const writeDb = drizzle(writeConn, { schema });
export const readDb = drizzle(readConn, { schema });
export const analyticsDb = drizzle(analyticsConn, { schema });
export const db = writeDb;
