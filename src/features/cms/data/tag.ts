import { and, count, desc, eq, ilike, not, or, type SQL } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { tags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { priceLikeTagSearchTerms } from "@/features/cms/lib/tag-price-filter";
import { ilikeContains } from "@/server/db/search";

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

function getNonPriceTagCondition() {
  const priceConditions: SQL[] = priceLikeTagSearchTerms.flatMap((term) => [
    ilike(tags.name, `%${term}%`),
    ilike(tags.slug, `%${term}%`),
  ]);
  const priceCondition = or(...priceConditions);

  return priceCondition ? not(priceCondition) : undefined;
}

function getTagSearchCondition(query?: string) {
  const normalizedQuery = query?.trim().slice(0, 160);
  if (!normalizedQuery) return undefined;

  const conditions: SQL[] = [
    ilikeContains(tags.name, normalizedQuery),
    ilikeContains(tags.slug, normalizedQuery),
    ilikeContains(tags.description, normalizedQuery),
    ilikeContains(tags.keywords, normalizedQuery),
    ilikeContains(tags.enName, normalizedQuery),
    ilikeContains(tags.enSlug, normalizedQuery),
    ilikeContains(tags.enDescription, normalizedQuery),
    ilikeContains(tags.enKeywords, normalizedQuery),
  ];

  if (/^[1-9]\d*$/.test(normalizedQuery)) {
    const id = Number(normalizedQuery);
    if (Number.isSafeInteger(id)) {
      conditions.unshift(eq(tags.id, id));
    }
  }

  return or(...conditions);
}

export async function getAdminTagList({
  page = 1,
  pageSize = 20,
  query,
}: {
  page?: number;
  pageSize?: number;
  query?: string;
}) {
  await requireAdminSession();

  const pagination = normalizePagination(page, pageSize);

  const result = await db
    .select()
    .from(tags)
    .where(and(getNonPriceTagCondition(), getTagSearchCondition(query)))
    .orderBy(desc(tags.id))
    .offset(pagination.offset)
    .limit(pagination.pageSize);

  return { data: result };
}

export async function getAdminTagCount(query?: string) {
  await requireAdminSession();

  const [result] = await db
    .select({ count: count() })
    .from(tags)
    .where(and(getNonPriceTagCondition(), getTagSearchCondition(query)));
  return { data: result?.count ?? 0 };
}
