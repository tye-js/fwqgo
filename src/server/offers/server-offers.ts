import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import {
  getLatestDateValue,
  parseDateValue,
  type DateValue,
} from "@fwqgo/core/date-value";
import {
  calculateMonthlyPriceUsd,
  getServerOfferTermMonths,
  normalizeServerOfferBillingCycle,
  parseServerOfferBandwidthMbps,
  parseServerOfferMemoryMb,
  parseServerOfferStorageGb,
  parseServerOfferTrafficGb,
} from "@fwqgo/core/server-offer-price";
import {
  isServerOfferKind,
  type ServerOfferKind,
} from "@fwqgo/core/server-offer-kind";
import { cacheTags, revalidateSiteContent, tagCache } from "@fwqgo/cache/tags";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheLife, unstable_cache } from "next/cache";
import { db, readDb } from "@fwqgo/db";
import {
  affServiceProviders,
  posts,
  providerMonitors,
  serverNetworkLines,
  serverOfferChecks,
  serverOfferPrices,
  serverOfferSources,
  serverOffers,
  serverRegions,
} from "@fwqgo/db/schema";
import { ilikeContains } from "@/server/db/search";

export const offerStatuses = [
  "in_stock",
  "out_of_stock",
  "restocking",
  "discontinued",
  "preorder",
] as const;

export type OfferStatus = (typeof offerStatuses)[number];

export const offerStatusLabels: Record<OfferStatus, string> = {
  in_stock: "有货",
  out_of_stock: "没货",
  restocking: "补货",
  discontinued: "停售",
  preorder: "预售",
};

export const offerReviewStatuses = [
  "pending",
  "reviewed",
  "needs_fix",
  "duplicate",
  "merged",
] as const;

export type OfferReviewStatus = (typeof offerReviewStatuses)[number];

export const MIN_INDEXABLE_SERVER_COLLECTION_OFFERS = 5;

export type OfferTopicSlug = "hong-kong" | "united-states" | "cheap-vps";

export const offerTopics: Array<{
  slug: OfferTopicSlug;
  title: string;
  seoTitle: string;
  h1: string;
  shortTitle: string;
  description: string;
  intro: string;
  keywords: string[];
  faq: Array<{ question: string; answer: string }>;
  filters: {
    regions?: string[];
    maxMonthlyUsd?: number;
  };
}> = [
  {
    slug: "hong-kong",
    title: "香港服务器",
    seoTitle: "香港服务器优惠套餐对比：CN2、CMI、BGP VPS 与独立服务器",
    h1: "香港服务器优惠套餐对比",
    shortTitle: "香港",
    description:
      "集中筛选香港 VPS、香港云服务器和香港独立服务器，重点关注 CN2、CMI、BGP、低延迟和建站场景。",
    intro:
      "香港服务器适合面向中国大陆、东南亚和跨境业务的低延迟访问场景。这里优先整理价格、配置、线路、优惠码和购买入口，方便快速比较 CN2、CMI、BGP 等线路。",
    keywords: ["香港", "HK", "Hong Kong", "CN2", "CMI"],
    faq: [
      {
        question: "香港服务器适合哪些网站？",
        answer:
          "香港服务器适合外贸站、企业官网、跨境业务、API 服务和需要兼顾大陆访问速度的项目。",
      },
      {
        question: "香港 VPS 选择 CN2 还是 CMI？",
        answer:
          "CN2 通常适合电信优化，CMI 更偏移动线路优化，实际选择应结合访客运营商、带宽和预算。",
      },
    ],
    filters: {
      regions: ["香港", "Hong Kong", "HK"],
    },
  },
  {
    slug: "united-states",
    title: "美国服务器",
    seoTitle: "美国服务器优惠套餐对比：洛杉矶、圣何塞 VPS 与独立服务器",
    h1: "美国服务器优惠套餐对比",
    shortTitle: "美国",
    description:
      "集中筛选美国 VPS、美国云服务器和美国独立服务器，适合外贸建站、跨境业务和大带宽需求。",
    intro:
      "美国服务器覆盖机房多、带宽资源丰富，适合外贸建站、海外业务、下载分发和测试环境。这里把文章中的价格、地区、线路和购买链接集中整理，方便快速筛选。",
    keywords: ["美国", "US", "USA", "United States", "洛杉矶", "圣何塞"],
    faq: [
      {
        question: "美国服务器适合国内访问吗？",
        answer:
          "美国服务器到国内访问延迟通常高于香港，建议优先选择洛杉矶、圣何塞等西海岸机房和优化线路。",
      },
      {
        question: "美国 VPS 的优势是什么？",
        answer:
          "美国 VPS 通常价格低、带宽大、商家选择多，适合外贸站、开发测试和海外用户访问。",
      },
    ],
    filters: {
      regions: ["美国", "US", "USA", "United States", "洛杉矶", "圣何塞"],
    },
  },
  {
    slug: "cheap-vps",
    title: "便宜 VPS",
    seoTitle: "便宜 VPS 优惠套餐对比：低价月付 VPS 与入门云服务器",
    h1: "便宜 VPS 优惠套餐对比",
    shortTitle: "便宜 VPS",
    description:
      "集中筛选低价 VPS 套餐，优先展示月付价格较低、适合测试、建站和轻量业务的服务器。",
    intro:
      "便宜 VPS 更适合轻量建站、学习测试、代理工具和临时项目。这里按价格优先整理低价套餐，同时保留配置、地区、流量和优惠码，避免只看价格忽略资源限制。",
    keywords: ["便宜", "低价", "cheap", "优惠", "特价"],
    faq: [
      {
        question: "便宜 VPS 可以长期建站吗？",
        answer:
          "可以，但要关注 CPU 限制、内存、硬盘、流量和商家稳定性，低价套餐更适合轻量站点或测试用途。",
      },
      {
        question: "低价 VPS 购买前要看什么？",
        answer:
          "建议重点看续费价格、退款政策、线路、流量限制、是否缺货以及优惠码是否仍然有效。",
      },
    ],
    filters: {
      maxMonthlyUsd: 8,
    },
  },
];

function publicPurchasableOfferBaseWhere() {
  return and(
    eq(serverOffers.visible, true),
    isNotNull(serverOffers.priceAmount),
    sql`nullif(trim(${serverOffers.purchaseUrl}), '') is not null`,
  );
}

