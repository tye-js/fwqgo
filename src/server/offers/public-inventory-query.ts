import "server-only";
import { cacheLife } from "next/cache";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import {
  aggregatePublicInventoryFacets,
  parsePublicInventoryFilters,
  publicInventorySorts,
  type PublicInventoryFilters,
  type PublicInventorySearchParams,
  type PublicInventorySort,
} from "@fwqgo/core/public-inventory-filters";
import { readDb } from "@fwqgo/db";
import {
  affServiceProviders,
  serverNetworkLines,
  serverOfferPrices,
  serverOfferTags,
  serverOffers,
  serverRegions,
} from "@fwqgo/db/schema";
import { ilikeContains } from "@/server/db/search";

const PAGE_SIZE = 30;

type InventoryCursor = {
  sort: PublicInventorySort;
  id: number;
  price?: string | null;
  date?: string;
};

export {
  parsePublicInventoryFilters,
  publicInventorySorts,
  type PublicInventoryFilters,
  type PublicInventorySearchParams,
  type PublicInventorySort,
};

function encodeCursor(cursor: InventoryCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string, sort: PublicInventorySort) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<InventoryCursor>;
    if (
      parsed.sort !== sort ||
      !Number.isInteger(parsed.id) ||
      (parsed.id ?? 0) <= 0
    ) {
      return null;
    }
    return parsed as InventoryCursor;
  } catch {
    return null;
  }
}

function publicOfferWhere(filters: PublicInventoryFilters) {
  const searchDocument = sql<string>`
    coalesce(${serverOffers.title}, '') || ' ' ||
    coalesce(${serverOffers.externalProductId}, '') || ' ' ||
    coalesce(${serverOffers.providerName}, '') || ' ' ||
    coalesce(${serverOffers.productGroup}, '') || ' ' ||
    coalesce(${serverOffers.region}, '') || ' ' ||
    coalesce(${serverOffers.lineType}, '') || ' ' ||
    coalesce(${serverOffers.cpu}, '') || ' ' ||
    coalesce(${serverOffers.memory}, '') || ' ' ||
    coalesce(${serverOffers.storage}, '') || ' ' ||
    coalesce(${serverOffers.bandwidth}, '') || ' ' ||
    coalesce(${serverOffers.traffic}, '') || ' ' ||
    coalesce(${serverOffers.promoCode}, '')
  `;
  const conditions: Array<SQL | undefined> = [
    eq(serverOffers.visible, true),
    sql`nullif(trim(${serverOffers.purchaseUrl}), '') is not null`,
    filters.stock === "all"
      ? undefined
      : eq(serverOffers.status, filters.stock),
    filters.check === "all"
      ? undefined
      : eq(serverOffers.checkStatus, filters.check),
    filters.provider === "all"
      ? undefined
      : or(
          eq(affServiceProviders.slug, filters.provider),
          sql`trim(${serverOffers.providerName}) = ${filters.provider}`,
        ),
    filters.group === "all"
      ? undefined
      : sql`trim(${serverOffers.productGroup}) = ${filters.group}`,
    filters.region === "all"
      ? undefined
      : or(
          eq(serverRegions.slug, filters.region),
          sql`trim(${serverOffers.region}) = ${filters.region}`,
        ),
    filters.line === "all"
      ? undefined
      : or(
          eq(serverNetworkLines.slug, filters.line),
          sql`trim(${serverOffers.lineType}) = ${filters.line}`,
        ),
    filters.feature === "all"
      ? undefined
      : sql`exists (
          select 1 from "server_offer_tags" as feature_tags
          where feature_tags."offerId" = ${serverOffers.id}
            and feature_tags."slug" = ${filters.feature}
        )`,
    filters.promo === "with"
      ? sql`nullif(trim(${serverOffers.promoCode}), '') is not null`
      : filters.promo === "without"
        ? sql`nullif(trim(${serverOffers.promoCode}), '') is null`
        : undefined,
    filters.minPrice === undefined
      ? undefined
      : sql`${serverOffers.monthlyPriceUsd} >= ${filters.minPrice}`,
    filters.maxPrice === undefined
      ? undefined
      : sql`${serverOffers.monthlyPriceUsd} <= ${filters.maxPrice}`,
  ];

  if (filters.query) {
    conditions.push(ilikeContains(searchDocument, filters.query));
  }

  return and(...conditions.filter((item): item is SQL => Boolean(item)));
}

