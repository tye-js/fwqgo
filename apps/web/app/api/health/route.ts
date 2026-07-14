import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";

import { readDb } from "@fwqgo/db";
import { createAsyncTtlLoader } from "@fwqgo/core/async-ttl-loader";
import {
  attachRequestId,
  getRequestId,
  structuredLog,
} from "@fwqgo/core/structured-log";

const checkDatabaseHealth = createAsyncTtlLoader(
  async () => {
    try {
      const result = await readDb.execute<{ canRead: boolean }>(
        sql`select has_table_privilege(current_user, 'posts', 'SELECT') as "canRead"`,
      );
      if (!result[0]?.canRead) {
        throw new Error("Public database role cannot read posts");
      }
      return true;
    } catch (error) {
      structuredLog("error", "web.health.database_failed", { error });
      return false;
    }
  },
  { ttlMs: 3_000 },
);

export async function GET(request: Request) {
  await connection();
  const requestId = getRequestId(request.headers);

  const ok = await checkDatabaseHealth();
  if (ok) {
    return attachRequestId(
      NextResponse.json(
        { ok: true, service: "web" },
        { headers: { "Cache-Control": "no-store" } },
      ),
      requestId,
    );
  }

  return attachRequestId(
    NextResponse.json(
      { ok: false, service: "web" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    ),
    requestId,
  );
}
