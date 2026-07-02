import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  writeConn: postgres.Sql | undefined;
  readConn: postgres.Sql | undefined;
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
  if (env.CMS_DATABASE_URL) {
    return env.CMS_DATABASE_URL;
  }

  if (!env.CMS_PASSWORD && !env.CMS_USERNAME) {
    return env.DATABASE_URL;
  }

  const baseUrl = new URL(env.DATABASE_URL);

  return withCredentials(env.DATABASE_URL, {
    username: env.CMS_USERNAME ?? baseUrl.username,
    password: env.CMS_PASSWORD,
  });
}

function resolveReadDatabaseUrl() {
  if (env.READ_DATABASE_URL) {
    return env.READ_DATABASE_URL;
  }

  if (!env.READ_PASSWORD && !env.READ_USERNAME) {
    return resolveWriteDatabaseUrl();
  }

  const baseUrl = new URL(env.DATABASE_URL);

  return withCredentials(env.DATABASE_URL, {
    username: env.READ_USERNAME ?? `${baseUrl.username}_readonly`,
    password: env.READ_PASSWORD,
  });
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
};

const writeConn =
  globalForDb.writeConn ?? postgres(resolveWriteDatabaseUrl(), connectionOptions);
const readConn =
  globalForDb.readConn ?? postgres(resolveReadDatabaseUrl(), connectionOptions);

if (env.NODE_ENV !== "production") {
  globalForDb.writeConn = writeConn;
  globalForDb.readConn = readConn;
}

export const writeDb = drizzle(writeConn, { schema });
export const readDb = drizzle(readConn, { schema });
export const db = writeDb;
