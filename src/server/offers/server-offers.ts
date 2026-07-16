import * as cheerio from "cheerio";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { slugify } from "@fwqgo/core/utils";
import {
  calculateMonthlyPriceUsd,
  getServerOfferTermMonths,
  normalizeServerOfferBillingCycle,
} from "@fwqgo/core/server-offer-price";
import { renderArticleContentHtml } from "@fwqgo/core/content";
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
  serverNetworkLines,
  serverOfferChecks,
  serverOfferPrices,
  serverOfferSources,
  serverOffers,
  serverRegions,
} from "@fwqgo/db/schema";
import { ilikeContains } from "@/server/db/search";
import { readOutboundShortTarget } from "@/server/links/outbound-short-link";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

const publicOfferTopicSlugs = [
  "hong-kong",
  "united-states",
  "cheap-vps",
] as const;

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

const pricePatterns = [
  /(?:\$|USD|US\$)\s*([0-9]+(?:\.[0-9]+)?)/i,
  /([0-9]+(?:\.[0-9]+)?)\s*(?:USD|US\$|美元|刀)(?:\b|\/|每)?/i,
  /(?:￥|¥|CNY|RMB)\s*([0-9]+(?:\.[0-9]+)?)/i,
  /([0-9]+(?:\.[0-9]+)?)\s*(?:元|CNY|RMB)(?:\b|\/|每)?/i,
];
const memoryPatterns = [
  /(?:内存|RAM)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*(GB|G|MB|M)\b/i,
  /([0-9]+(?:\.[0-9]+)?)\s*(GB|G|MB|M)\s*(?:内存|RAM)\b/i,
  /[0-9]+\s*(?:核|核心|Core|Cores|vCPU|CPU|C)(?=\b|[0-9\s/,+-])\s*[/,+-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(GB|G|MB|M)\b/i,
];
const storagePatterns = [
  /(?:硬盘|存储|Disk|Storage|SSD|NVMe|HDD)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*(GB|G|TB|T)\b/i,
  /([0-9]+(?:\.[0-9]+)?)\s*(GB|G|TB|T)\s*(?:SSD|NVMe|HDD|硬盘|存储|Disk|Storage)\b/i,
];
const bandwidthPatterns = [
  /(?:带宽|端口|Bandwidth|Port)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*(Gbps|G口|Mbps|M口|G|M)\b/i,
  /([0-9]+(?:\.[0-9]+)?)\s*(Gbps|G口|Mbps|M口)\s*(?:带宽|端口|Bandwidth|Port)?/i,
];
const trafficPatterns = [
  /(?:流量|Traffic|Transfer)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*(TB|T|GB|G)\b/i,
  /([0-9]+(?:\.[0-9]+)?)\s*(TB|T|GB|G)\s*(?:流量|Traffic|Transfer)\b/i,
];
const cpuPattern =
  /(?:CPU|vCPU)\s*[:：]?\s*([0-9]+)|([0-9]+)\s*(?:核|核心|Core|Cores|vCPU|CPU|C)(?=\b|[0-9\s/,+-])/i;
const ipv4Pattern = /([0-9]+)\s*(?:个)?\s*(?:IPv4|独立IP|IP)/i;
const promoPattern =
  /(?:优惠码|折扣码|优惠代码|Promo Code|Coupon)\s*[:：]?\s*([A-Za-z0-9_-]+)/i;
const purchaseHrefPattern = /^(https?:\/\/|\/go\/)/i;

function normalizeSpace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMb(value: string | undefined, unit: string | undefined) {
  const number = toNumber(value);
  if (number === null || !unit) return null;
  return /g/i.test(unit) ? Math.round(number * 1024) : Math.round(number);
}

function toGb(value: string | undefined, unit: string | undefined) {
  const number = toNumber(value);
  if (number === null || !unit) return null;
  return /t/i.test(unit) ? Math.round(number * 1024) : Math.round(number);
}

function toMbps(value: string | undefined, unit: string | undefined) {
  const number = toNumber(value);
  if (number === null || !unit) return null;
  return /g/i.test(unit) ? Math.round(number * 1000) : Math.round(number);
}

function findFirstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1] && match[2]) {
      return {
        raw: match[0],
        value: match[1],
        unit: match[2],
      };
    }
  }

  return null;
}