async function syncPrimaryOfferPrice(input: {
  offerId: number;
  priceAmount: string | null | undefined;
  originalPriceAmount?: string | null;
  currency: string | null | undefined;
  billingCycle: string | null | undefined;
  purchaseUrl: string | null | undefined;
  validUntil?: Date | null;
}) {
  const monthlyPriceUsd = calculateMonthlyPriceUsd({
    amount: input.priceAmount,
    currency: input.currency,
    billingCycle: input.billingCycle,
  });
  if (monthlyPriceUsd === null || input.priceAmount == null) return;

  const billingCycle = normalizeServerOfferBillingCycle(input.billingCycle);
  const normalizedCurrency = input.currency?.trim().toUpperCase();
  let currency = "USD";
  if (normalizedCurrency) currency = normalizedCurrency;
  const values = {
    offerId: input.offerId,
    billingCycle,
    termMonths: getServerOfferTermMonths(billingCycle),
    amount: input.priceAmount,
    originalAmount: input.originalPriceAmount ?? null,
    currency,
    monthlyPriceUsd: String(monthlyPriceUsd),
    purchaseUrl: input.purchaseUrl ?? null,
    active: true,
    validUntil: input.validUntil ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(serverOfferPrices)
    .values(values)
    .onConflictDoUpdate({
      target: [
        serverOfferPrices.offerId,
        serverOfferPrices.billingCycle,
        serverOfferPrices.currency,
      ],
      set: values,
    });
}

type ServerOfferDuplicateKeyInput = {
  providerName?: string | null;
  productType?: string | null;
  memoryMb?: number | null;
  storageGb?: number | null;
  bandwidthMbps?: number | null;
  trafficGb?: number | null;
  region?: string | null;
  lineType?: string | null;
  priceAmount?: string | null;
  currency?: string | null;
  billingCycle?: string | null;
  purchaseUrl?: string | null;
};

function makeDuplicateKey(
  candidate: ServerOfferDuplicateKeyInput,
  resolvedProviderName?: string | null,
) {
  return [
    resolvedProviderName ?? candidate.providerName ?? "",
    candidate.productType ?? "",
    candidate.memoryMb ?? "",
    candidate.storageGb ?? "",
    candidate.bandwidthMbps ?? "",
    candidate.trafficGb ?? "",
    candidate.region ?? "",
    candidate.lineType ?? "",
    candidate.priceAmount ?? "",
    candidate.currency ?? "",
    candidate.billingCycle ?? "",
    candidate.purchaseUrl ?? "",
  ]
    .map((item) => String(item).trim().toLowerCase())
    .join("|");
}

function topicWhere(topic: (typeof offerTopics)[number]) {
  const base = publicPurchasableOfferBaseWhere();
  const regionConditions =
    topic.filters.regions?.map((region) =>
      ilike(serverOffers.region, `%${region}%`),
    ) ?? [];

  if (topic.filters.maxMonthlyUsd) {
    return and(
      base,
      isNotNull(serverOffers.monthlyPriceUsd),
      sql`${serverOffers.monthlyPriceUsd} <= ${topic.filters.maxMonthlyUsd}`,
    );
  }

  if (regionConditions.length > 0) {
    return and(
      base,
      or(
        ...regionConditions,
        sql`exists (
          select 1 from "server_regions" topic_region
          where topic_region."id" = ${serverOffers.regionId}
            and topic_region."slug" = ${topic.slug}
        )`,
      ),
    );
  }

  return base;
}

export async function getServerOfferTopic(slug: string) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.serverOffers, cacheTags.serverOfferTopic(slug));

  const topic = offerTopics.find((item) => item.slug === slug);
  if (!topic) return null;

  try {
    const offers = await readDb
      .select(serverOfferPublicSelect())
      .from(serverOffers)
      .where(topicWhere(topic))
      .orderBy(
        desc(serverOffers.featured),
        asc(serverOffers.monthlyPriceUsd),
        desc(serverOffers.createdAt),
      )
      .limit(30);

    return { topic, offers };
  } catch (error) {
    console.error("Failed to load server offer topic:", error);
    return { topic, offers: [] };
  }
}

function serverOfferPublicSelect() {
  return {
    id: serverOffers.id,
    title: serverOffers.title,
    slug: serverOffers.slug,
    providerName: serverOffers.providerName,
    productType: serverOffers.productType,
    cpu: serverOffers.cpu,
    memory: serverOffers.memory,
    storage: serverOffers.storage,
    bandwidth: serverOffers.bandwidth,
    traffic: serverOffers.traffic,
    region: serverOffers.region,
    lineType: serverOffers.lineType,
    priceAmount: serverOffers.priceAmount,
    monthlyPriceUsd: serverOffers.monthlyPriceUsd,
    currency: serverOffers.currency,
    billingCycle: serverOffers.billingCycle,
    promoCode: serverOffers.promoCode,
    purchaseUrl: serverOffers.purchaseUrl,
    articleUrl: serverOffers.articleUrl,
    reviewUrl: serverOffers.reviewUrl,
    status: serverOffers.status,
    featured: serverOffers.featured,
    lastCheckedAt: serverOffers.lastCheckedAt,
    validUntil: serverOffers.validUntil,
    createdAt: serverOffers.createdAt,
    updatedAt: serverOffers.updatedAt,
  };
}

export async function getServerOfferCollection(input: {
  kind: "provider" | "region" | "line";
  value: string;
}) {
  const value = input.value.trim();
  if (!value) return null;

  return unstable_cache(
    async () => loadServerOfferCollection(input.kind, value),
    ["server-offer-collection", input.kind, value],
    { revalidate: 900, tags: [cacheTags.serverOffers] },
  )();
}

