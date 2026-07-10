import { sql, type AnyColumn, type SQL } from "drizzle-orm";

function escapeLikePattern(value: string) {
  return value.replace(/[!%_]/g, "!$&");
}

export function ilikeContains(column: AnyColumn, value: string): SQL {
  return sql`${column} ILIKE ${`%${escapeLikePattern(value)}%`} ESCAPE '!'`;
}
