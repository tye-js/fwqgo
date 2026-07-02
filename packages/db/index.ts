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

const writeConn =
  globalForDb.writeConn ?? postgres(resolveWriteDatabaseUrl());
const readConn =
  globalForDb.readConn ?? postgres(resolveReadDatabaseUrl());

if (env.NODE_ENV !== "production") {
  globalForDb.writeConn = writeConn;
  globalForDb.readConn = readConn;
}

export const writeDb = drizzle(writeConn, { schema });
export const readDb = drizzle(readConn, { schema });
export const db = writeDb;