async function loadServerOfferCollection(
  kind: "provider" | "region" | "line",
  value: string,
) {
  const matchCondition =
    kind === "provider"
      ? or(
          eq(affServiceProviders.slug, value),
          eq(affServiceProviders.name, value),
          eq(serverOffers.providerName, value),
        )
      : kind === "region"
        ? or(
            eq(serverRegions.slug, value),
            eq(serverRegions.name, value),
            eq(serverOffers.region, value),
          )
        : or(
            eq(serverNetworkLines.slug, value),
            eq(serverNetworkLines.name, value),
            eq(serverOffers.lineType, value),
          );
  const titlePrefix =
    kind === "provider" ? "商家" : kind === "region" ? "地区" : "线路";

  try {
    const rows = await readDb
      .select({
        ...serverOfferPublicSelect(),
        providerSlug: affServiceProviders.slug,
        canonicalProviderName: affServiceProviders.name,
        regionSlug: serverRegions.slug,
        canonicalRegionName: serverRegions.name,
        lineSlug: serverNetworkLines.slug,
        canonicalLineName: serverNetworkLines.name,
      })
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
      .where(and(publicPurchasableOfferBaseWhere(), matchCondition))
      .orderBy(
        desc(serverOffers.featured),
        asc(serverOffers.monthlyPriceUsd),
        desc(serverOffers.createdAt),
      )
      .limit(30);

    const first = rows[0];
    const label =
      kind === "provider"
        ? (first?.canonicalProviderName ?? first?.providerName ?? value)
        : kind === "region"
          ? (first?.canonicalRegionName ?? first?.region ?? value)
          : (first?.canonicalLineName ?? first?.lineType ?? value);
    const slug =
      kind === "provider"
        ? (first?.providerSlug ?? value)
        : kind === "region"
          ? (first?.regionSlug ?? value)
          : (first?.lineSlug ?? value);
    const offers = rows.map(
      ({
        providerSlug: _providerSlug,
        canonicalProviderName: _canonicalProviderName,
        regionSlug: _regionSlug,
        canonicalRegionName: _canonicalRegionName,
        lineSlug: _lineSlug,
        canonicalLineName: _canonicalLineName,
        ...offer
      }) => offer,
    );
    const filterKey =
      kind === "provider" ? "provider" : kind === "region" ? "region" : "line";

    return {
      title: `${label}${titlePrefix === "商家" ? "" : titlePrefix}服务器套餐`,
      description: `集中查看${label}相关服务器套餐，按价格、地区、线路、状态和购买入口筛选。`,
      offers,
      kind,
      value: label,
      slug,
      toolHref: `/servers?${filterKey}=${encodeURIComponent(slug)}&stock=all`,
      indexable: offers.length >= MIN_INDEXABLE_SERVER_COLLECTION_OFFERS,
      updatedAt: getLatestDateValue(
        offers.map((offer) => offer.updatedAt ?? offer.createdAt),
      ),
    };
  } catch (error) {
    console.error("Failed to load server offer collection:", error);
    return {
      title: `${value}${titlePrefix === "商家" ? "" : titlePrefix}服务器套餐`,
      description: `集中查看${value}相关服务器套餐，按价格、地区、线路、状态和购买入口筛选。`,
      offers: [],
      kind,
      value,
      slug: value,
      toolHref: "/servers",
      indexable: false,
      updatedAt: null,
    };
  }
}

export async function getServerOfferTopicCounts() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.serverOffers);

  try {
    const result = await Promise.all(
      offerTopics.map(async (topic) => {
        const [row] = await readDb
          .select({ count: sql<number>`count(*)` })
          .from(serverOffers)
          .where(topicWhere(topic));
        return { slug: topic.slug, count: Number(row?.count ?? 0) };
      }),
    );

    return result;
  } catch (error) {
    console.error("Failed to load server offer topic counts:", error);
    return offerTopics.map((topic) => ({ slug: topic.slug, count: 0 }));
  }
}

export async function getPublicServerOfferCount() {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(cacheTags.serverOffers);

  try {
    const [row] = await readDb
      .select({ count: sql<number>`count(*)` })
      .from(serverOffers)
      .where(publicPurchasableOfferBaseWhere());

    return Number(row?.count ?? 0);
  } catch (error) {
    console.error("Failed to count public server offers:", error);
    return 0;
  }
}

export async function getLatestServerOffers(limit = 8) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 3_600 });
  tagCache(cacheTags.serverOffers);

  try {
    return await readDb
      .select({
        id: serverOffers.id,
        title: serverOffers.title,
        providerName: serverOffers.providerName,
        region: serverOffers.region,
        lineType: serverOffers.lineType,
        priceAmount: serverOffers.priceAmount,
        currency: serverOffers.currency,
        billingCycle: serverOffers.billingCycle,
        promoCode: serverOffers.promoCode,
        purchaseUrl: serverOffers.purchaseUrl,
        articleUrl: serverOffers.articleUrl,
        status: serverOffers.status,
        lastCheckedAt: serverOffers.lastCheckedAt,
        updatedAt: serverOffers.updatedAt,
        createdAt: serverOffers.createdAt,
      })
      .from(serverOffers)
      .where(
        and(
          publicPurchasableOfferBaseWhere(),
          inArray(serverOffers.status, ["in_stock", "preorder", "restocking"]),
        ),
      )
      .orderBy(desc(serverOffers.featured), desc(serverOffers.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("Failed to load latest server offers:", error);
    return [];
  }
}

export async function getPublicServerOffers(limit = 120) {
  "use cache";
  tagCache(cacheTags.serverOffers);

  try {
    return await readDb
      .select(serverOfferPublicSelect())
      .from(serverOffers)
      .where(publicPurchasableOfferBaseWhere())
      .orderBy(
        desc(serverOffers.featured),
        asc(serverOffers.monthlyPriceUsd),
        desc(serverOffers.createdAt),
      )
      .limit(limit);
  } catch (error) {
    console.error("Failed to load public server offers:", error);
    return [];
  }
}

export async function getServerOfferCollectionIndex(limit = 80) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.serverOffers, cacheTags.sitemap);

  type CollectionRow = {
    value: string | null;
    label: string | null;
    count: number;
    updatedAt: DateValue;
  };

  function mergeCollectionRows(
    rows: CollectionRow[],
    kind: "provider" | "region" | "line",
  ) {
    const merged = new Map<
      string,
      {
        kind: typeof kind;
        value: string;
        label: string;
        count: number;
        updatedAt: Date | null;
      }
    >();
    for (const row of rows) {
      const value = row.value?.trim();
      if (!value) continue;
      const current = merged.get(value);
      const updatedAt = parseDateValue(row.updatedAt);
      if (current) {
        current.count += Number(row.count ?? 0);
        if (
          updatedAt &&
          (!current.updatedAt ||
            updatedAt.getTime() > current.updatedAt.getTime())
        ) {
          current.updatedAt = updatedAt;
        }
      } else {
        merged.set(value, {
          kind,
          value,
          label: row.label?.trim() ? row.label.trim() : value,
          count: Number(row.count ?? 0),
          updatedAt,
        });
      }
    }
    return [...merged.values()]
      .filter((row) => row.count >= MIN_INDEXABLE_SERVER_COLLECTION_OFFERS)
      .sort((left, right) => right.count - left.count)
      .slice(0, limit);
  }

  try {
    const [providerRows, regionRows, lineRows] = await Promise.all([
      readDb
        .select({
          value: sql<string>`coalesce(${affServiceProviders.slug}, ${serverOffers.providerName})`,
          label: sql<string>`coalesce(${affServiceProviders.name}, ${serverOffers.providerName})`,
          count: sql<number>`count(*)::int`,
          updatedAt: sql<Date | null>`max(coalesce(${serverOffers.updatedAt}, ${serverOffers.createdAt}))`,
        })
        .from(serverOffers)
        .leftJoin(
          affServiceProviders,
          eq(serverOffers.providerId, affServiceProviders.id),
        )
        .where(
          and(
            publicPurchasableOfferBaseWhere(),
            isNotNull(serverOffers.providerName),
          ),
        )
        .groupBy(
          affServiceProviders.slug,
          affServiceProviders.name,
          serverOffers.providerName,
        )
        .orderBy(desc(sql`count(*)`))
        .limit(limit * 2),
      readDb
        .select({
          value: sql<string>`coalesce(${serverRegions.slug}, ${serverOffers.region})`,
          label: sql<string>`coalesce(${serverRegions.name}, ${serverOffers.region})`,
          count: sql<number>`count(*)::int`,
          updatedAt: sql<Date | null>`max(coalesce(${serverOffers.updatedAt}, ${serverOffers.createdAt}))`,
        })
        .from(serverOffers)
        .leftJoin(serverRegions, eq(serverOffers.regionId, serverRegions.id))
        .where(
          and(
            publicPurchasableOfferBaseWhere(),
            isNotNull(serverOffers.region),
          ),
        )
        .groupBy(serverRegions.slug, serverRegions.name, serverOffers.region)
        .orderBy(desc(sql`count(*)`))
        .limit(limit * 2),
      readDb
        .select({
          value: sql<string>`coalesce(${serverNetworkLines.slug}, ${serverOffers.lineType})`,
          label: sql<string>`coalesce(${serverNetworkLines.name}, ${serverOffers.lineType})`,
          count: sql<number>`count(*)::int`,
          updatedAt: sql<Date | null>`max(coalesce(${serverOffers.updatedAt}, ${serverOffers.createdAt}))`,
        })
        .from(serverOffers)
        .leftJoin(
          serverNetworkLines,
          eq(serverOffers.lineId, serverNetworkLines.id),
        )
        .where(
          and(
            publicPurchasableOfferBaseWhere(),
            isNotNull(serverOffers.lineType),
          ),
        )
        .groupBy(
          serverNetworkLines.slug,
          serverNetworkLines.name,
          serverOffers.lineType,
        )
        .orderBy(desc(sql`count(*)`))
        .limit(limit * 2),
    ]);

    return {
      providers: mergeCollectionRows(providerRows, "provider"),
      regions: mergeCollectionRows(regionRows, "region"),
      lines: mergeCollectionRows(lineRows, "line"),
    };
  } catch (error) {
    console.error("Failed to load server offer collection index:", error);
    return { providers: [], regions: [], lines: [] };
  }
}