function extractPrice(text: string) {
  for (const pattern of pricePatterns) {
    const match = pattern.exec(text);
    if (!match?.[1]) {
      continue;
    }

    return {
      amount: match[1],
      currency: /￥|¥|CNY|RMB|元/i.test(match[0]) ? "CNY" : "USD",
    };
  }

  return null;
}

function isPurchaseHref(value: string | null | undefined) {
  return Boolean(value?.trim() && purchaseHrefPattern.test(value.trim()));
}

function hasConcreteServerConfiguration(input: {
  cpu: string | null;
  memory: string | null;
  storage: string | null;
  bandwidth: string | null;
  traffic: string | null;
}) {
  return (
    [
      input.cpu,
      input.memory,
      input.storage,
      input.bandwidth,
      input.traffic,
    ].filter((value) => Boolean(value?.trim())).length >= 2
  );
}

function cleanSpecRaw(value: string | undefined) {
  const normalized = normalizeSpace(value ?? "");
  return normalized ? normalized : null;
}

function extractCpu(text: string) {
  const match = cpuPattern.exec(text);
  return cleanSpecRaw(match?.[0]);
}

function extractMemory(text: string) {
  const match = findFirstMatch(text, memoryPatterns);
  if (!match) return null;

  return {
    ...match,
    raw: `${match.value}${match.unit}`,
  };
}

function extractStorage(text: string) {
  return findFirstMatch(text, storagePatterns);
}

function extractBandwidth(text: string) {
  return findFirstMatch(text, bandwidthPatterns);
}

function extractTraffic(text: string) {
  return findFirstMatch(text, trafficPatterns);
}

function purchaseKeywordText(value: string) {
  return /购买|订购|下单|入口|链接|buy|order|purchase|cart/i.test(value);
}

function parseStandaloneMemoryMb(value: string | null | undefined) {
  const match = value?.match(/([0-9]+(?:\.[0-9]+)?)\s*(GB|G|MB|M)\b/i);
  return toMb(match?.[1], match?.[2]);
}

function parseStandaloneStorageGb(value: string | null | undefined) {
  const match = value?.match(/([0-9]+(?:\.[0-9]+)?)\s*(TB|T|GB|G)\b/i);
  return toGb(match?.[1], match?.[2]);
}

function parseStandaloneBandwidthMbps(value: string | null | undefined) {
  const match = value?.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(Gbps|G口|Mbps|M口|G|M)\b/i,
  );
  return toMbps(match?.[1], match?.[2]);
}

function parseStandaloneTrafficGb(value: string | null | undefined) {
  const match = value?.match(/([0-9]+(?:\.[0-9]+)?)\s*(TB|T|GB|G)\b/i);
  return toGb(match?.[1], match?.[2]);
}

function detectBillingCycle(text: string) {
  if (/年付|每年|\/年|\/yr|year/i.test(text)) return "yearly";
  if (/季付|季度|\/quarter/i.test(text)) return "quarterly";
  if (/半年|半年度/i.test(text)) return "semiannual";
  if (/月付|每月|\/月|\/mo|month/i.test(text)) return "monthly";
  return null;
}

function detectCurrency(text: string) {
  if (/￥|¥|CNY|RMB|元/i.test(text)) return "CNY";
  return "USD";
}

function detectRegion(text: string) {
  const regions = [
    "香港",
    "美国",
    "洛杉矶",
    "圣何塞",
    "日本",
    "东京",
    "新加坡",
    "韩国",
    "德国",
    "英国",
    "荷兰",
  ];
  const found = regions.find((region) => text.includes(region));
  if (found) return found;
  if (/\bHK\b|Hong Kong/i.test(text)) return "香港";
  if (/\bUS\b|\bUSA\b|United States|Los Angeles|San Jose/i.test(text)) {
    return "美国";
  }
  return null;
}

function detectLineType(text: string) {
  const lines = [
    "CN2 GIA",
    "CN2",
    "CMI",
    "BGP",
    "AS9929",
    "软银",
    "电信",
    "联通",
    "移动",
    "高防",
  ];
  return lines.find((line) => new RegExp(line, "i").test(text)) ?? null;
}

