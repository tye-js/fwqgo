import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";

import { readDb } from "@fwqgo/db";

export async function GET() {
  await connection();

  try {
    const result = await readDb.execute<{ canRead: boolean }>(
      sql`select has_table_privilege(current_user, 'posts', 'SELECT') as "canRead"`,
    );
    if (!result[0]?.canRead) {
      throw new Error("Public database role cannot read posts");
    }
    return NextResponse.json(
      { ok: true, service: "web" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Web health check failed:", error);
    return NextResponse.json(
      { ok: false, service: "web" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