export async function searchServerOffers(input: {
  query: string;
  limit?: number;
}) {
  const query = input.query.trim();
  if (!query) return [];

  try {
    return await readDb
      .select(serverOfferPublicSelect())
      .from(serverOffers)
      .where(
        and(
          publicPurchasableOfferBaseWhere(),
          or(
            ilikeContains(serverOffers.title, query),
            ilikeContains(serverOffers.providerName, query),
            ilikeContains(serverOffers.region, query),
            ilikeContains(serverOffers.lineType, query),
            ilikeContains(serverOffers.promoCode, query),
            ilikeContains(serverOffers.rawText, query),
          ),
        ),
      )
      .orderBy(
        desc(serverOffers.featured),
        asc(serverOffers.monthlyPriceUsd),
        desc(serverOffers.createdAt),
      )
      .limit(input.limit ?? 20);
  } catch (error) {
    console.error("Failed to search server offers:", error);
    return [];
  }
}

export async function getServerOffersByKeywords(input: {
  keywords: string[];
  limit?: number;
}) {
  "use cache";
  tagCache(cacheTags.serverOffers);

  const keywords = input.keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= 2)
    .slice(0, 8);

  if (keywords.length === 0) return [];

  try {
    return await readDb
      .select(serverOfferPublicSelect())
      .from(serverOffers)
      .where(
        and(
          publicPurchasableOfferBaseWhere(),
          or(
            ...keywords.flatMap((keyword) => {
              return [
                ilikeContains(serverOffers.title, keyword),
                ilikeContains(serverOffers.providerName, keyword),
                ilikeContains(serverOffers.region, keyword),
                ilikeContains(serverOffers.lineType, keyword),
              ];
            }),
          ),
        ),
      )
      .orderBy(
        desc(serverOffers.featured),
        asc(serverOffers.monthlyPriceUsd),
        desc(serverOffers.createdAt),
      )
      .limit(input.limit ?? 6);
  } catch (error) {
    console.error("Failed to load keyword server offers:", error);
    return [];
  }
}

export type AdminServerOfferFilters = {
  page?: number;
  pageSize?: number;
  query?: string;
  kind?: string;
  status?: string;
  reviewStatus?: string;
  visibility?: string;
};

function normalizeAdminServerOfferFilters(input: AdminServerOfferFilters = {}) {
  const page =
    Number.isInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  const pageSize =
    Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0
      ? Math.min(input.pageSize!, 100)
      : 20;
  const status = offerStatuses.includes(input.status as OfferStatus)
    ? (input.status as OfferStatus)
    : "all";
  const kind = isServerOfferKind(input.kind) ? input.kind : "all";
  const reviewStatus = offerReviewStatuses.includes(
    input.reviewStatus as OfferReviewStatus,
  )
    ? (input.reviewStatus as OfferReviewStatus)
    : "all";
  const visibility = ["visible", "hidden", "featured"].includes(
    input.visibility ?? "",
  )
    ? input.visibility!
    : "all";

  return {
    page,
    pageSize,
    query: input.query?.trim().slice(0, 160) ?? "",
    kind,
    status,
    reviewStatus,
    visibility,
  };
}

function getAdminServerOfferWhere(
  filters: ReturnType<typeof normalizeAdminServerOfferFilters>,
) {
  const queryCondition = filters.query
    ? or(
        ilikeContains(serverOffers.title, filters.query),
        ilikeContains(serverOffers.providerName, filters.query),
        ilikeContains(serverOffers.region, filters.query),
        ilikeContains(serverOffers.lineType, filters.query),
        ilikeContains(serverOffers.cpu, filters.query),
        ilikeContains(serverOffers.memory, filters.query),
        ilikeContains(serverOffers.storage, filters.query),
        ilikeContains(serverOffers.bandwidth, filters.query),
        ilikeContains(serverOffers.traffic, filters.query),
        ilikeContains(serverOffers.promoCode, filters.query),
        ilikeContains(posts.title, filters.query),
      )
    : undefined;
  const statusCondition =
    filters.status === "all"
      ? undefined
      : eq(serverOffers.status, filters.status);
  const kindCondition =
    filters.kind === "all"
      ? undefined
      : eq(serverOffers.offerKind, filters.kind);
  const reviewStatusCondition =
    filters.reviewStatus === "all"
      ? undefined
      : eq(serverOffers.reviewStatus, filters.reviewStatus);
  const visibilityCondition =
    filters.visibility === "visible"
      ? eq(serverOffers.visible, true)
      : filters.visibility === "hidden"
        ? eq(serverOffers.visible, false)
        : filters.visibility === "featured"
          ? eq(serverOffers.featured, true)
          : undefined;

  return and(
    queryCondition,
    kindCondition,
    statusCondition,
    reviewStatusCondition,
    visibilityCondition,
  );
}

