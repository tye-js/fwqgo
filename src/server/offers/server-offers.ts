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
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { db, readDb } from "@fwqgo/db";
import {
  affServiceProviders,
  posts,
  serverOffers,
} from "@fwqgo/db/schema";

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

const pricePattern =
  /(?:\$|USD|US\$|￥|¥|CNY|RMB)\s*([0-9]+(?:\.[0-9]+)?)/i;
const memoryPattern = /([0-9]+(?:\.[0-9]+)?)\s*(GB|G|MB|M)\s*(?:内存|RAM)?/i;
const storagePattern =
  /([0-9]+(?:\.[0-9]+)?)\s*(GB|G|TB|T)\s*(?:SSD|NVMe|HDD|硬盘|存储)?/i;
const bandwidthPattern =
  /([0-9]+(?:\.[0-9]+)?)\s*(Gbps|G口|Mbps|M口|M)\s*(?:带宽|端口)?/i;
const trafficPattern =
  /([0-9]+(?:\.[0-9]+)?)\s*(TB|T|GB|G)\s*(?:流量|traffic)?/i;
const cpuPattern =
  /([0-9]+)\s*(?:核|核心|Core|Cores|vCPU|CPU)|(?:CPU|vCPU)\s*[:：]?\s*([0-9]+)/i;
const ipv4Pattern = /([0-9]+)\s*(?:个)?\s*(?:IPv4|独立IP|IP)/i;
const promoPattern =
  /(?:优惠码|折扣码|优惠代码|Promo Code|Coupon)\s*[:：]?\s*([A-Za-z0-9_-]+)/i;
const urlPattern = /^https?:\/\//i;

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

function detectBillingCycle(text: string) {
  if (/年付|每年|\/年|\/yr|year/i.test(text)) return "yearly";
  if (/季付|季度|\/quarter/i.test(text)) return "quarterly";
  if (/半年|半年度/i.test(text)) return "semiannual";
  if (/月付|每月|\/月|\/mo|month/i.test(text)) return "monthly";
  return null;
}

function detectCurrency(text: string) {
  if (/￥|¥|CNY|RMB/i.test(text)) return "CNY";
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
  purchaseUrl?: string | null;
}) {
  const text = normalizeSpace(input.text);
  const priceMatch = pricePattern.exec(text);
  if (!priceMatch) return null;

  const memoryMatch = memoryPattern.exec(text);
  const storageMatch = storagePattern.exec(text);
  const bandwidthMatch = bandwidthPattern.exec(text);
  const trafficMatch = trafficPattern.exec(text);
  const cpuMatch = cpuPattern.exec(text);
  const ipv4Match = ipv4Pattern.exec(text);
  const promoMatch = promoPattern.exec(text);
  const title = extractTitle(text, input.sourcePostTitle);
  const purchaseUrl = input.purchaseUrl?.trim() ?? null;

  return {
    title,
    slug: makeOfferSlug({
      sourcePostId: input.sourcePostId,
      title,
      purchaseUrl,
    }),
    providerName: null,
    providerId: null,
    productType: /独立服务器|dedicated/i.test(text) ? "dedicated" : "vps",
    cpu: cpuMatch?.[0] ?? null,
    memory: memoryMatch?.[0] ?? null,
    memoryMb: toMb(memoryMatch?.[1], memoryMatch?.[2]),
    storage: storageMatch?.[0] ?? null,
    storageGb: toGb(storageMatch?.[1], storageMatch?.[2]),
    storageType: /nvme/i.test(text) ? "NVMe" : /ssd/i.test(text) ? "SSD" : null,
    bandwidth: bandwidthMatch?.[0] ?? null,
    bandwidthMbps: toMbps(bandwidthMatch?.[1], bandwidthMatch?.[2]),
    traffic: trafficMatch?.[0] ?? null,
    trafficGb: toGb(trafficMatch?.[1], trafficMatch?.[2]),
    region: detectRegion(text),
    countryCode: null,
    city: null,
    lineType: detectLineType(text),
    network: null,
    ipv4: ipv4Match?.[0] ?? null,
    ipv6: /IPv6/i.test(text) ? "IPv6" : null,
    priceAmount: priceMatch[1],
    originalPriceAmount: null,
    currency: detectCurrency(text),
    billingCycle: detectBillingCycle(text),
    promoCode: promoMatch?.[1] ?? null,
    purchaseUrl,
    articleUrl: `/fwq/posts/${input.sourcePostSlug}`,
    reviewUrl: null,
    sourcePostId: input.sourcePostId,
    status: "in_stock" satisfies OfferStatus,
    featured: false,
    visible: true,
    sortOrder: 0,
    rawText: text.slice(0, 4000),
  };
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
      .map((cell) => normalizeSpace($(cell).text()))
      .filter(Boolean);
    const firstRowIsHeader =
      $(rows[0]).find("th").length > 0 ||
      headerCells.some((cell) =>
        /套餐|配置|CPU|内存|硬盘|存储|带宽|流量|线路|地区|价格|购买|优惠/i.test(
          cell,
        ),
      );

    rows.forEach((row, rowIndex) => {
      if (rowIndex === 0 && firstRowIsHeader) return;

      const cells = $(row)
        .find("th,td")
        .toArray()
        .map((cell, cellIndex) => {
          const text = normalizeSpace($(cell).text());
          if (!text) return "";
          const header = headerCells[cellIndex];
          return header ? `${header}: ${text}` : text;
        });
      const rowText = cells.filter(Boolean).join(" | ");
      const href = $(row)
        .find("a[href]")
        .toArray()
        .map((link) => $(link).attr("href"))
        .find((hrefValue) => hrefValue && urlPattern.test(hrefValue));
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
    if (!pricePattern.test(text)) return;
    const href = $(element)
      .find("a[href]")
      .toArray()
      .map((link) => $(link).attr("href"))
      .find((hrefValue) => hrefValue && urlPattern.test(hrefValue));
    candidates.push({ text, purchaseUrl: href ?? null });
  });

  return candidates;
}

