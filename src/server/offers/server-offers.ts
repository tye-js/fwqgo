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
  or,
  sql,
} from "drizzle-orm";

import { slugify } from "@fwqgo/core/utils";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { cacheTags, revalidateSiteContent, tagCache } from "@fwqgo/cache/tags";
import { db, readDb } from "@fwqgo/db";
import { affServiceProviders, posts, serverOffers } from "@fwqgo/db/schema";
import { readOutboundShortTarget } from "@/server/links/outbound-short-link";

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

      if (existing) {
        await db
          .update(serverOffers)
          .set({
            title: candidate.title || existing.title,
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
            priceAmount: candidate.priceAmount,
            originalPriceAmount: candidate.originalPriceAmount,
            currency: candidate.currency,
            billingCycle: candidate.billingCycle,
            promoCode: candidate.promoCode,
            purchaseUrl: candidate.purchaseUrl,
            articleUrl: candidate.articleUrl,
            rawText: candidate.rawText,
            duplicateKey: makeDuplicateKey(candidate, provider?.name),
            updatedAt: new Date(),
          })
          .where(eq(serverOffers.id, existing.id));
        updated += 1;
        continue;
      }

      await db.insert(serverOffers).values({
        ...candidate,
        providerName: provider?.name ?? null,
        providerId: provider?.id ?? null,
        reviewStatus: "pending",
        duplicateKey: makeDuplicateKey(candidate, provider?.name),
      });
      inserted += 1;
    }
  }

  if (shouldRevalidate && (inserted > 0 || updated > 0)) {
    revalidateSiteContent([cacheTags.serverOffers]);
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
      eq(serverOffers.currency, "USD"),
      or(
        eq(serverOffers.billingCycle, "monthly"),
        sql`${serverOffers.billingCycle} is null`,
      ),
      sql`${serverOffers.priceAmount} <= ${topic.filters.maxMonthlyUsd}`,
    );
  }

  if (regionConditions.length > 0) {
    return and(base, or(...regionConditions));
  }

  return base;
}

export async function getServerOfferTopic(slug: string) {
  "use cache";
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
        asc(serverOffers.priceAmount),
        desc(serverOffers.createdAt),
      )
      .limit(80);

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
  "use cache";
  tagCache(cacheTags.serverOffers);

  const value = input.value.trim();
  if (!value) return null;

  const field =
    input.kind === "provider"
      ? serverOffers.providerName
      : input.kind === "region"
        ? serverOffers.region
        : serverOffers.lineType;
  const titlePrefix =
    input.kind === "provider"
      ? "商家"
      : input.kind === "region"
        ? "地区"
        : "线路";

  try {
    const offers = await readDb
      .select(serverOfferPublicSelect())
      .from(serverOffers)
      .where(and(publicPurchasableOfferBaseWhere(), eq(field, value)))
      .orderBy(
        desc(serverOffers.featured),
        asc(serverOffers.priceAmount),
        desc(serverOffers.createdAt),
      )
      .limit(120);

    return {
      title: `${value}${titlePrefix === "商家" ? "" : titlePrefix}服务器套餐`,
      description: `集中查看${value}相关服务器套餐，按价格、地区、线路、状态和购买入口筛选。`,
      offers,
      kind: input.kind,
      value,
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
      kind: input.kind,
      value,
      updatedAt: null,
    };
  }
}

export async function getServerOfferTopicCounts() {
  "use cache";
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

export async function getLatestServerOffers(limit = 8) {
  "use cache";
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
        asc(serverOffers.priceAmount),
        desc(serverOffers.createdAt),
      )
      .limit(limit);
  } catch (error) {
    console.error("Failed to load public server offers:", error);
    return [];
  }
}

