import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDatabaseUrls } from "./connection-config";

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
  // Builds render many independent pages. Article routes issue their reads with
  // `Promise.all`, so a pool of one serialises every statement of a page and
  // multiplies the wall time that can trip Next's prerender cache-fill budget.
  // Keep the build pool aligned with the runtime pool instead.
  //
  // A single public render fans out four to eight statements (`/servers` issues
  // four, an article page up to eight), and each app runs one PM2 process, so a
  // pool of four is exhausted by a single request in flight and head-of-line
  // blocks every other request behind it. Ten leaves room for a few concurrent
  // renders per process while staying well under `max_connections`.
  const fallback = 10;
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
  // postgres.js forwards every `connection` key as a startup parameter, so these
  // are applied to each pooled connection. Without a statement timeout a single
  // slow statement pins one of the pool slots indefinitely; with the pool sized
  // above, a handful of stuck statements starves the whole app.
  connection: {
    TimeZone: "UTC",
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 10_000,
  },
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
