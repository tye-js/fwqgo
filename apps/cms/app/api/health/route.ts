import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";

import { writeDb } from "@fwqgo/db";
import { createAsyncTtlLoader } from "@fwqgo/core/async-ttl-loader";
import {
  attachRequestId,
  getRequestId,
  structuredLog,
} from "@fwqgo/core/structured-log";

const checkDatabaseHealth = createAsyncTtlLoader(
  async () => {
    try {
      const result = await writeDb.execute<{
        canRead: boolean;
        canInsert: boolean;
        canUpdate: boolean;
        canDelete: boolean;
      }>(sql`
        select
          has_table_privilege(current_user, 'posts', 'SELECT') as "canRead",
          has_table_privilege(current_user, 'posts', 'INSERT') as "canInsert",
          has_table_privilege(current_user, 'posts', 'UPDATE') as "canUpdate",
          has_table_privilege(current_user, 'posts', 'DELETE') as "canDelete"
      `);
      const privileges = result[0];
      if (
        !privileges?.canRead ||
        !privileges.canInsert ||
        !privileges.canUpdate ||
        !privileges.canDelete
      ) {
        throw new Error(
          "CMS database role is missing required posts privileges",
        );
      }
      return true;
    } catch (error) {
      structuredLog("error", "cms.health.database_failed", { error });
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
        { ok: true, service: "cms" },
        { headers: { "Cache-Control": "no-store" } },
      ),
      requestId,
    );
  }

  return attachRequestId(
    NextResponse.json(
      { ok: false, service: "cms" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    ),
    requestId,
  );
}