export async function getAdminServerOffers(
  input: AdminServerOfferFilters = {},
) {
  await requireAdminSession();

  const filters = normalizeAdminServerOfferFilters(input);
  const whereCondition = getAdminServerOfferWhere(filters);
  const [countRow] = await readDb
    .select({ count: sql<number>`count(*)::int` })
    .from(serverOffers)
    .leftJoin(posts, eq(serverOffers.sourcePostId, posts.id))
    .where(whereCondition);
  const total = Number(countRow?.count ?? 0);
  const totalPage = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPage);
  const rows = await readDb
    .select({
      id: serverOffers.id,
      title: serverOffers.title,
      providerId: serverOffers.providerId,
      providerName: serverOffers.providerName,
      sourceMonitorId: serverOffers.sourceMonitorId,
      externalProductId: serverOffers.externalProductId,
      productGroup: serverOffers.productGroup,
      offerKind: serverOffers.offerKind,
      productType: serverOffers.productType,
      cpu: serverOffers.cpu,
      memory: serverOffers.memory,
      storage: serverOffers.storage,
      bandwidth: serverOffers.bandwidth,
      traffic: serverOffers.traffic,
      region: serverOffers.region,
      lineType: serverOffers.lineType,
      priceAmount: serverOffers.priceAmount,
      monthlyPriceUsd: serverOffers.monthlyPriceUsd,
      currency: serverOffers.currency,
      billingCycle: serverOffers.billingCycle,
      promoCode: serverOffers.promoCode,
      purchaseUrl: serverOffers.purchaseUrl,
      articleUrl: serverOffers.articleUrl,
      reviewUrl: serverOffers.reviewUrl,
      status: serverOffers.status,
      checkStatus: serverOffers.checkStatus,
      lastCheckedAt: serverOffers.lastCheckedAt,
      statusChangedAt: serverOffers.statusChangedAt,
      lockedFields: serverOffers.lockedFields,
      validUntil: serverOffers.validUntil,
      featured: serverOffers.featured,
      visible: serverOffers.visible,
      sourcePostId: serverOffers.sourcePostId,
      sourcePostTitle: posts.title,
      sourcePostSlug: posts.slug,
      sourcePostLanguage: posts.language,
      createdAt: serverOffers.createdAt,
      updatedAt: serverOffers.updatedAt,
      reviewStatus: serverOffers.reviewStatus,
      duplicateKey: serverOffers.duplicateKey,
      mergedIntoOfferId: serverOffers.mergedIntoOfferId,
      reviewedAt: serverOffers.reviewedAt,
    })
    .from(serverOffers)
    .leftJoin(posts, eq(serverOffers.sourcePostId, posts.id))
    .where(whereCondition)
    .orderBy(desc(serverOffers.createdAt), desc(serverOffers.id))
    .offset((page - 1) * filters.pageSize)
    .limit(filters.pageSize);

  const offerIds = rows.map((row) => row.id);
  const [priceRows, checkRows, relationRows] = offerIds.length
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
            active: serverOfferPrices.active,
            validUntil: serverOfferPrices.validUntil,
          })
          .from(serverOfferPrices)
          .where(inArray(serverOfferPrices.offerId, offerIds))
          .orderBy(
            asc(serverOfferPrices.monthlyPriceUsd),
            asc(serverOfferPrices.id),
          ),
        readDb
          .select({
            id: serverOfferChecks.id,
            offerId: serverOfferChecks.offerId,
            status: serverOfferChecks.status,
            available: serverOfferChecks.available,
            priceAmount: serverOfferChecks.priceAmount,
            currency: serverOfferChecks.currency,
            responseTimeMs: serverOfferChecks.responseTimeMs,
            error: serverOfferChecks.error,
            checkedAt: serverOfferChecks.checkedAt,
          })
          .from(serverOfferChecks)
          .where(inArray(serverOfferChecks.offerId, offerIds))
          .orderBy(
            desc(serverOfferChecks.checkedAt),
            desc(serverOfferChecks.id),
          )
          .limit(Math.max(offerIds.length * 5, 20)),
        readDb
          .select({
            id: serverOfferSources.id,
            offerId: serverOfferSources.offerId,
            postId: serverOfferSources.sourcePostId,
            sourceUrl: serverOfferSources.sourceUrl,
            relationType: serverOfferSources.relationType,
            postTitle: posts.title,
            postSlug: posts.slug,
            postLanguage: posts.language,
          })
          .from(serverOfferSources)
          .innerJoin(posts, eq(serverOfferSources.sourcePostId, posts.id))
          .where(
            and(
              inArray(serverOfferSources.offerId, offerIds),
              eq(serverOfferSources.sourceType, "article"),
            ),
          )
          .orderBy(desc(serverOfferSources.id)),
      ])
    : [[], [], []];

  const enrichedRows = rows.map((row) => ({
    ...row,
    prices: priceRows.filter((price) => price.offerId === row.id),
    recentChecks: checkRows
      .filter((check) => check.offerId === row.id)
      .slice(0, 5),
    articleRelations: relationRows.filter(
      (relation) => relation.offerId === row.id,
    ),
  }));

  return { rows: enrichedRows, total, page, pageSize: filters.pageSize };
}

