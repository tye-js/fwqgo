/**
 * 从公开聚合站 vps.appsail.dev 导入服务器套餐事实，并套用本站返利配置。
 *
 * 默认 dry-run，只打印计划与报告；加 `--write` 才写库。
 *
 *   DATABASE_URL=... bun scripts/import-appsail-offers.ts
 *   DATABASE_URL=... bun scripts/import-appsail-offers.ts --write
 *
 * 设计要点：
 * - 事实字段（配置、价格、线路、测试 IP、延迟）来自对方公开 JSON，只补空、不覆盖人工维护的价格与库存；
 * - 购买链接优先复用本站已有的站内短链与链接模板，其次用供应商返利配置重建；
 *   拿不到本站返利链接的，落官方裸链并在报告里单独列出；
 * - 对方链接里的返利标识（AppSail / 其 aff 值）一律不写入。
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ServerOfferCnPing,
  ServerOfferGeoPing,
  ServerOfferTestIp,
} from "@fwqgo/core/server-offer-external-facts";
import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import {
  affServiceProviders,
  affiliateLinks,
  outboundLinks,
  serverNetworkLines,
  serverOfferPrices,
  serverOffers,
  serverOfferSources,
  serverRegions,
} from "@fwqgo/db/schema";

const SOURCE_KEY = "appsail";
const SOURCE_ORIGIN = "https://vps.appsail.dev";
const VENDORS_URL = `${SOURCE_ORIGIN}/data/vendors.json`;
const SOURCE_PAGE_URL = `${SOURCE_ORIGIN}/`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const shouldWrite = process.argv.includes("--write");
const outputDir = join(process.cwd(), "output", "appsail");
const today = new Date().toISOString().slice(0, 10);

type PingCarrier = {
  ms: number | null;
  loss: number | null;
  city: string | null;
  probes: number | null;
};

type RawPing = {
  ms?: number | null;
  loss?: number | null;
  date?: string | null;
  isp?: Record<string, PingCarrier> | null;
  src?: string[] | null;
  runs?: number | null;
};

type RawGeoPing = Record<string, unknown> & { date?: string | null };

type RawTestIp = {
  loc?: string | null;
  ip?: string | null;
  cn_ping?: RawPing | null;
  geo_ping?: RawGeoPing | null;
};

type RawPlan = {
  tier?: string | null;
  name?: string | null;
  lines?: string[] | null;
  tri_network?: boolean | null;
  vcpu?: number | null;
  ram_gb?: number | null;
  disk?: string | null;
  port?: string | null;
  port_mbps?: number | null;
  traffic?: string | null;
  price_native?: string | null;
  renew_native?: string | null;
  price_usd_month?: number | null;
  monthly_billing?: boolean | null;
  location?: string | null;
  regions?: string[] | null;
  claude?: string | null;
  refund?: string | null;
  refundable?: boolean | null;
  verified_date?: string | null;
  test_ip?: string | null;
  more_test_ips?: RawTestIp[] | null;
  buy_url?: string | null;
  product_url?: string | null;
  promo?: { name?: string | null; ends?: string | null } | null;
  panel_names?: string[] | null;
  native_ip?: string | null;
  in_stock?: boolean | null;
  cn_ping?: RawPing | null;
  geo_ping?: RawGeoPing | null;
};

type RawVendor = {
  id: string;
  name: string;
  url?: string | null;
  affiliate_link?: string | null;
  coupon?: { code?: string | null; note?: string | null } | null;
  locations?: string[] | null;
  plans?: RawPlan[] | null;
};

/** 聚合站 vendor id → 本站供应商名。没有对应供应商的留空，按「无返利配置」处理。 */
const VENDOR_PROVIDER: Record<string, string | null> = {
  racknerd: "racknerd",
  bandwagonhost: "bwh89",
  lcayun: "lcayun",
  dmit: "dmit",
  lisahost: "lisahost",
  vpshosting: "vps.hosting",
  hostkvm: "hostkvm",
  jtti: "jtti",
  tmhhost: "tmhhost",
  hostinger: null,
  digitalocean: null,
};

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: "USD",
  "¥": "CNY",
  "€": "EUR",
  "£": "GBP",
};

/** 地区名 → 本站 server_regions.slug。没有枚举的地区只写文本。 */
const REGION_SLUG: Record<string, string> = {
  中国香港: "hong-kong",
  香港: "hong-kong",
  美国: "united-states",
  日本: "japan",
  新加坡: "singapore",
  中国台湾: "taiwan",
  台湾: "taiwan",
  韩国: "south-korea",
  德国: "germany",
  英国: "united-kingdom",
  荷兰: "netherlands",
  越南: "vietnam",
};