async function resolveProvider(purchaseUrl: string | null | undefined) {
  if (!purchaseUrl) return null;

  let host = "";
  try {
    host = new URL(purchaseUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }

  const providers = await db.select().from(affServiceProviders);
  return (
    providers.find((provider) => {
      let providerHost: string;
      try {
        providerHost = new URL(provider.officialUrl).hostname
          .replace(/^www\./i, "")
          .toLowerCase();
      } catch {
        providerHost = provider.officialUrl
          .replace(/^https?:\/\//i, "")
          .split("/")[0]!
          .replace(/^www\./i, "")
          .toLowerCase();
      }

      return host === providerHost || host.endsWith(`.${providerHost}`);
    }) ?? null
  );
}

type OfferSourcePost = {
  id: number;
  title: string;
  slug: string;
  content: string;
};

type ParsedServerOffer = NonNullable<ReturnType<typeof parseOfferText>>;

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

function makeDuplicateKey(
  candidate: ParsedServerOffer,
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
      const [existing] = await db
        .select({
          id: serverOffers.id,
          title: serverOffers.title,
        })
        .from(serverOffers)
        .where(serverOfferConfigWhere(candidate))
        .limit(1);

      if (existing) {
        await db
          .update(serverOffers)
          .set({
            title: candidate.title || existing.title,
            providerName: provider?.name ?? candidate.providerName,
            providerId: provider?.id ?? candidate.providerId,
            cpu: candidate.cpu,
            memory: candidate.memory,
            storage: candidate.storage,
            storageType: candidate.storageType,
            bandwidth: candidate.bandwidth,
            traffic: candidate.traffic,
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
            reviewUrl: candidate.reviewUrl,
            rawText: candidate.rawText,
            reviewStatus: "merged",
            duplicateKey: makeDuplicateKey(candidate, provider?.name),
            mergedIntoOfferId: null,
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
      content: posts.content,
    })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.createdAt));

  return importServerOffersFromPostRows(sourcePosts, options);
}

function topicWhere(topic: (typeof offerTopics)[number]) {
  const base = and(eq(serverOffers.visible, true), isNotNull(serverOffers.priceAmount));
  const regionConditions =
    topic.filters.regions?.map((region) => ilike(serverOffers.region, `%${region}%`)) ??
    [];

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
  const topic = offerTopics.find((item) => item.slug === slug);
  if (!topic) return null;

  try {
    const offers = await readDb
      .select({
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
        createdAt: serverOffers.createdAt,
      })
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
    createdAt: serverOffers.createdAt,
  };
}

export async function getServerOfferCollection(input: {
  kind: "provider" | "region" | "line";
  value: string;
}) {
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
      .where(and(eq(serverOffers.visible, true), eq(field, value)))
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
    };
  } catch (error) {
    console.error("Failed to load server offer collection:", error);
    return {
      title: `${value}${titlePrefix === "商家" ? "" : titlePrefix}服务器套餐`,
      description: `集中查看${value}相关服务器套餐，按价格、地区、线路、状态和购买入口筛选。`,
      offers: [],
    };
  }
}

export async function getServerOfferTopicCounts() {
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
      })
      .from(serverOffers)
      .where(and(eq(serverOffers.visible, true), inArray(serverOffers.status, ["in_stock", "preorder", "restocking"])))
      .orderBy(desc(serverOffers.featured), desc(serverOffers.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("Failed to load latest server offers:", error);
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
      createdAt: serverOffers.createdAt,
      updatedAt: serverOffers.updatedAt,
      reviewStatus: serverOffers.reviewStatus,
      duplicateKey: serverOffers.duplicateKey,
      mergedIntoOfferId: serverOffers.mergedIntoOfferId,
      reviewedAt: serverOffers.reviewedAt,
    })
    .from(serverOffers)
    .orderBy(desc(serverOffers.createdAt))
    .limit(limit);
}

export type ServerOfferUpdateInput = {
  title: string;
  providerName?: string | null;
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
  const [updated] = await db
    .update(serverOffers)
    .set({
      ...input,
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
  const tagText = input.tagNames.join(" ");
  const conditions = [
    eq(serverOffers.visible, true),
    or(
      eq(serverOffers.sourcePostId, input.postId),
      ...input.tagNames.flatMap((name) => [
        ilike(serverOffers.providerName, `%${name}%`),
        ilike(serverOffers.region, `%${name}%`),
        ilike(serverOffers.lineType, `%${name}%`),
      ]),
      tagText.includes("香港") ? ilike(serverOffers.region, "%香港%") : undefined,
      tagText.includes("美国") ? ilike(serverOffers.region, "%美国%") : undefined,
    ),
  ].filter(Boolean);

  return readDb
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
    })
    .from(serverOffers)
    .where(and(...conditions))
    .orderBy(
      desc(sql`case when ${serverOffers.sourcePostId} = ${input.postId} then 1 else 0 end`),
      desc(serverOffers.featured),
      asc(serverOffers.priceAmount),
    )
    .limit(input.limit ?? 6);
}
