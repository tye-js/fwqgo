import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";

import { writeDb } from "@fwqgo/db";

export async function GET() {
  await connection();

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
      throw new Error("CMS database role is missing required posts privileges");
    }
    return NextResponse.json(
      { ok: true, service: "cms" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("CMS health check failed:", error);
    return NextResponse.json(
      { ok: false, service: "cms" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