export async function getServerOfferRelationPostOptions(limit = 300) {
  await requireAdminSession();
  return readDb
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      language: posts.language,
      published: posts.published,
    })
    .from(posts)
    .orderBy(desc(posts.updatedAt), desc(posts.id))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function upsertServerOfferArticleRelation(input: {
  offerId: number;
  postId: number;
  relationType: "review" | "mention" | "deal";
}) {
  const [[offer], [post]] = await Promise.all([
    readDb
      .select({ id: serverOffers.id })
      .from(serverOffers)
      .where(eq(serverOffers.id, input.offerId))
      .limit(1),
    readDb
      .select({ id: posts.id, slug: posts.slug, language: posts.language })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .limit(1),
  ]);
  if (!offer) throw new Error("服务器套餐不存在");
  if (!post) throw new Error("关联文章不存在");
  const prefix = post.language === "en" ? "/en" : "";
  const sourceUrl = `${prefix}/fwq/posts/${encodeURIComponent(post.slug)}`;
  const [existing] = await readDb
    .select({ id: serverOfferSources.id })
    .from(serverOfferSources)
    .where(
      and(
        eq(serverOfferSources.offerId, input.offerId),
        eq(serverOfferSources.sourceType, "article"),
        eq(serverOfferSources.sourcePostId, input.postId),
        eq(serverOfferSources.relationType, input.relationType),
      ),
    )
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(serverOfferSources)
      .set({ sourceUrl, updatedAt: new Date() })
      .where(eq(serverOfferSources.id, existing.id))
      .returning({ id: serverOfferSources.id });
    if (!updated) throw new Error("文章关系更新失败");
    revalidateSiteContent([cacheTags.serverOffers]);
    return updated;
  }
  const [created] = await db
    .insert(serverOfferSources)
    .values({
      offerId: input.offerId,
      sourceType: "article",
      sourcePostId: input.postId,
      sourceUrl,
      relationType: input.relationType,
      priority: input.relationType === "review" ? 20 : 10,
    })
    .onConflictDoNothing()
    .returning({ id: serverOfferSources.id });
  const relation =
    created ??
    (
      await db
        .select({ id: serverOfferSources.id })
        .from(serverOfferSources)
        .where(
          and(
            eq(serverOfferSources.offerId, input.offerId),
            eq(serverOfferSources.sourceType, "article"),
            eq(serverOfferSources.sourcePostId, input.postId),
            eq(serverOfferSources.relationType, input.relationType),
          ),
        )
        .limit(1)
    )[0];
  if (!relation) throw new Error("文章关系创建失败");
  revalidateSiteContent([cacheTags.serverOffers]);
  return relation;
}

export async function deleteServerOfferArticleRelation(sourceId: number) {
  const [deleted] = await db
    .delete(serverOfferSources)
    .where(
      and(
        eq(serverOfferSources.id, sourceId),
        eq(serverOfferSources.sourceType, "article"),
      ),
    )
    .returning({ id: serverOfferSources.id });
  if (!deleted) throw new Error("文章关系不存在");
  revalidateSiteContent([cacheTags.serverOffers]);
  return deleted;
}

export async function getAdminServerOfferQualitySummary() {
  await requireAdminSession();

  const [row] = await readDb
    .select({
      pending: sql<number>`count(*) filter (where ${serverOffers.reviewStatus} = 'pending')::int`,
      needsFix: sql<number>`count(*) filter (where ${serverOffers.reviewStatus} = 'needs_fix')::int`,
      missingSpecs: sql<number>`count(*) filter (where
        ((case when btrim(coalesce(${serverOffers.cpu}, '')) <> '' then 1 else 0 end) +
         (case when btrim(coalesce(${serverOffers.memory}, '')) <> '' then 1 else 0 end) +
         (case when btrim(coalesce(${serverOffers.storage}, '')) <> '' then 1 else 0 end) +
         (case when btrim(coalesce(${serverOffers.bandwidth}, '')) <> '' then 1 else 0 end) +
         (case when btrim(coalesce(${serverOffers.traffic}, '')) <> '' then 1 else 0 end)) < 2
      )::int`,
      missingPurchaseUrl: sql<number>`count(*) filter (where btrim(coalesce(${serverOffers.purchaseUrl}, '')) = '')::int`,
      missingPrice: sql<number>`count(*) filter (where ${serverOffers.priceAmount} is null)::int`,
      missingRegion: sql<number>`count(*) filter (where btrim(coalesce(${serverOffers.region}, '')) = '')::int`,
      regularCount: sql<number>`count(*) filter (where ${serverOffers.offerKind} = 'regular')::int`,
      promotionCount: sql<number>`count(*) filter (where ${serverOffers.offerKind} = 'promotion')::int`,
    })
    .from(serverOffers);

  return {
    pending: Number(row?.pending ?? 0),
    needsFix: Number(row?.needsFix ?? 0),
    missingSpecs: Number(row?.missingSpecs ?? 0),
    missingPurchaseUrl: Number(row?.missingPurchaseUrl ?? 0),
    missingPrice: Number(row?.missingPrice ?? 0),
    missingRegion: Number(row?.missingRegion ?? 0),
    regularCount: Number(row?.regularCount ?? 0),
    promotionCount: Number(row?.promotionCount ?? 0),
  };
}

export type ServerOfferUpdateInput = {
  title: string;
  offerKind: ServerOfferKind;
  providerId?: number | null;
  providerName?: string | null;
  externalProductId?: string | null;
  productGroup?: string | null;
  productType?: string | null;
  cpu?: string | null;
  memory?: string | null;
  storage?: string | null;
  bandwidth?: string | null;
  traffic?: string | null;
  priceAmount?: string | null;
  originalPriceAmount?: string | null;
  currency?: string | null;
  billingCycle?: string | null;
  region?: string | null;
  lineType?: string | null;
  status: OfferStatus;
  purchaseUrl?: string | null;
  promoCode?: string | null;
  articleUrl?: string | null;
  reviewUrl?: string | null;
  visible: boolean;
  featured: boolean;
  reviewStatus?: OfferReviewStatus | null;
  lockedFields?: string[];
  validUntil?: Date | null;
  prices?: ServerOfferPriceUpdateInput[];
};

export type ServerOfferPriceUpdateInput = {
  billingCycle: string;
  amount: string;
  originalAmount?: string | null;
  currency: string;
  purchaseUrl?: string | null;
  active: boolean;
  validUntil?: Date | null;
};

function taxonomyMatches(
  value: string,
  item: { name: string; aliases: string | null },
) {
  const needle = value.trim().toLocaleLowerCase();
  if (!needle) return false;
  return [item.name, ...(item.aliases?.split(",") ?? [])].some(
    (candidate) => candidate.trim().toLocaleLowerCase() === needle,
  );
}

async function resolveServerOfferTaxonomy(input: {
  region?: string | null;
  lineType?: string | null;
}) {
  const [regions, lines] = await Promise.all([
    readDb
      .select({
        id: serverRegions.id,
        name: serverRegions.name,
        aliases: serverRegions.aliases,
      })
      .from(serverRegions)
      .where(eq(serverRegions.active, true)),
    readDb
      .select({
        id: serverNetworkLines.id,
        name: serverNetworkLines.name,
        aliases: serverNetworkLines.aliases,
      })
      .from(serverNetworkLines)
      .where(eq(serverNetworkLines.active, true)),
  ]);

  return {
    regionId: input.region
      ? (regions.find((item) => taxonomyMatches(input.region!, item))?.id ??
        null)
      : null,
    lineId: input.lineType
      ? (lines.find((item) => taxonomyMatches(input.lineType!, item))?.id ??
        null)
      : null,
  };
}