/** 线路名 → 本站 server_network_lines.slug。 */
const LINE_SLUG: Record<string, string> = {
  "CN2 GIA": "cn2-gia",
  "CN2 GT": "cn2",
  CN2: "cn2",
  "9929": "as9929",
  "AS9929": "as9929",
  "4837": "as4837",
  "AS4837": "as4837",
  CMI: "cmi",
  CMIN2: "cmin2",
  BGP: "bgp",
  IIJ: "iij",
  直连: "direct",
  回程优化: "optimized",
  高防: "ddos-protected",
};

const BILLING_TERM_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isIpv4Address(value: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.trim());
}

function numberOrNull(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function parsePriceText(raw: string) {
  const amountMatch = /([$¥€£])\s*([\d.,]+)/.exec(raw);
  const symbol = amountMatch?.[1] ?? "";
  const amountText = amountMatch?.[2]?.replace(/,/g, "") ?? "";
  const amount = amountText ? Number(amountText) : null;
  const currency = CURRENCY_BY_SYMBOL[symbol] ?? null;

  const originalMatch =
    /(?:标价|原价)\s*([$¥€£])\s*([\d.,]+)/.exec(raw) ??
    /([$¥€£])\s*([\d.,]+)\s*[）)]?\s*$/.exec(raw);
  const originalAmount = originalMatch
    ? Number((originalMatch[2] ?? "").replace(/,/g, ""))
    : null;

  return {
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency,
    originalAmount:
      originalAmount !== null && Number.isFinite(originalAmount)
        ? originalAmount
        : null,
  };
}

function resolveBillingCycle(plan: RawPlan, priceNative: string) {
  const prepaid = /预付\s*(\d+)\s*个月/.exec(priceNative);
  if (prepaid) {
    const months = Number(prepaid[1]);
    if (months >= 36) return "triennial";
    if (months >= 24) return "biennial";
    if (months >= 12) return "yearly";
    if (months >= 6) return "semiannual";
    if (months >= 3) return "quarterly";
    return "monthly";
  }
  if (/\/\s*季/.test(priceNative) || priceNative.includes('季付')) return "quarterly";
  if (/\/\s*年/.test(priceNative) || priceNative.includes('年付')) return "yearly";
  if (plan.monthly_billing === false) return "yearly";
  return "monthly";
}

function parseStorage(raw: string) {
  const match = /([\d.]+)\s*(TB|TiB|GB|GiB)/i.exec(raw);
  if (!match) return { gb: null, type: null as string | null };
  const value = Number(match[1]);
  const unit = (match[2] ?? "").toUpperCase();
  const gb = Number.isFinite(value)
    ? Math.round(unit.includes('T') ? value * 1024 : value)
    : null;
  const typeMatch = /(NVMe|SSD|HDD|SATA)/i.exec(raw);
  return { gb, type: typeMatch ? typeMatch[1] ?? null : null };
}

function parseTrafficGb(raw: string) {
  if (/不限|不计/.test(raw)) return null;
  const match = /([\d.]+)\s*(TB|TiB|GB|GiB)/i.exec(raw);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(/T/i.test(match[2] ?? "") ? value * 1000 : value);
}

function parsePortMbps(plan: RawPlan) {
  const direct = numberOrNull(plan.port_mbps);
  if (direct) return Math.round(direct);
  const match = /([\d.]+)\s*(Gbps|Mbps)/i.exec(text(plan.port));
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(/G/i.test(match[2] ?? "") ? value * 1000 : value);
}

function resolveRegion(plan: RawPlan, vendor: RawVendor) {
  const candidates = [
    ...(plan.regions ?? []),
    ...(plan.location ? [plan.location] : []),
    text(plan.name),
  ];
  for (const candidate of candidates) {
    for (const [label, slug] of Object.entries(REGION_SLUG)) {
      if (candidate.includes(label)) {
        return { region: label, slug };
      }
    }
  }
  const first = (plan.regions ?? [])[0] ?? (vendor.locations ?? [])[0] ?? null;
  return { region: first ? text(first) || null : null, slug: null };
}