function cursorWhere(filters: PublicInventoryFilters) {
  const cursor = decodeCursor(filters.cursor, filters.sort);
  if (!cursor) return undefined;

  if (filters.sort === "latest") {
    const date = cursor.date ? new Date(cursor.date) : null;
    if (!date || Number.isNaN(date.getTime())) return undefined;
    const effectiveDate = sql<Date>`coalesce(${serverOffers.updatedAt}, ${serverOffers.createdAt})`;
    return or(
      lt(effectiveDate, date),
      and(eq(effectiveDate, date), lt(serverOffers.id, cursor.id)),
    );
  }

  if (cursor.price == null) {
    return and(
      isNull(serverOffers.monthlyPriceUsd),
      filters.sort === "price-desc"
        ? lt(serverOffers.id, cursor.id)
        : gt(serverOffers.id, cursor.id),
    );
  }

  if (filters.sort === "price-desc") {
    return or(
      isNull(serverOffers.monthlyPriceUsd),
      lt(serverOffers.monthlyPriceUsd, cursor.price),
      and(
        eq(serverOffers.monthlyPriceUsd, cursor.price),
        lt(serverOffers.id, cursor.id),
      ),
    );
  }

  return or(
    isNull(serverOffers.monthlyPriceUsd),
    gt(serverOffers.monthlyPriceUsd, cursor.price),
    and(
      eq(serverOffers.monthlyPriceUsd, cursor.price),
      gt(serverOffers.id, cursor.id),
    ),
  );
}

function offerOrderBy(sort: PublicInventorySort) {
  if (sort === "latest") {
    return [
      desc(sql`coalesce(${serverOffers.updatedAt}, ${serverOffers.createdAt})`),
      desc(serverOffers.id),
    ];
  }
  if (sort === "price-desc") {
    return [
      asc(sql`${serverOffers.monthlyPriceUsd} is null`),
      desc(serverOffers.monthlyPriceUsd),
      desc(serverOffers.id),
    ];
  }
  return [
    asc(sql`${serverOffers.monthlyPriceUsd} is null`),
    asc(serverOffers.monthlyPriceUsd),
    asc(serverOffers.id),
  ];
}

const publicOfferSelection = {
  id: serverOffers.id,
  title: serverOffers.title,
  slug: serverOffers.slug,
  externalProductId: serverOffers.externalProductId,
  productGroup: serverOffers.productGroup,
  providerName: serverOffers.providerName,
  providerSlug: affServiceProviders.slug,
  productType: serverOffers.productType,
  cpu: serverOffers.cpu,
  memory: serverOffers.memory,
  storage: serverOffers.storage,
  bandwidth: serverOffers.bandwidth,
  traffic: serverOffers.traffic,
  region: serverOffers.region,
  regionSlug: serverRegions.slug,
  lineType: serverOffers.lineType,
  lineSlug: serverNetworkLines.slug,
  priceAmount: serverOffers.priceAmount,
  currency: serverOffers.currency,
  billingCycle: serverOffers.billingCycle,
  monthlyPriceUsd: serverOffers.monthlyPriceUsd,
  promoCode: serverOffers.promoCode,
  purchaseUrl: serverOffers.purchaseUrl,
  articleUrl: serverOffers.articleUrl,
  reviewUrl: serverOffers.reviewUrl,
  status: serverOffers.status,
  checkStatus: serverOffers.checkStatus,
  isStale: sql<boolean>`
    ${serverOffers.lastCheckedAt} is not null
    and ${serverOffers.lastCheckedAt} < current_timestamp - interval '24 hours'
  `,
  lastCheckedAt: serverOffers.lastCheckedAt,
  statusChangedAt: serverOffers.statusChangedAt,
  validUntil: serverOffers.validUntil,
  createdAt: serverOffers.createdAt,
  updatedAt: serverOffers.updatedAt,
};

