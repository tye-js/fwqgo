import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDatabaseUrls } from "./connection-config";
import { isBuildProcess } from "@fwqgo/core/build-verification";

const databaseUrls = resolveDatabaseUrls(process.env);

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  writeConn: postgres.Sql | undefined;
  readConn: postgres.Sql | undefined;
  analyticsConn: postgres.Sql | undefined;
};

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
  globalForDb.writeConn ?? postgres(databaseUrls.write, connectionOptions);
const readConn =
  globalForDb.readConn ?? postgres(databaseUrls.read, connectionOptions);
const analyticsConn =
  globalForDb.analyticsConn ??
  postgres(databaseUrls.analytics, { ...connectionOptions, max: 1 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.writeConn = writeConn;
  globalForDb.readConn = readConn;
  globalForDb.analyticsConn = analyticsConn;
}

export const writeDb = drizzle(writeConn, { schema });
export const readDb = drizzle(readConn, { schema });
export const analyticsDb = drizzle(analyticsConn, { schema });
export const db = writeDb;