function resolveLine(plan: RawPlan) {
  for (const line of plan.lines ?? []) {
    const key = text(line);
    if (!key || key === "普通线路") continue;
    if (LINE_SLUG[key]) return { lineType: key, slug: LINE_SLUG[key] };
    for (const [label, slug] of Object.entries(LINE_SLUG)) {
      if (key.includes(label)) return { lineType: key, slug };
    }
  }
  return { lineType: null as string | null, slug: null as string | null };
}

function extractProductId(plan: RawPlan) {
  for (const raw of [plan.buy_url, plan.product_url]) {
    const url = text(raw);
    if (!url) continue;
    const match = /[?&](?:pid|id)=(\d+)/i.exec(url);
    if (match?.[1]) return match[1];
  }
  return null;
}

function toCnPing(raw: RawPing | null | undefined): ServerOfferCnPing | null {
  if (!raw) return null;
  const isp: Record<string, PingCarrier> = {};
  for (const [carrier, value] of Object.entries(raw.isp ?? {})) {
    if (!value) continue;
    isp[carrier] = {
      ms: numberOrNull(value.ms),
      loss: numberOrNull(value.loss),
      city: text(value.city) || null,
      probes: numberOrNull(value.probes),
    };
  }
  return {
    ms: numberOrNull(raw.ms),
    loss: numberOrNull(raw.loss),
    date: text(raw.date) || null,
    isp: Object.keys(isp).length > 0 ? isp : null,
    src: Array.isArray(raw.src) ? raw.src.map((item) => text(item)) : null,
    runs: numberOrNull(raw.runs),
  };
}

function toGeoPing(
  raw: RawGeoPing | null | undefined,
): ServerOfferGeoPing | null {
  if (!raw) return null;
  const output: ServerOfferGeoPing = { date: text(raw.date) || null };
  for (const [node, value] of Object.entries(raw)) {
    if (node === "date") continue;
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    output[node] = {
      ms: numberOrNull(record.ms),
      loss: numberOrNull(record.loss),
      runs: numberOrNull(record.runs),
    };
  }
  return output;
}

function toTestIps(plan: RawPlan): ServerOfferTestIp[] {
  const items: ServerOfferTestIp[] = [];
  const seen = new Set<string>();
  const primaryIp = text(plan.test_ip);
  if (primaryIp) {
    seen.add(primaryIp);
    items.push({
      loc: text(plan.location) || null,
      ip: primaryIp,
      cnPing: toCnPing(plan.cn_ping),
      geoPing: toGeoPing(plan.geo_ping),
    });
  }
  for (const extra of plan.more_test_ips ?? []) {
    const ip = text(extra.ip);
    if (!ip || seen.has(ip)) continue;
    seen.add(ip);
    items.push({
      loc: text(extra.loc) || null,
      ip,
      cnPing: toCnPing(extra.cn_ping),
      geoPing: toGeoPing(extra.geo_ping),
    });
  }
  return items;
}