export async function getPublicInventoryPage(filters: PublicInventoryFilters) {
  const baseWhere = publicOfferWhere(filters);
  const rowsWhere = and(baseWhere, cursorWhere(filters));
  const [rows, [totalRow]] = await Promise.all([
    readDb
      .select(publicOfferSelection)
      .from(serverOffers)
      .leftJoin(
        affServiceProviders,
        eq(serverOffers.providerId, affServiceProviders.id),
      )
      .leftJoin(serverRegions, eq(serverOffers.regionId, serverRegions.id))
      .leftJoin(
        serverNetworkLines,
        eq(serverOffers.lineId, serverNetworkLines.id),
      )
      .where(rowsWhere)
      .orderBy(...offerOrderBy(filters.sort))
      .limit(PAGE_SIZE + 1),
    readDb
      .select({ count: count() })
      .from(serverOffers)
      .leftJoin(
        affServiceProviders,
        eq(serverOffers.providerId, affServiceProviders.id),
      )
      .leftJoin(serverRegions, eq(serverOffers.regionId, serverRegions.id))
      .leftJoin(
        serverNetworkLines,
        eq(serverOffers.lineId, serverNetworkLines.id),
      )
      .where(baseWhere),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);
  const offerIds = items.map((item) => item.id);
  const [prices, tags] = offerIds.length
    ? await Promise.all([
        readDb
          .select({
            id: serverOfferPrices.id,
            offerId: serverOfferPrices.offerId,
            billingCycle: serverOfferPrices.billingCycle,
            termMonths: serverOfferPrices.termMonths,
            amount: serverOfferPrices.amount,
            originalAmount: serverOfferPrices.originalAmount,
            currency: serverOfferPrices.currency,
            monthlyPriceUsd: serverOfferPrices.monthlyPriceUsd,
            purchaseUrl: serverOfferPrices.purchaseUrl,
          })
          .from(serverOfferPrices)
          .where(
            and(
              inArray(serverOfferPrices.offerId, offerIds),
              eq(serverOfferPrices.active, true),
            ),
          )
          .orderBy(
            asc(serverOfferPrices.monthlyPriceUsd),
            asc(serverOfferPrices.id),
          ),
        readDb
          .select({
            offerId: serverOfferTags.offerId,
            slug: serverOfferTags.slug,
            label: serverOfferTags.label,
            kind: serverOfferTags.kind,
          })
          .from(serverOfferTags)
          .where(inArray(serverOfferTags.offerId, offerIds)),
      ])
    : [[], []];

  const enrichedItems = items.map((item) => ({
    ...item,
    prices: prices.filter((price) => price.offerId === item.id),
    tags: tags.filter((tag) => tag.offerId === item.id),
  }));
  const last = enrichedItems.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          sort: filters.sort,
          id: last.id,
          price: last.monthlyPriceUsd,
          date: (last.updatedAt ?? last.createdAt).toISOString(),
        })
      : null;

  return {
    items: enrichedItems,
    total: Number(totalRow?.count ?? 0),
    hasMore,
    nextCursor,
  };
}

