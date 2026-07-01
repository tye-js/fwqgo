import { count, desc } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { tags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";

export { findBestTagMatch } from "@/features/public/data/tag";

export async function getAdminTagList({
  page = 1,
  pageSize = 20,
}: {
  page?: number;
  pageSize?: number;
}) {
  await requireAdminSession();

  const result = await db
    .select()
    .from(tags)
    .orderBy(desc(tags.id))
    .offset((page - 1) * pageSize)
    .limit(pageSize);

  return { data: result };
}

export async function getAdminTagCount() {
  await requireAdminSession();

  const [result] = await db.select({ count: count() }).from(tags);
  return { data: result?.count ?? 0 };
}