export async function getServerOfferCollectionIndex(limit = 80) {
  type CollectionField =
    | typeof serverOffers.providerName
    | typeof serverOffers.region
    | typeof serverOffers.lineType;

  async function readCollection(
    field: CollectionField,
    kind: "provider" | "region" | "line",
  ) {
    const rows = await readDb
      .select({
        value: field,
        count: sql<number>`count(*)`,
        updatedAt: sql<Date | null>`max(coalesce(${serverOffers.updatedAt}, ${serverOffers.createdAt}))`,
      })
      .from(serverOffers)
      .where(and(publicPurchasableOfferBaseWhere(), isNotNull(field)))
      .groupBy(field)
      .orderBy(desc(sql`count(*)`), asc(field))
      .limit(limit);

    return rows
      .map((row) => ({
        kind,
        value: row.value?.trim() ?? "",
        count: Number(row.count ?? 0),
        updatedAt: row.updatedAt,
      }))
      .filter((row) => row.value.length > 0);
  }

  try {
    const [providers, regions, lines] = await Promise.all([
      readCollection(serverOffers.providerName, "provider"),
      readCollection(serverOffers.region, "region"),
      readCollection(serverOffers.lineType, "line"),
    ]);

    return { providers, regions, lines };
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

  const pattern = `%${query}%`;
  try {
    return await readDb
      .select(serverOfferPublicSelect())
      .from(serverOffers)
      .where(
        and(
          publicPurchasableOfferBaseWhere(),
          or(
            ilike(serverOffers.title, pattern),
            ilike(serverOffers.providerName, pattern),
            ilike(serverOffers.region, pattern),
            ilike(serverOffers.lineType, pattern),
            ilike(serverOffers.promoCode, pattern),
            ilike(serverOffers.rawText, pattern),
          ),
        ),
      )
      .orderBy(
        desc(serverOffers.featured),
        asc(serverOffers.priceAmount),
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
        asc(serverOffers.priceAmount),
        desc(serverOffers.createdAt),
      )
      .limit(input.limit ?? 6);
  } catch (error) {
    console.error("Failed to load keyword server offers:", error);
    return [];
  }
}

export async function getAdminServerOffers(limit = 80) {
  return readDb
    .select({
      id: serverOffers.id,
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
    .orderBy(desc(serverOffers.createdAt))
    .limit(limit);
}

export type ServerOfferUpdateInput = {
  title: string;
  providerName?: string | null;
  productType?: string | null;
  cpu?: string | null;
  memory?: string | null;
  storage?: string | null;
  bandwidth?: string | null;
  traffic?: string | null;
  priceAmount?: string | null;
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
};

export async function updateServerOffer(
  id: number,
  input: ServerOfferUpdateInput,
) {
  const memoryMb = parseStandaloneMemoryMb(input.memory);
  const storageGb = parseStandaloneStorageGb(input.storage);
  const bandwidthMbps = parseStandaloneBandwidthMbps(input.bandwidth);
  const trafficGb = parseStandaloneTrafficGb(input.traffic);
  const productType = input.productType ?? "vps";

  const [updated] = await db
    .update(serverOffers)
    .set({
      ...input,
      productType,
      memoryMb,
      storageGb,
      bandwidthMbps,
      trafficGb,
      duplicateKey: makeDuplicateKey({
        providerName: input.providerName,
        productType,
        memoryMb,
        storageGb,
        bandwidthMbps,
        trafficGb,
        region: input.region,
        lineType: input.lineType,
        priceAmount: input.priceAmount,
        currency: input.currency,
        billingCycle: input.billingCycle,
        purchaseUrl: input.purchaseUrl,
      }),
      reviewStatus: input.reviewStatus ?? "reviewed",
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(serverOffers.id, id))
    .returning({ id: serverOffers.id });

  if (updated) {
    revalidateSiteContent([cacheTags.serverOffers]);
  }

  return updated ?? null;
}

export async function bulkUpdateServerOffers(input: {
  ids: number[];
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

  if (input.status) values.status = input.status;
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
      asc(serverOffers.priceAmount),
    )
    .limit(input.limit ?? 6);
}