export async function getPublicInventoryFacets() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3_600 });
  tagCache(cacheTags.serverOffers);

  const baseWhere = and(
    eq(serverOffers.visible, true),
    sql`nullif(trim(${serverOffers.purchaseUrl}), '') is not null`,
  );
  const providerKey = sql<string>`coalesce(
    nullif(trim(${affServiceProviders.slug}), ''),
    nullif(trim(${serverOffers.providerName}), '')
  )`;
  const providerLabel = sql<string>`coalesce(
    nullif(trim(${affServiceProviders.name}), ''),
    nullif(trim(${serverOffers.providerName}), ''),
    ${providerKey}
  )`;
  const regionKey = sql<string>`coalesce(
    nullif(trim(${serverRegions.slug}), ''),
    nullif(trim(${serverOffers.region}), '')
  )`;
  const regionLabel = sql<string>`coalesce(
    nullif(trim(${serverRegions.name}), ''),
    nullif(trim(${serverOffers.region}), ''),
    ${regionKey}
  )`;
  const lineKey = sql<string>`coalesce(
    nullif(trim(${serverNetworkLines.slug}), ''),
    nullif(trim(${serverOffers.lineType}), '')
  )`;
  const lineLabel = sql<string>`coalesce(
    nullif(trim(${serverNetworkLines.name}), ''),
    nullif(trim(${serverOffers.lineType}), ''),
    ${lineKey}
  )`;
  const groupKey = sql<string>`nullif(trim(${serverOffers.productGroup}), '')`;
  const [providerRows, regionRows, lineRows, groupRows, tagRows] =
    await Promise.all([
      readDb
        .select({
          key: providerKey,
          label: providerLabel,
          count: count(),
        })
        .from(serverOffers)
        .leftJoin(
          affServiceProviders,
          eq(serverOffers.providerId, affServiceProviders.id),
        )
        .where(and(baseWhere, sql`${providerKey} is not null`))
        .groupBy(providerKey, providerLabel)
        .orderBy(desc(count()), asc(providerLabel))
        .limit(500),
      readDb
        .select({
          key: regionKey,
          label: regionLabel,
          count: count(),
        })
        .from(serverOffers)
        .leftJoin(serverRegions, eq(serverOffers.regionId, serverRegions.id))
        .where(and(baseWhere, sql`${regionKey} is not null`))
        .groupBy(regionKey, regionLabel)
        .orderBy(desc(count()), asc(regionLabel))
        .limit(40),
      readDb
        .select({
          key: lineKey,
          label: lineLabel,
          count: count(),
        })
        .from(serverOffers)
        .leftJoin(
          serverNetworkLines,
          eq(serverOffers.lineId, serverNetworkLines.id),
        )
        .where(and(baseWhere, sql`${lineKey} is not null`))
        .groupBy(lineKey, lineLabel)
        .orderBy(desc(count()), asc(lineLabel))
        .limit(40),
      readDb
        .select({ name: groupKey, count: count() })
        .from(serverOffers)
        .where(and(baseWhere, sql`${groupKey} is not null`))
        .groupBy(groupKey)
        .orderBy(desc(count()), asc(groupKey))
        .limit(80),
      readDb
        .select({
          slug: serverOfferTags.slug,
          label: sql<string>`min(${serverOfferTags.label})`,
          count: count(),
        })
        .from(serverOfferTags)
        .innerJoin(serverOffers, eq(serverOfferTags.offerId, serverOffers.id))
        .where(baseWhere)
        .groupBy(serverOfferTags.slug)
        .orderBy(desc(count()), asc(serverOfferTags.slug))
        .limit(32),
    ]);

  return {
    providers: aggregatePublicInventoryFacets(
      providerRows.map((item) => ({
        key: item.key,
        label: item.label,
        count: Number(item.count),
      })),
      500,
    ),
    regions: aggregatePublicInventoryFacets(
      regionRows.map((item) => ({
        key: item.key,
        label: item.label,
        count: Number(item.count),
      })),
      40,
    ),
    lines: aggregatePublicInventoryFacets(
      lineRows.map((item) => ({
        key: item.key,
        label: item.label,
        count: Number(item.count),
      })),
      40,
    ),
    groups: aggregatePublicInventoryFacets(
      groupRows.map((item) => ({
        key: item.name,
        label: item.name,
        count: Number(item.count),
      })),
      80,
    ),
    features: aggregatePublicInventoryFacets(
      tagRows.map((item) => ({
        key: item.slug,
        label: item.label,
        count: Number(item.count),
      })),
      32,
    ),
  };
}

export type PublicInventoryPage = Awaited<
  ReturnType<typeof getPublicInventoryPage>
>;
export type PublicInventoryItem = PublicInventoryPage["items"][number];
export type PublicInventoryFacets = Awaited<
  ReturnType<typeof getPublicInventoryFacets>
>;
