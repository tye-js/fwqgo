import { count, desc } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { tags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";

export { findBestTagMatch } from "@/features/public/data/tag";

function normalizePagination(page: number, pageSize: number) {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedPageSize =
    Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

export async function getAdminTagList({
  page = 1,
  pageSize = 20,
}: {
  page?: number;
  pageSize?: number;
}) {
  await requireAdminSession();

  const pagination = normalizePagination(page, pageSize);

  const result = await db
    .select()
    .from(tags)
    .orderBy(desc(tags.id))
    .offset(pagination.offset)
    .limit(pagination.pageSize);

  return { data: result };
}

export async function getAdminTagCount() {
  await requireAdminSession();

  const [result] = await db.select({ count: count() }).from(tags);
  return { data: result?.count ?? 0 };
}