export async function updateServerOffer(
  id: number,
  input: ServerOfferUpdateInput,
) {
  const [existing] = await readDb
    .select({
      status: serverOffers.status,
      providerId: serverOffers.providerId,
      externalProductId: serverOffers.externalProductId,
      sourceMonitorId: serverOffers.sourceMonitorId,
      mergedIntoOfferId: serverOffers.mergedIntoOfferId,
    })
    .from(serverOffers)
    .where(eq(serverOffers.id, id))
    .limit(1);
  if (!existing) return null;

  let requestedExternalProductId = input.externalProductId?.trim() ?? null;
  if (requestedExternalProductId === "") requestedExternalProductId = null;
  let normalizedExistingExternalProductId =
    existing.externalProductId?.trim() ?? null;
  if (normalizedExistingExternalProductId === "") {
    normalizedExistingExternalProductId = null;
  }
  if (
    existing.sourceMonitorId &&
    (input.providerId !== existing.providerId ||
      requestedExternalProductId !== normalizedExistingExternalProductId)
  ) {
    throw new Error("采集套餐的厂商和产品 ID 由采集源管理，不能直接修改");
  }

  const requestedProviderId = existing.sourceMonitorId
    ? existing.providerId
    : input.providerId;

  const [provider, taxonomy] = await Promise.all([
    requestedProviderId
      ? readDb
          .select({
            id: affServiceProviders.id,
            name: affServiceProviders.name,
            defaultPromoCode: affServiceProviders.defaultPromoCode,
          })
          .from(affServiceProviders)
          .where(eq(affServiceProviders.id, requestedProviderId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    resolveServerOfferTaxonomy(input),
  ]);
  const providerId = provider?.id ?? requestedProviderId ?? null;
  const providerName = provider?.name ?? input.providerName ?? null;
  const externalProductId = existing.sourceMonitorId
    ? normalizedExistingExternalProductId
    : requestedExternalProductId;
  if (providerId && externalProductId) {
    const [duplicate] = await readDb
      .select({ id: serverOffers.id })
      .from(serverOffers)
      .where(
        and(
          eq(serverOffers.providerId, providerId),
          eq(serverOffers.externalProductId, externalProductId),
          ne(serverOffers.id, id),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new Error(
        `同一厂商已经存在产品 ID ${externalProductId}（套餐 #${duplicate.id}）`,
      );
    }
  }

  const memoryMb = parseServerOfferMemoryMb(input.memory);
  const storageGb = parseServerOfferStorageGb(input.storage);
  const bandwidthMbps = parseServerOfferBandwidthMbps(input.bandwidth);
  const trafficGb = parseServerOfferTrafficGb(input.traffic);
  const productType = input.productType ?? "vps";
  const normalizedPrices = input.prices?.map((price) => {
    const billingCycle = normalizeServerOfferBillingCycle(price.billingCycle);
    const currency = price.currency.trim().toUpperCase() || "USD";
    const monthlyPriceUsd = calculateMonthlyPriceUsd({
      amount: price.amount,
      currency,
      billingCycle,
    });
    if (monthlyPriceUsd === null) {
      throw new Error(`价格 ${price.amount} 无法折算为美元月价`);
    }
    return {
      billingCycle,
      termMonths: getServerOfferTermMonths(billingCycle),
      amount: price.amount,
      originalAmount: price.originalAmount ?? null,
      currency,
      monthlyPriceUsd,
      purchaseUrl: price.purchaseUrl ?? input.purchaseUrl ?? null,
      active: price.active,
      validUntil: price.validUntil ?? input.validUntil ?? null,
    };
  });
  const primaryPrice = normalizedPrices
    ?.filter((price) => price.active)
    .sort((left, right) => left.monthlyPriceUsd - right.monthlyPriceUsd)[0];
  const priceAmount = normalizedPrices
    ? (primaryPrice?.amount ?? null)
    : input.priceAmount;
  const originalPriceAmount = normalizedPrices
    ? (primaryPrice?.originalAmount ?? null)
    : input.originalPriceAmount;
  const currency = normalizedPrices
    ? (primaryPrice?.currency ?? "USD")
    : input.currency;
  const billingCycle = normalizedPrices
    ? (primaryPrice?.billingCycle ?? "monthly")
    : input.billingCycle;
  const monthlyPriceUsd = normalizedPrices
    ? (primaryPrice?.monthlyPriceUsd ?? null)
    : calculateMonthlyPriceUsd({ amount: priceAmount, currency, billingCycle });
  const now = new Date();
  const reviewStatus = input.reviewStatus ?? "reviewed";
  if (reviewStatus === "merged" && !existing.mergedIntoOfferId) {
    throw new Error("套餐没有合并目标，不能标记为已合并");
  }
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(serverOffers)
      .set({
        title: input.title,
        offerKind: input.offerKind,
        providerId,
        providerName,
        externalProductId,
        sourceHash: existing.sourceMonitorId ? null : undefined,
        productGroup: input.productGroup ?? null,
        productType,
        cpu: input.cpu ?? null,
        memory: input.memory ?? null,
        memoryMb,
        storage: input.storage ?? null,
        storageGb,
        bandwidth: input.bandwidth ?? null,
        bandwidthMbps,
        traffic: input.traffic ?? null,
        trafficGb,
        priceAmount: priceAmount ?? null,
        originalPriceAmount: originalPriceAmount ?? null,
        currency: currency ?? "USD",
        billingCycle: billingCycle ?? "monthly",
        monthlyPriceUsd:
          monthlyPriceUsd === null ? null : String(monthlyPriceUsd),
        region: input.region ?? null,
        regionId: taxonomy.regionId,
        lineType: input.lineType ?? null,
        lineId: taxonomy.lineId,
        status: input.status,
        checkStatus:
          input.offerKind === "regular" && !existing.sourceMonitorId
            ? "unknown"
            : undefined,
        lastCheckedAt:
          input.offerKind === "regular" && !existing.sourceMonitorId
            ? null
            : undefined,
        statusChangedAt: existing.status === input.status ? undefined : now,
        purchaseUrl: input.purchaseUrl ?? null,
        promoCode: input.promoCode ?? provider?.defaultPromoCode ?? null,
        articleUrl: input.articleUrl ?? null,
        reviewUrl: input.reviewUrl ?? null,
        visible: input.visible,
        featured: input.featured,
        lockedFields: [...new Set(input.lockedFields ?? [])],
        validUntil: input.validUntil ?? null,
        duplicateKey: makeDuplicateKey({
          providerName,
          productType,
          memoryMb,
          storageGb,
          bandwidthMbps,
          trafficGb,
          region: input.region,
          lineType: input.lineType,
          priceAmount,
          currency,
          billingCycle,
          purchaseUrl: input.purchaseUrl,
        }),
        reviewStatus,
        mergedIntoOfferId:
          reviewStatus === "merged" ? existing.mergedIntoOfferId : null,
        reviewedAt: reviewStatus === "pending" ? null : now,
        updatedAt: now,
      })
      .where(eq(serverOffers.id, id))
      .returning({ id: serverOffers.id });

    if (row && normalizedPrices) {
      await tx
        .delete(serverOfferPrices)
        .where(eq(serverOfferPrices.offerId, row.id));
      if (normalizedPrices.length > 0) {
        await tx.insert(serverOfferPrices).values(
          normalizedPrices.map((price) => ({
            offerId: row.id,
            billingCycle: price.billingCycle,
            termMonths: price.termMonths,
            amount: price.amount,
            originalAmount: price.originalAmount,
            currency: price.currency,
            monthlyPriceUsd: String(price.monthlyPriceUsd),
            purchaseUrl: price.purchaseUrl,
            active: price.active,
            validUntil: price.validUntil,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    }

    return row ?? null;
  });

  if (updated) {
    if (existing.sourceMonitorId) {
      await db
        .update(providerMonitors)
        .set({
          etag: null,
          lastModified: null,
          responseHash: null,
          updatedAt: now,
        })
        .where(eq(providerMonitors.id, existing.sourceMonitorId));
    }
    if (!normalizedPrices) {
      await syncPrimaryOfferPrice({
        offerId: updated.id,
        priceAmount,
        originalPriceAmount,
        currency,
        billingCycle,
        purchaseUrl: input.purchaseUrl,
        validUntil: input.validUntil,
      });
    }
    revalidateSiteContent([cacheTags.serverOffers]);
  }

  return updated ?? null;
}

export async function bulkUpdateServerOffers(input: {
  ids: number[];
  offerKind?: ServerOfferKind;
  status?: OfferStatus;
  visible?: boolean;
  featured?: boolean;
  reviewStatus?: Exclude<OfferReviewStatus, "merged">;
}) {
  if (input.ids.length === 0) {
    return { updated: 0 };
  }

  const values: Omit<
    Partial<typeof serverOffers.$inferInsert>,
    "checkStatus" | "lastCheckedAt"
  > & {
    checkStatus?: string | ReturnType<typeof sql>;
    lastCheckedAt?: Date | null | ReturnType<typeof sql>;
  } = {
    updatedAt: new Date(),
  };

  if (input.status) {
    values.status = input.status;
    values.statusChangedAt = values.updatedAt;
  }
  if (input.offerKind) {
    values.offerKind = input.offerKind;
    if (input.offerKind === "regular") {
      values.checkStatus = sql`case
        when ${serverOffers.sourceMonitorId} is null then 'unknown'
        else ${serverOffers.checkStatus}
      end`;
      values.lastCheckedAt = sql`case
        when ${serverOffers.sourceMonitorId} is null then null
        else ${serverOffers.lastCheckedAt}
      end`;
    }
  }
  if (typeof input.visible === "boolean") values.visible = input.visible;
  if (typeof input.featured === "boolean") values.featured = input.featured;
  if (input.reviewStatus) {
    values.reviewStatus = input.reviewStatus;
    values.mergedIntoOfferId = null;
    values.reviewedAt = input.reviewStatus === "pending" ? null : new Date();
  }

  const rows = await db
    .update(serverOffers)
    .set(values)
    .where(inArray(serverOffers.id, input.ids))
    .returning({ id: serverOffers.id });

  if (rows.length > 0) {
    revalidateSiteContent([cacheTags.serverOffers]);
  }

  return { updated: rows.length };
}

export async function getRelatedServerOffersForPost(input: {
  postId: number;
  tagNames: string[];
  limit?: number;
}) {
  "use cache";
  tagCache(cacheTags.serverOffers, cacheTags.post(input.postId));

  const tagText = input.tagNames.join(" ");
  const hasDirectArticleRelation = sql<boolean>`exists (
    select 1
    from "server_offer_sources" article_relation
    where article_relation."offerId" = ${serverOffers.id}
      and article_relation."sourceType" = 'article'
      and article_relation."sourcePostId" = ${input.postId}
  )`;
  const conditions = [
    publicPurchasableOfferBaseWhere(),
    or(
      eq(serverOffers.sourcePostId, input.postId),
      hasDirectArticleRelation,
      ...input.tagNames.flatMap((name) => [
        ilike(serverOffers.providerName, `%${name}%`),
        ilike(serverOffers.region, `%${name}%`),
        ilike(serverOffers.lineType, `%${name}%`),
      ]),
      tagText.includes("香港")
        ? ilike(serverOffers.region, "%香港%")
        : undefined,
      tagText.includes("美国")
        ? ilike(serverOffers.region, "%美国%")
        : undefined,
    ),
  ].filter(Boolean);

  return readDb
    .select({
      id: serverOffers.id,
      sourcePostId: sql<number | null>`case
        when ${hasDirectArticleRelation} then ${input.postId}
        else ${serverOffers.sourcePostId}
      end`,
      title: serverOffers.title,
      providerName: serverOffers.providerName,
      productType: serverOffers.productType,
      cpu: serverOffers.cpu,
      memory: serverOffers.memory,
      storage: serverOffers.storage,
      bandwidth: serverOffers.bandwidth,
      traffic: serverOffers.traffic,
      region: serverOffers.region,
      lineType: serverOffers.lineType,
      priceAmount: serverOffers.priceAmount,
      currency: serverOffers.currency,
      billingCycle: serverOffers.billingCycle,
      promoCode: serverOffers.promoCode,
      purchaseUrl: serverOffers.purchaseUrl,
      articleUrl: serverOffers.articleUrl,
      reviewUrl: serverOffers.reviewUrl,
      status: serverOffers.status,
      featured: serverOffers.featured,
      lastCheckedAt: serverOffers.lastCheckedAt,
      validUntil: serverOffers.validUntil,
      createdAt: serverOffers.createdAt,
      updatedAt: serverOffers.updatedAt,
    })
    .from(serverOffers)
    .where(and(...conditions))
    .orderBy(
      desc(
        sql`case when ${serverOffers.sourcePostId} = ${input.postId} or ${hasDirectArticleRelation} then 1 else 0 end`,
      ),
      desc(serverOffers.featured),
      asc(serverOffers.monthlyPriceUsd),
    )
    .limit(input.limit ?? 6);
}