function extractTitle(text: string, fallback: string) {
  const cleaned = normalizeSpace(text).replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length > 72 ? `${cleaned.slice(0, 72)}...` : cleaned;
}

function makeOfferSlug(input: {
  sourcePostId: number;
  title: string;
  purchaseUrl?: string | null;
}) {
  const base = slugify(input.title).slice(0, 80) || "server-offer";
  const suffix = input.purchaseUrl
    ? Math.abs(hashString(input.purchaseUrl)).toString(36)
    : input.sourcePostId.toString(36);
  return `${base}-${input.sourcePostId}-${suffix}`.slice(0, 320);
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function parseOfferText(input: {
  text: string;
  sourcePostId: number;
  sourcePostTitle: string;
  sourcePostSlug: string;
  sourcePostLanguage: string;
  purchaseUrl?: string | null;
}) {
  const text = normalizeSpace(input.text);
  const price = extractPrice(text);
  if (!price) return null;

  const memoryMatch = extractMemory(text);
  const storageMatch = extractStorage(text);
  const bandwidthMatch = extractBandwidth(text);
  const trafficMatch = extractTraffic(text);
  const cpu = extractCpu(text);
  const ipv4Match = ipv4Pattern.exec(text);
  const promoMatch = promoPattern.exec(text);
  const title = extractTitle(text, input.sourcePostTitle);
  const purchaseUrl = isPurchaseHref(input.purchaseUrl)
    ? input.purchaseUrl!.trim()
    : null;
  if (!purchaseUrl) return null;

  const articlePrefix = input.sourcePostLanguage === "en" ? "/en" : "";

  const offer = {
    title,
    slug: makeOfferSlug({
      sourcePostId: input.sourcePostId,
      title,
      purchaseUrl,
    }),
    providerName: null,
    providerId: null,
    productType: /独立服务器|dedicated/i.test(text) ? "dedicated" : "vps",
    cpu,
    memory: memoryMatch?.raw ?? null,
    memoryMb: toMb(memoryMatch?.value, memoryMatch?.unit),
    storage: storageMatch?.raw ?? null,
    storageGb: toGb(storageMatch?.value, storageMatch?.unit),
    storageType: /nvme/i.test(text) ? "NVMe" : /ssd/i.test(text) ? "SSD" : null,
    bandwidth: bandwidthMatch?.raw ?? null,
    bandwidthMbps: toMbps(bandwidthMatch?.value, bandwidthMatch?.unit),
    traffic: trafficMatch?.raw ?? null,
    trafficGb: toGb(trafficMatch?.value, trafficMatch?.unit),
    region: detectRegion(text),
    countryCode: null,
    city: null,
    lineType: detectLineType(text),
    network: null,
    ipv4: ipv4Match?.[0] ?? null,
    ipv6: /IPv6/i.test(text) ? "IPv6" : null,
    priceAmount: price.amount,
    originalPriceAmount: null,
    currency: price.currency ?? detectCurrency(text),
    billingCycle: detectBillingCycle(text),
    promoCode: promoMatch?.[1] ?? null,
    purchaseUrl,
    articleUrl: `${articlePrefix}/fwq/posts/${input.sourcePostSlug}`,
    reviewUrl: null,
    sourcePostId: input.sourcePostId,
    status: "in_stock" satisfies OfferStatus,
    featured: false,
    visible: true,
    sortOrder: 0,
    rawText: text.slice(0, 4000),
  };

  if (!hasConcreteServerConfiguration(offer)) {
    return null;
  }

  return offer;
}

function candidateTextsFromPost(post: {
  id: number;
  title: string;
  slug: string;
  content: string;
}) {
  const $ = cheerio.load(renderArticleContentHtml(post.content));
  const candidates: Array<{ text: string; purchaseUrl?: string | null }> = [];

  $("table").each((_, table) => {
    const rows = $(table).find("tr").toArray();
    const headerCells = $(rows[0])
      .find("th,td")
      .toArray()
      .map((cell) => normalizeSpace($(cell).text()));
    const firstRowIsHeader =
      $(rows[0]).find("th").length > 0 ||
      headerCells.some((cell) =>
        /套餐|配置|CPU|内存|硬盘|存储|带宽|流量|线路|地区|价格|购买|优惠/i.test(
          cell,
        ),
      );

    rows.forEach((row, rowIndex) => {
      if (rowIndex === 0 && firstRowIsHeader) return;

      const rowLinks: Array<{
        href: string;
        header: string;
        text: string;
      }> = [];
      const cells = $(row)
        .find("th,td")
        .toArray()
        .map((cell, cellIndex) => {
          const text = normalizeSpace($(cell).text());
          const header = headerCells[cellIndex] ?? "";
          $(cell)
            .find("a[href]")
            .toArray()
            .forEach((link) => {
              const href = $(link).attr("href");
              if (isPurchaseHref(href)) {
                rowLinks.push({
                  href: href!.trim(),
                  header,
                  text: normalizeSpace($(link).text()),
                });
              }
            });
          if (!text) return "";
          return header ? `${header}: ${text}` : text;
        });
      const rowText = cells.filter(Boolean).join(" | ");
      const href =
        rowLinks.find((link) =>
          purchaseKeywordText(`${link.header} ${link.text}`),
        )?.href ??
        rowLinks[0]?.href ??
        null;
      if (rowText) {
        candidates.push({ text: rowText, purchaseUrl: href ?? null });
      }
    });
  });

  $("p,li,div").each((_, element) => {
    if ($(element).parents("table").length > 0) return;
    if ($(element).find("table").length > 0) return;

    const text = normalizeSpace($(element).text());
    if (text.length < 12 || text.length > 800) return;
    if (!extractPrice(text)) return;
    const links = $(element)
      .find("a[href]")
      .toArray()
      .map((link) => ({
        href: $(link).attr("href"),
        text: normalizeSpace($(link).text()),
      }))
      .filter((link): link is { href: string; text: string } =>
        isPurchaseHref(link.href),
      );
    const href =
      links.find((link) => purchaseKeywordText(link.text))?.href ??
      links[0]?.href ??
      null;
    candidates.push({ text, purchaseUrl: href ?? null });
  });

  return candidates;
}

async function resolvePurchaseTargetUrl(
  purchaseUrl: string | null | undefined,
) {
  if (!purchaseUrl) return null;

  const trimmed = purchaseUrl.trim();
  if (/^\/go\//i.test(trimmed)) {
    return readOutboundShortTarget(trimmed.replace(/^\/go\//i, ""));
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function resolveProvider(purchaseUrl: string | null | undefined) {
  const targetUrl = await resolvePurchaseTargetUrl(purchaseUrl);
  if (!targetUrl) return null;

  let host = "";
  try {
    host = new URL(targetUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }

  const providers = await db.select().from(affServiceProviders);
  return (
    providers.find((provider) => {
      const providerHosts = [
        providerHostFromUrl(provider.officialUrl),
        providerHostFromUrl(provider.affUrl),
      ].filter((value): value is string => Boolean(value));

      return providerHosts.some(
        (providerHost) =>
          host === providerHost || host.endsWith(`.${providerHost}`),
      );
    }) ?? null
  );
}

function providerHostFromUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return (
      trimmed
        .replace(/^https?:\/\//i, "")
        .split("/")[0]
        ?.replace(/:\d+$/, "")
        .replace(/^www\./i, "")
        .toLowerCase() ?? null
    );
  }
}

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

async function syncArticleOfferSource(input: {
  offerId: number;
  sourcePostId: number | null | undefined;
  articleUrl: string | null | undefined;
}) {
  if (!input.sourcePostId && !input.articleUrl) return;

  const [existing] = await db
    .select({ id: serverOfferSources.id })
    .from(serverOfferSources)
    .where(
      and(
        eq(serverOfferSources.offerId, input.offerId),
        eq(serverOfferSources.sourceType, "article"),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(serverOfferSources)
      .set({
        sourcePostId: input.sourcePostId ?? null,
        sourceUrl: input.articleUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(serverOfferSources.id, existing.id));
    return;
  }

  await db.insert(serverOfferSources).values({
    offerId: input.offerId,
    sourceType: "article",
    sourcePostId: input.sourcePostId ?? null,
    sourceUrl: input.articleUrl ?? null,
    priority: 10,
  });
}

type OfferSourcePost = {
  id: number;
  title: string;
  slug: string;
  language: string;
  content: string;
};

type ParsedServerOffer = NonNullable<ReturnType<typeof parseOfferText>>;

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

function nullableEq<T>(column: T, value: string | number | null | undefined) {
  return value === null || typeof value === "undefined"
    ? isNull(column as Parameters<typeof isNull>[0])
    : eq(column as Parameters<typeof eq>[0], value);
}

function serverOfferConfigWhere(candidate: ParsedServerOffer) {
  return and(
    eq(serverOffers.sourcePostId, candidate.sourcePostId),
    eq(serverOffers.productType, candidate.productType),
    nullableEq(serverOffers.memoryMb, candidate.memoryMb),
    nullableEq(serverOffers.storageGb, candidate.storageGb),
    nullableEq(serverOffers.bandwidthMbps, candidate.bandwidthMbps),
    nullableEq(serverOffers.trafficGb, candidate.trafficGb),
    nullableEq(serverOffers.region, candidate.region),
    nullableEq(serverOffers.lineType, candidate.lineType),
  );
}

async function findExistingServerOffer(candidate: ParsedServerOffer) {
  const selectColumns = {
    id: serverOffers.id,
    title: serverOffers.title,
    purchaseUrl: serverOffers.purchaseUrl,
    lockedFields: serverOffers.lockedFields,
  };
  const [existingBySlug] = await db
    .select(selectColumns)
    .from(serverOffers)
    .where(eq(serverOffers.slug, candidate.slug))
    .limit(1);

  if (existingBySlug) {
    return existingBySlug;
  }

  const purchaseUrl = candidate.purchaseUrl?.trim();
  const purchaseUrlCondition = purchaseUrl
    ? eq(serverOffers.purchaseUrl, purchaseUrl)
    : or(isNull(serverOffers.purchaseUrl), eq(serverOffers.purchaseUrl, ""));

  const [existingByIdentity] = await db
    .select(selectColumns)
    .from(serverOffers)
    .where(and(serverOfferConfigWhere(candidate), purchaseUrlCondition))
    .limit(1);

  return existingByIdentity ?? null;
}

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

async function importServerOffersFromPostRows(
  sourcePosts: OfferSourcePost[],
  options: { revalidate?: boolean } = {},
) {
  const shouldRevalidate = options.revalidate ?? true;
  let extracted = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const post of sourcePosts) {
    const candidates = candidateTextsFromPost(post)
      .map((candidate) =>
        parseOfferText({
          text: candidate.text,
          sourcePostId: post.id,
          sourcePostTitle: post.title,
          sourcePostSlug: post.slug,
          sourcePostLanguage: post.language,
          purchaseUrl: candidate.purchaseUrl,
        }),
      )
      .filter((offer): offer is NonNullable<typeof offer> => offer !== null);
    extracted += candidates.length;

    const seenInPost = new Set<string>();
    for (const candidate of candidates) {
      const key = `${candidate.sourcePostId}:${candidate.purchaseUrl ?? ""}:${candidate.title}`;
      if (seenInPost.has(key)) {
        skipped += 1;
        continue;
      }
      seenInPost.add(key);

      const provider = await resolveProvider(candidate.purchaseUrl);
      const existing = await findExistingServerOffer(candidate);
      const monthlyPriceUsd = calculateMonthlyPriceUsd({
        amount: candidate.priceAmount,
        currency: candidate.currency,
        billingCycle: candidate.billingCycle,
      });

      if (existing) {
        const lockedFields = new Set(existing.lockedFields ?? []);
        const updateValues: Partial<typeof serverOffers.$inferInsert> = {
          providerName: provider?.name ?? candidate.providerName,
          providerId: provider?.id ?? candidate.providerId,
          productType: candidate.productType,
          cpu: candidate.cpu,
          memory: candidate.memory,
          memoryMb: candidate.memoryMb,
          storage: candidate.storage,
          storageGb: candidate.storageGb,
          storageType: candidate.storageType,
          bandwidth: candidate.bandwidth,
          bandwidthMbps: candidate.bandwidthMbps,
          traffic: candidate.traffic,
          trafficGb: candidate.trafficGb,
          region: candidate.region,
          countryCode: candidate.countryCode,
          city: candidate.city,
          lineType: candidate.lineType,
          network: candidate.network,
          ipv4: candidate.ipv4,
          ipv6: candidate.ipv6,
          promoCode: candidate.promoCode,
          articleUrl: candidate.articleUrl,
          rawText: candidate.rawText,
          duplicateKey: makeDuplicateKey(candidate, provider?.name),
          updatedAt: new Date(),
        };
        if (!lockedFields.has("title")) {
          updateValues.title = candidate.title || existing.title;
        }
        if (!lockedFields.has("price")) {
          updateValues.priceAmount = candidate.priceAmount;
          updateValues.originalPriceAmount = candidate.originalPriceAmount;
          updateValues.currency = candidate.currency;
          updateValues.billingCycle = candidate.billingCycle;
          updateValues.monthlyPriceUsd =
            monthlyPriceUsd === null ? null : String(monthlyPriceUsd);
        }
        if (!lockedFields.has("purchaseUrl")) {
          updateValues.purchaseUrl = candidate.purchaseUrl;
        }

        await db
          .update(serverOffers)
          .set(updateValues)
          .where(eq(serverOffers.id, existing.id));
        const syncTasks: Array<Promise<void>> = [
          syncArticleOfferSource({
            offerId: existing.id,
            sourcePostId: candidate.sourcePostId,
            articleUrl: candidate.articleUrl,
          }),
        ];
        if (!lockedFields.has("price")) {
          syncTasks.push(
            syncPrimaryOfferPrice({
              offerId: existing.id,
              priceAmount: candidate.priceAmount,
              originalPriceAmount: candidate.originalPriceAmount,
              currency: candidate.currency,
              billingCycle: candidate.billingCycle,
              purchaseUrl: lockedFields.has("purchaseUrl")
                ? existing.purchaseUrl
                : candidate.purchaseUrl,
            }),
          );
        }
        await Promise.all(syncTasks);
        updated += 1;
        continue;
      }

      const [created] = await db
        .insert(serverOffers)
        .values({
          ...candidate,
          providerName: provider?.name ?? null,
          providerId: provider?.id ?? null,
          monthlyPriceUsd:
            monthlyPriceUsd === null ? null : String(monthlyPriceUsd),
          reviewStatus: "pending",
          visible: false,
          duplicateKey: makeDuplicateKey(candidate, provider?.name),
        })
        .returning({ id: serverOffers.id });
      if (created) {
        await Promise.all([
          syncPrimaryOfferPrice({
            offerId: created.id,
            priceAmount: candidate.priceAmount,
            originalPriceAmount: candidate.originalPriceAmount,
            currency: candidate.currency,
            billingCycle: candidate.billingCycle,
            purchaseUrl: candidate.purchaseUrl,
          }),
          syncArticleOfferSource({
            offerId: created.id,
            sourcePostId: candidate.sourcePostId,
            articleUrl: candidate.articleUrl,
          }),
        ]);
      }
      inserted += 1;
    }
  }

  if (shouldRevalidate && (inserted > 0 || updated > 0)) {
    revalidateSiteContent([cacheTags.serverOffers]);
    await notifyPublicWebCache("offer.changed", {
      topicSlugs: [...publicOfferTopicSlugs],
    });
  }

  return {
    scannedPosts: sourcePosts.length,
    extracted,
    inserted,
    updated,
    skipped,
  };
}

export async function importServerOffersFromPost(
  postId: number,
  options: { revalidate?: boolean } = {},
) {
  const sourcePosts = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      language: posts.language,
      content: posts.content,
    })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  return importServerOffersFromPostRows(sourcePosts, options);
}

export async function getServerOfferImportPostOptions(limit = 120) {
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      language: posts.language,
      published: posts.published,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .orderBy(desc(posts.createdAt))
    .limit(limit);
}

export async function importServerOffersFromPosts(
  options: { revalidate?: boolean } = {},
) {
  const sourcePosts = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      language: posts.language,
      content: posts.content,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt));

  return importServerOffersFromPostRows(sourcePosts, options);
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
      updatedAt:
        offers
          .map((offer) => offer.updatedAt ?? offer.createdAt)
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null,
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
    updatedAt: Date | null;
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
      const updatedAt = row.updatedAt;
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
  "use cache";
  tagCache(cacheTags.serverOffers);

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
              const pattern = `%${keyword}%`;
              return [
                ilike(serverOffers.title, pattern),
                ilike(serverOffers.providerName, pattern),
                ilike(serverOffers.region, pattern),
                ilike(serverOffers.lineType, pattern),
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
    .orderBy(desc(serverOffers.createdAt))
    .offset((page - 1) * filters.pageSize)
    .limit(filters.pageSize);

  const offerIds = rows.map((row) => row.id);
  const [priceRows, checkRows] = offerIds.length
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
      ])
    : [[], []];

  const enrichedRows = rows.map((row) => ({
    ...row,
    prices: priceRows.filter((price) => price.offerId === row.id),
    recentChecks: checkRows
      .filter((check) => check.offerId === row.id)
      .slice(0, 5),
  }));

  return { rows: enrichedRows, total, page, pageSize: filters.pageSize };
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
  reviewStatus?: string | null;
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
    .select({ status: serverOffers.status })
    .from(serverOffers)
    .where(eq(serverOffers.id, id))
    .limit(1);
  if (!existing) return null;

  const [provider, taxonomy] = await Promise.all([
    input.providerId
      ? readDb
          .select({
            id: affServiceProviders.id,
            name: affServiceProviders.name,
            defaultPromoCode: affServiceProviders.defaultPromoCode,
          })
          .from(affServiceProviders)
          .where(eq(affServiceProviders.id, input.providerId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    resolveServerOfferTaxonomy(input),
  ]);
  const providerId = provider?.id ?? input.providerId ?? null;
  const providerName = provider?.name ?? input.providerName ?? null;
  const normalizedExternalProductId = input.externalProductId?.trim();
  let externalProductId: string | null = null;
  if (normalizedExternalProductId) {
    externalProductId = normalizedExternalProductId;
  }
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

  const memoryMb = parseStandaloneMemoryMb(input.memory);
  const storageGb = parseStandaloneStorageGb(input.storage);
  const bandwidthMbps = parseStandaloneBandwidthMbps(input.bandwidth);
  const trafficGb = parseStandaloneTrafficGb(input.traffic);
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
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(serverOffers)
      .set({
        title: input.title,
        offerKind: input.offerKind,
        providerId,
        providerName,
        externalProductId,
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
          input.offerKind === "regular" ? "unknown" : undefined,
        lastCheckedAt: input.offerKind === "regular" ? null : undefined,
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
        reviewStatus: input.reviewStatus ?? "reviewed",
        reviewedAt: now,
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
    await notifyPublicWebCache("offer.changed", {
      topicSlugs: [...publicOfferTopicSlugs],
    });
  }

  return updated ?? null;
}

export async function bulkUpdateServerOffers(input: {
  ids: number[];
  offerKind?: ServerOfferKind;
  status?: OfferStatus;
  visible?: boolean;
  featured?: boolean;
  reviewStatus?: string;
}) {
  if (input.ids.length === 0) {
    return { updated: 0 };
  }

  const values: Partial<typeof serverOffers.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.status) {
    values.status = input.status;
    values.statusChangedAt = values.updatedAt;
  }
  if (input.offerKind) {
    values.offerKind = input.offerKind;
    if (input.offerKind === "regular") {
      values.checkStatus = "unknown";
      values.lastCheckedAt = null;
    }
  }
  if (typeof input.visible === "boolean") values.visible = input.visible;
  if (typeof input.featured === "boolean") values.featured = input.featured;
  if (input.reviewStatus) {
    values.reviewStatus = input.reviewStatus;
    values.reviewedAt = new Date();
  }

  const rows = await db
    .update(serverOffers)
    .set(values)
    .where(inArray(serverOffers.id, input.ids))
    .returning({ id: serverOffers.id });

  if (rows.length > 0) {
    revalidateSiteContent([cacheTags.serverOffers]);
    await notifyPublicWebCache("offer.changed", {
      topicSlugs: [...publicOfferTopicSlugs],
    });
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
  const conditions = [
    publicPurchasableOfferBaseWhere(),
    or(
      eq(serverOffers.sourcePostId, input.postId),
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
      sourcePostId: serverOffers.sourcePostId,
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
        sql`case when ${serverOffers.sourcePostId} = ${input.postId} then 1 else 0 end`,
      ),
      desc(serverOffers.featured),
      asc(serverOffers.monthlyPriceUsd),
    )
    .limit(input.limit ?? 6);
}