/** 去掉第三方返利标识，得到官方裸链。 */
function stripThirdPartyAffiliate(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    for (const key of [
      "REFERRALCODE",
      "referralcode",
      "aff",
      "affid",
      "ref",
      "aff_code",
      "k",
      "promo",
    ]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

type ProviderRow = typeof affServiceProviders.$inferSelect;
type OfferRow = typeof serverOffers.$inferSelect;

type AffiliateOutcome = {
  purchaseUrl: string;
  status: "short-link" | "template" | "provider-aff" | "missing";
  detail: string;
};

/** 从既有链接里学一个「含产品 ID 参数」的模板，用于给新套餐套用本站返利。 */
function learnUrlTemplate(
  urls: string[],
  allowedHosts: string[],
): string | null {
  const counter = new Map<string, number>();
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const host = url.hostname.replace(/^www\./, "");
    if (allowedHosts.length > 0 && !allowedHosts.includes(host)) continue;
    const match = /([?&](?:pid|id)=)(\d+)/i.exec(raw);
    if (!match) continue;
    const template = raw.replace(match[0], `${match[1]}{ID}`);
    counter.set(template, (counter.get(template) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [template, count] of counter) {
    if (count > bestCount) {
      best = template;
      bestCount = count;
    }
  }
  return best;
}

function hostOf(raw: string) {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function main() {
  const response = await fetch(VENDORS_URL, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`抓取失败：HTTP ${response.status}`);
  }
  const vendors = (await response.json()) as RawVendor[];
  if (!Array.isArray(vendors) || vendors.length === 0) {
    throw new Error("抓取结果为空或格式不符");
  }

  await mkdir(outputDir, { recursive: true });
  const snapshotPath = join(outputDir, `vendors-${today}.json`);
  await writeFile(snapshotPath, JSON.stringify(vendors, null, 2), "utf8");

  const providers = await db.select().from(affServiceProviders);
  const providerByName = new Map(providers.map((row) => [row.name, row]));
  const regions = await db.select().from(serverRegions);
  const regionIdBySlug = new Map(regions.map((row) => [row.slug, row.id]));
  const lines = await db.select().from(serverNetworkLines);
  const lineIdBySlug = new Map(lines.map((row) => [row.slug, row.id]));

  const providerIds = providers.map((row) => row.id);
  const vendorNames = [...new Set(vendors.map((vendor) => vendor.id))];
  const existingOffers = await db
    .select()
    .from(serverOffers)
    .where(
      or(
        providerIds.length
          ? inArray(serverOffers.providerId, providerIds)
          : undefined,
        inArray(serverOffers.providerName, vendorNames),
      ),
    );
  const offersByKey = new Map<string, OfferRow>();
  const offersBySlug = new Map<string, OfferRow>();
  for (const offer of existingOffers) {
    if (offer.externalProductId) {
      const key = offer.providerId
        ? `${offer.providerId}|${offer.externalProductId}`
        : `${offer.providerName}|${offer.externalProductId}`;
      offersByKey.set(key, offer);
    }
    offersBySlug.set(offer.slug, offer);
  }

  const affLinks = await db
    .select({
      providerId: affiliateLinks.providerId,
      externalProductId: affiliateLinks.externalProductId,
      affiliateTargetUrl: affiliateLinks.affiliateTargetUrl,
      enabled: affiliateLinks.enabled,
      slug: outboundLinks.slug,
    })
    .from(affiliateLinks)
    .innerJoin(outboundLinks, eq(outboundLinks.id, affiliateLinks.outboundLinkId));
  const affByKey = new Map(
    affLinks.map((row) => [
      `${row.providerId}|${row.externalProductId}`,
      row,
    ]),
  );

  const templateCache = new Map<number, string | null>();
  function providerTemplate(provider: ProviderRow) {
    if (templateCache.has(provider.id)) return templateCache.get(provider.id) ?? null;
    const allowed = [hostOf(provider.officialUrl), hostOf(provider.offerAffUrl)]
      .filter(Boolean);
    const urls = [
      ...existingOffers
        .filter((offer) => offer.providerId === provider.id)
        .map((offer) => text(offer.purchaseUrl)),
      ...affLinks
        .filter((row) => row.providerId === provider.id)
        .map((row) => text(row.affiliateTargetUrl)),
    ].filter(Boolean);
    const template = learnUrlTemplate(urls, allowed);
    templateCache.set(provider.id, template);
    return template;
  }

  function resolveAffiliate(input: {
    provider: ProviderRow | null;
    externalProductId: string;
    productId: string | null;
    officialUrl: string;
  }): AffiliateOutcome {
    const { provider, externalProductId, productId, officialUrl } = input;
    if (!provider) {
      return {
        purchaseUrl: officialUrl,
        status: "missing",
        detail: "本站无该供应商档案，只能用官方链接（无返利）",
      };
    }

    const link = affByKey.get(`${provider.id}|${externalProductId}`);
    if (link?.enabled && link.slug) {
      return {
        purchaseUrl: `/go/${link.slug}`,
        status: "short-link",
        detail: "复用站内短链",
      };
    }

    const template = providerTemplate(provider);
    if (template && productId) {
      return {
        purchaseUrl: template.replace("{ID}", productId),
        status: "template",
        detail: provider.offerAffValue
          ? "按本站链接模板套产品 ID"
          : `按历史链接模板套产品 ID（供应商档案缺返利配置，沿用历史 aff）`,
      };
    }

    // 套餐采集返利配置为空时，回退到供应商档案里的通用返利配置（affUrl/affParam/affValue）。
    const affiliate = {
      url: text(provider.offerAffUrl) || text(provider.affUrl),
      param: text(provider.offerAffParam) || text(provider.affParam),
      value: text(provider.offerAffValue) || text(provider.affValue),
      mode: text(provider.offerAffUrl)
        ? provider.offerAffiliateMode
        : text(provider.affParam) === "href"
          ? "full_replace"
          : "query_param",
      source: text(provider.offerAffUrl) ? "套餐采集返利配置" : "通用返利配置",
    };

    if (affiliate.url) {
      if (affiliate.mode === "full_replace") {
        return {
          purchaseUrl: affiliate.url,
          status: "provider-aff",
          detail: `${affiliate.source}：full_replace 模式，返利短链不带产品定位`,
        };
      }
      if (productId && affiliate.param && affiliate.value) {
        try {
          const url = new URL(officialUrl);
          url.searchParams.set(affiliate.param, affiliate.value);
          return {
            purchaseUrl: url.toString(),
            status: "provider-aff",
            detail: `${affiliate.source}：产品页 + ${affiliate.param}=${affiliate.value}`,
          };
        } catch {
          // 官方链接不可解析时退回通用返利入口。
        }
      }
      return {
        purchaseUrl: affiliate.url,
        status: "provider-aff",
        detail: `${affiliate.source}：通用返利入口（无产品级参数）`,
      };
    }

    return {
      purchaseUrl: officialUrl,
      status: "missing",
      detail: "供应商档案未配置返利链接",
    };
  }

  type PlanResult = {
    vendorId: string;
    vendorName: string;
    planName: string;
    providerId: number | null;
    providerName: string | null;
    externalProductId: string;
    action: "update" | "insert";
    affiliate: AffiliateOutcome;
    title: string;
    priceText: string;
    monthlyUsd: number | null;
    region: string | null;
    lineType: string | null;
  };

  const results: PlanResult[] = [];
  const skipped: { vendorId: string; planName: string; reason: string }[] = [];

  for (const vendor of vendors) {
    const providerName = VENDOR_PROVIDER[vendor.id] ?? null;
    const provider = providerName ? providerByName.get(providerName) ?? null : null;
    const vendorPlans = vendor.plans ?? [];
    const pidCounts = new Map<string, number>();
    for (const plan of vendorPlans) {
      const pid = extractProductId(plan);
      if (pid) pidCounts.set(pid, (pidCounts.get(pid) ?? 0) + 1);
    }
    const usedPid = new Map<string, number>();

    for (const plan of vendorPlans) {
      const planName = text(plan.name);
      if (!planName) {
        skipped.push({ vendorId: vendor.id, planName: "(无名称)", reason: "缺少套餐名" });
        continue;
      }

      const productId = extractProductId(plan);
      let externalProductId: string;
      if (productId) {
        const total = pidCounts.get(productId) ?? 1;
        const seen = (usedPid.get(productId) ?? 0) + 1;
        usedPid.set(productId, seen);
        const base = !provider
          ? `${SOURCE_KEY}:${vendor.id}:${productId}`
          : provider.name === "vps.hosting" &&
              offersByKey.has(`${provider.id}|id:${productId}`)
            ? `id:${productId}`
            : `pid:${productId}`;
        externalProductId = total > 1 && seen > 1 ? `${base}#${seen}` : base;
      } else {
        externalProductId = `${SOURCE_KEY}:${vendor.id}:${slugify(planName, 60)}`;
      }

      const priceNative = text(plan.price_native);
      const price = parsePriceText(priceNative);
      const storage = parseStorage(text(plan.disk));
      const region = resolveRegion(plan, vendor);
      const line = resolveLine(plan);
      const officialUrl =
        stripThirdPartyAffiliate(text(plan.product_url) || text(plan.buy_url)) ||
        text(vendor.url) ||
        text(provider?.officialUrl);

      const affiliate = resolveAffiliate({
        provider,
        externalProductId,
        productId,
        officialUrl,
      });

      const existing =
        (provider
          ? offersByKey.get(`${provider.id}|${externalProductId}`)
          : offersByKey.get(`${vendor.id}|${externalProductId}`)) ?? undefined;

      results.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        planName,
        providerId: provider?.id ?? null,
        providerName: provider?.name ?? vendor.id,
        externalProductId,
        action: existing ? "update" : "insert",
        affiliate,
        title: planName,
        priceText: priceNative,
        monthlyUsd: numberOrNull(plan.price_usd_month),
        region: region.region,
        lineType: line.lineType,
      });

      if (!shouldWrite) continue;

      const now = new Date();
      const billingCycle = resolveBillingCycle(plan, priceNative);
      const verifiedAt = text(plan.verified_date);
      const verifiedDate = verifiedAt ? new Date(`${verifiedAt}T00:00:00Z`) : null;
      const locked = new Set(existing?.lockedFields ?? []);
      const cnPing = toCnPing(plan.cn_ping);
      const geoPing = toGeoPing(plan.geo_ping);

      const externalFacts = {
        tier: text(plan.tier) || null,
        claudeSupport: text(plan.claude) || null,
        nativeIpType: text(plan.native_ip) || null,
        triNetwork: plan.tri_network === true,
        refundPolicy: text(plan.refund) || null,
        renewPriceNative: text(plan.renew_native) || null,
        panelNames: (plan.panel_names ?? []).map((item) => text(item)).filter(Boolean),
        testIps: toTestIps(plan),
        cnPing,
        geoPing,
        externalSource: SOURCE_KEY,
        externalVerifiedAt: verifiedDate,
      };

      const specValues = {
        cpu: plan.vcpu ? `${plan.vcpu} 核` : null,
        vcpuCount:
          numberOrNull(plan.vcpu) !== null ? String(plan.vcpu) : null,
        memory: plan.ram_gb ? `${plan.ram_gb}G` : null,
        memoryMb: plan.ram_gb ? Math.round(plan.ram_gb * 1024) : null,
        storage: text(plan.disk) || null,
        storageGb: storage.gb,
        storageType: storage.type,
        bandwidth: text(plan.port) || null,
        bandwidthMbps: parsePortMbps(plan),
        traffic: text(plan.traffic) || null,
        trafficGb: parseTrafficGb(text(plan.traffic)),
        network: (plan.lines ?? []).join("、") || null,
        ipv4: text(plan.test_ip) || null,
      };
      const locationValues = {
        region: region.region,
        regionId: region.slug ? regionIdBySlug.get(region.slug) ?? null : null,
        countryCode: null as string | null,
        city: text(plan.location) || null,
        lineType: line.lineType,
        lineId: line.slug ? lineIdBySlug.get(line.slug) ?? null : null,
      };
      const statusValues = {
        status: plan.in_stock === false ? "out_of_stock" : "in_stock",
        statusChangedAt: null as Date | null,
      };

      if (existing) {
        const patch: Partial<typeof serverOffers.$inferInsert> = {
          ...externalFacts,
          lastCheckedAt: now,
          updatedAt: now,
        };
        if (!locked.has("specs")) {
          for (const [key, value] of Object.entries(specValues)) {
            if (value === null) continue;
            // 历史记录里的 ipv4 常是「1 IPv4」这类文案，不是地址，允许被真实测试 IP 替换。
            if (key === "ipv4" && !isIpv4Address(text(existing.ipv4))) {
              Object.assign(patch, { ipv4: value });
              continue;
            }
            const current = existing[key as keyof OfferRow];
            if (current === null || current === undefined || current === "") {
              Object.assign(patch, { [key]: value });
            }
          }
        }
        if (!locked.has("location")) {
          for (const [key, value] of Object.entries(locationValues)) {
            if (value === null) continue;
            const current = existing[key as keyof OfferRow];
            if (current === null || current === undefined || current === "") {
              Object.assign(patch, { [key]: value });
            }
          }
        }
        if (!locked.has("status") && !existing.statusChangedAt) {
          const nextStatus = statusValues.status;
          if (nextStatus !== existing.status) {
            Object.assign(patch, { status: nextStatus, statusChangedAt: now });
          }
        }
        if (existing.priceAmount === null && price.amount !== null) {
          patch.priceAmount = price.amount.toFixed(2);
          patch.currency = price.currency ?? existing.currency ?? "USD";
          patch.billingCycle = billingCycle;
        }
        if (existing.monthlyPriceUsd === null && numberOrNull(plan.price_usd_month) !== null) {
          patch.monthlyPriceUsd = String(plan.price_usd_month);
        }
        if (!text(existing.purchaseUrl)) {
          patch.purchaseUrl = affiliate.purchaseUrl;
        }
        await db
          .update(serverOffers)
          .set(patch)
          .where(eq(serverOffers.id, existing.id));

        await upsertPrice(existing.id, {
          billingCycle,
          amount: price.amount,
          originalAmount: price.originalAmount,
          currency: price.currency ?? existing.currency ?? "USD",
          monthlyPriceUsd: numberOrNull(plan.price_usd_month),
          purchaseUrl: affiliate.purchaseUrl,
          validUntil: plan.promo?.ends ? new Date(`${plan.promo.ends}T00:00:00Z`) : null,
          overwriteAmount: existing.priceAmount === null,
        });
        await upsertSource(existing.id, vendor, externalProductId);
      } else {
        const slugBase = `${slugify(provider?.name ?? vendor.name, 40)}-${slugify(planName, 60)}`;
        let slug = `${slugBase}-${shortHash(`${vendor.id}|${externalProductId}`)}`.slice(0, 360);
        let attempt = 1;
        while (offersBySlug.has(slug)) {
          slug = `${slugBase}-${shortHash(`${vendor.id}|${externalProductId}|${attempt}`)}`.slice(0, 360);
          attempt += 1;
        }

        const [inserted] = await db
          .insert(serverOffers)
          .values({
            title: planName,
            slug,
            externalProductId,
            productGroup: vendor.name,
            offerKind: "regular",
            providerName: provider?.name ?? vendor.id,
            providerId: provider?.id ?? null,
            productType: "vps",
            ...specValues,
            ...locationValues,
            ...externalFacts,
            priceAmount: price.amount !== null ? price.amount.toFixed(2) : null,
            originalPriceAmount:
              price.originalAmount !== null ? price.originalAmount.toFixed(2) : null,
            currency: price.currency ?? "USD",
            billingCycle,
            monthlyPriceUsd:
              numberOrNull(plan.price_usd_month) !== null
                ? String(plan.price_usd_month)
                : null,
            purchaseUrl: affiliate.purchaseUrl,
            status: statusValues.status,
            checkStatus: "ok",
            reviewStatus: "pending",
            visible: true,
            rawText: JSON.stringify(plan),
            lastCheckedAt: now,
            validUntil: plan.promo?.ends
              ? new Date(`${plan.promo.ends}T00:00:00Z`)
              : null,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: serverOffers.id });

        if (!inserted) throw new Error(`写入失败：${planName}`);
        offersBySlug.set(slug, {
          ...(inserted as unknown as OfferRow),
          id: inserted.id,
        });

        await upsertPrice(inserted.id, {
          billingCycle,
          amount: price.amount,
          originalAmount: price.originalAmount,
          currency: price.currency ?? "USD",
          monthlyPriceUsd: numberOrNull(plan.price_usd_month),
          purchaseUrl: affiliate.purchaseUrl,
          validUntil: plan.promo?.ends ? new Date(`${plan.promo.ends}T00:00:00Z`) : null,
          overwriteAmount: true,
        });
        await upsertSource(inserted.id, vendor, externalProductId);
      }
    }
  }

  async function upsertPrice(
    offerId: number,
    input: {
      billingCycle: string;
      amount: number | null;
      originalAmount: number | null;
      currency: string;
      monthlyPriceUsd: number | null;
      purchaseUrl: string;
      validUntil: Date | null;
      overwriteAmount: boolean;
    },
  ) {
    if (input.amount === null || input.monthlyPriceUsd === null) return;
    const termMonths = BILLING_TERM_MONTHS[input.billingCycle] ?? 1;
    const values = {
      offerId,
      billingCycle: input.billingCycle,
      termMonths,
      amount: input.amount.toFixed(2),
      originalAmount:
        input.originalAmount !== null ? input.originalAmount.toFixed(2) : null,
      currency: input.currency,
      monthlyPriceUsd: input.monthlyPriceUsd.toFixed(4),
      purchaseUrl: input.purchaseUrl,
      active: true,
      validUntil: input.validUntil,
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
        set: {
          ...(input.overwriteAmount
            ? {
                amount: values.amount,
                originalAmount: values.originalAmount,
                monthlyPriceUsd: values.monthlyPriceUsd,
              }
            : {}),
          purchaseUrl: values.purchaseUrl,
          active: true,
          validUntil: values.validUntil,
          updatedAt: values.updatedAt,
        },
      });
  }

  async function upsertSource(
    offerId: number,
    vendor: RawVendor,
    externalProductId: string,
  ) {
    const externalId = `${SOURCE_KEY}:${vendor.id}:${externalProductId}`;
    const existing = await db
      .select({ id: serverOfferSources.id })
      .from(serverOfferSources)
      .where(
        and(
          eq(serverOfferSources.offerId, offerId),
          eq(serverOfferSources.sourceType, "provider"),
          eq(serverOfferSources.externalId, externalId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(serverOfferSources)
        .set({ sourceUrl: SOURCE_PAGE_URL, updatedAt: new Date() })
        .where(eq(serverOfferSources.id, existing[0]!.id));
      return;
    }
    await db.insert(serverOfferSources).values({
      offerId,
      sourceType: "provider",
      sourceUrl: SOURCE_PAGE_URL,
      externalId,
      priority: 0,
    });
  }

  const replaced = results.filter(
    (item) => item.affiliate.status !== "missing",
  );
  const missing = results.filter((item) => item.affiliate.status === "missing");
  const byStatus = new Map<string, number>();
  for (const item of results) {
    byStatus.set(
      item.affiliate.status,
      (byStatus.get(item.affiliate.status) ?? 0) + 1,
    );
  }

  const reportLines: string[] = [
    `# appsail 套餐导入报告 ${today}`,
    "",
    `- 数据源：${VENDORS_URL}`,
    `- 快照：${snapshotPath}`,
    `- 模式：${shouldWrite ? "写入" : "dry-run"}`,
    `- 套餐总数：${results.length}`,
    `- 更新已有：${results.filter((item) => item.action === "update").length}`,
    `- 新增：${results.filter((item) => item.action === "insert").length}`,
    `- 跳过：${skipped.length}`,
    "",
    "## 返利链接",
    "",
    `- 已替换：${replaced.length}`,
    `- 未替换：${missing.length}`,
    "",
    "| 结果 | 数量 | 说明 |",
    "| --- | --- | --- |",
    ...[...byStatus].map(
      ([status, count]) =>
        `| ${status} | ${count} | ${
          {
            "short-link": "复用站内 /go 短链",
            template: "按本站链接模板套产品 ID",
            "provider-aff": "供应商级返利链接（无产品参数）",
            missing: "无返利链接，落官方裸链",
          }[status] ?? status
        } |`,
    ),
    "",
    "## 供应商档案缺口",
    "",
    "| 供应商 | 本站档案 | 返利配置 | 影响 |",
    "| --- | --- | --- | --- |",
    ...providers
      .filter((provider) => {
        const ids = new Set(results.map((item) => item.providerId));
        return ids.has(provider.id);
      })
      .map((provider) => {
        const items = results.filter((item) => item.providerId === provider.id);
        const replacedCount = items.filter(
          (item) => item.affiliate.status !== "missing",
        ).length;
        const affLabel =
          provider.offerAffParam && provider.offerAffValue
            ? `${provider.offerAffParam}=${provider.offerAffValue}（套餐采集）`
            : provider.affParam && provider.affValue
              ? `${provider.affParam}=${provider.affValue}（通用）`
              : provider.affUrl || "缺";
        return `| ${provider.name} | #${provider.id} | ${affLabel} | ${
          replacedCount === items.length
            ? `购买链接已带本站返利（${items.length} 条）`
            : `${items.length - replacedCount} 条仍为官方裸链`
        } |`;
      }),
    ...vendorNames
      .filter((vendorId) => !VENDOR_PROVIDER[vendorId])
      .map(
        (vendorId) =>
          `| ${vendorId} | 无 | 无 | 该供应商套餐全部落官方裸链，未替换返利 |`,
      ),
    "",
    "## 未替换返利链接的套餐",
    "",
    "| 供应商 | 套餐 | 原因 | 落地链接 |",
    "| --- | --- | --- | --- |",
    ...missing.map(
      (item) =>
        `| ${item.vendorName} | ${item.planName} | ${item.affiliate.detail} | ${item.affiliate.purchaseUrl} |`,
    ),
    "",
    "## 全部套餐",
    "",
    "| 供应商 | 套餐 | 匹配供应商 | 外部键 | 动作 | 返利 | 月价 USD | 地区 | 线路 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (item) =>
        `| ${item.vendorName} | ${item.planName} | ${item.providerName ?? "-"} | ${item.externalProductId} | ${item.action} | ${item.affiliate.status} | ${item.monthlyUsd ?? "-"} | ${item.region ?? "-"} | ${item.lineType ?? "-"} |`,
    ),
  ];
  if (skipped.length > 0) {
    reportLines.push("", "## 跳过", "");
    for (const item of skipped) {
      reportLines.push(`- ${item.vendorId} / ${item.planName}：${item.reason}`);
    }
  }

  const reportPath = join(outputDir, `import-report-${today}.md`);
  await writeFile(reportPath, reportLines.join("\n"), "utf8");

  console.log(
    JSON.stringify(
      {
        mode: shouldWrite ? "write" : "dry-run",
        snapshot: snapshotPath,
        report: reportPath,
        total: results.length,
        updated: results.filter((item) => item.action === "update").length,
        inserted: results.filter((item) => item.action === "insert").length,
        replacedAffiliate: replaced.length,
        missingAffiliate: missing.length,
        byStatus: Object.fromEntries(byStatus),
        missingVendors: [...new Set(missing.map((item) => item.vendorName))],
      },
      null,
      2,
    ),
  );
}

await main();
