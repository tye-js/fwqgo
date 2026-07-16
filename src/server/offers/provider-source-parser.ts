import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import type {
  PROVIDER_AVAILABILITY_STATUSES,
  HtmlFieldConfig,
  HtmlMonitorConfig,
  JsonMonitorConfig,
  ProviderMonitorConfig,
  ProviderSourceAdapter,
} from "@fwqgo/core/provider-monitor-config";

type AvailabilityStatus = (typeof PROVIDER_AVAILABILITY_STATUSES)[number];

export type ProviderOfferPriceCandidate = {
  amount: string;
  originalAmount: string | null;
  currency: string;
  billingCycle: string;
  purchaseUrl: string | null;
};

export type ProviderOfferCandidate = {
  externalProductId: string;
  title: string;
  productGroup: string | null;
  productType: string;
  cpu: string | null;
  memory: string | null;
  storage: string | null;
  bandwidth: string | null;
  traffic: string | null;
  region: string | null;
  countryCode: string | null;
  city: string | null;
  lineType: string | null;
  network: string | null;
  ipv4: string | null;
  ipv6: string | null;
  status: AvailabilityStatus;
  purchaseUrl: string;
  promoCode: string | null;
  prices: ProviderOfferPriceCandidate[];
  sourceUrl: string;
  raw: Record<string, unknown>;
};

export type ProviderOfferCandidateQuality = {
  valid: boolean;
  reasons: string[];
  specCount: number;
};

function readPath(value: unknown, path: string) {
  if (!path.trim()) return value;
  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    if (typeof current === "object" && current !== null) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function toText(value: unknown) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function nullableText(value: unknown) {
  return toText(value) || null;
}

function normalizeAmount(value: unknown) {
  const text = toText(value).replaceAll(",", "");
  const match = /-?\d+(?:\.\d+)?/.exec(text);
  return match?.[0] ?? "";
}

function inferCurrency(value: unknown, fallback: string) {
  const text = toText(value).toUpperCase();
  if (/\b(?:USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD)\b/.test(text)) {
    return /\b(USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD)\b/.exec(text)?.[1] === "RMB"
      ? "CNY"
      : (/\b(USD|EUR|GBP|CNY|HKD|JPY|CAD|AUD)\b/.exec(text)?.[1] ??
          fallback.toUpperCase());
  }
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  if (text.includes("¥") || text.includes("￥")) return "CNY";
  return fallback.trim().toUpperCase() || "USD";
}

function normalizeStatus(
  value: unknown,
  statusMap: Record<string, AvailabilityStatus>,
  fallback: AvailabilityStatus,
) {
  if (typeof value === "boolean") return value ? "in_stock" : "out_of_stock";
  const raw = toText(value);
  if (!raw) return fallback;
  const mapped = statusMap[raw] ?? statusMap[raw.toLowerCase()];
  if (mapped) return mapped;
  if (/^(true|yes|available|in[_ -]?stock|有货)$/i.test(raw)) return "in_stock";
  if (
    /^(false|no|unavailable|out[_ -]?of[_ -]?stock|sold[_ -]?out|缺货)$/i.test(
      raw,
    )
  ) {
    return "out_of_stock";
  }
  if (/restock|补货/i.test(raw)) return "restocking";
  if (/preorder|预售/i.test(raw)) return "preorder";
  if (/discontinued|停售/i.test(raw)) return "discontinued";
  return fallback;
}

function resolveUrl(value: unknown, baseUrl: string) {
  const text = toText(value);
  if (!text) return "";
  try {
    const url = new URL(text, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function inferExternalProductId(explicitId: string, purchaseUrl: string) {
  if (explicitId) return explicitId;
  try {
    const url = new URL(purchaseUrl);
    for (const key of ["pid", "product", "productId", "id"]) {
      const value = url.searchParams.get(key)?.trim();
      if (value) return `${key}:${value}`;
    }
    const path = url.pathname.replace(/\/+$/, "");
    return path && path !== "/" ? path : "";
  } catch {
    return "";
  }
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : { value: toText(value) };
}

function jsonPriceCandidates(
  item: unknown,
  config: JsonMonitorConfig,
  baseUrl: string,
) {
  const priceSource = config.pricesPath
    ? readPath(item, config.pricesPath)
    : null;
  const rows =
    Array.isArray(priceSource) && priceSource.length > 0 ? priceSource : [item];
  const unique = new Map<string, ProviderOfferPriceCandidate>();
  for (const row of rows) {
    const amount = normalizeAmount(readPath(row, config.priceField));
    if (!amount) continue;
    const rawCurrency = readPath(row, config.currencyField);
    const currency = inferCurrency(
      rawCurrency ?? readPath(row, config.priceField),
      config.defaults.currency,
    );
    const billingCycle =
      toText(readPath(row, config.billingCycleField)) ||
      config.defaults.billingCycle;
    const purchaseUrl = resolveUrl(
      readPath(row, config.purchaseUrlField),
      baseUrl,
    );
    const candidate = {
      amount,
      originalAmount:
        normalizeAmount(readPath(row, config.originalPriceField)) || null,
      currency,
      billingCycle,
      purchaseUrl: purchaseUrl || null,
    };
    const key = `${billingCycle.toLowerCase()}:${currency}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function parseJsonCandidates(
  body: string,
  config: JsonMonitorConfig,
  sourceUrl: string,
) {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("供应商接口返回内容不是有效 JSON");
  }
  const rows = readPath(payload, config.itemsPath);
  if (!Array.isArray(rows)) {
    throw new Error(`供应商接口字段 ${config.itemsPath || "根节点"} 不是数组`);
  }

  return rows.map<ProviderOfferCandidate>((item) => {
    const prices = jsonPriceCandidates(item, config, sourceUrl);
    const directPurchaseUrl = resolveUrl(
      readPath(item, config.purchaseUrlField),
      sourceUrl,
    );
    const pricePurchaseUrl = prices.find(
      (price) => price.purchaseUrl,
    )?.purchaseUrl;
    const purchaseUrl = directPurchaseUrl
      ? directPurchaseUrl
      : (pricePurchaseUrl ?? "");
    const externalProductId = inferExternalProductId(
      toText(readPath(item, config.externalIdField)),
      purchaseUrl,
    );
    const defaults = config.defaults;
    return {
      externalProductId,
      title: toText(readPath(item, config.titleField)),
      productGroup:
        nullableText(readPath(item, config.productGroupField)) ??
        defaults.productGroup ??
        null,
      productType:
        toText(readPath(item, config.productTypeField)) || defaults.productType,
      cpu: nullableText(readPath(item, config.cpuField)),
      memory: nullableText(readPath(item, config.memoryField)),
      storage: nullableText(readPath(item, config.storageField)),
      bandwidth: nullableText(readPath(item, config.bandwidthField)),
      traffic: nullableText(readPath(item, config.trafficField)),
      region:
        nullableText(readPath(item, config.regionField)) ??
        defaults.region ??
        null,
      countryCode:
        nullableText(readPath(item, config.countryCodeField)) ??
        defaults.countryCode ??
        null,
      city:
        nullableText(readPath(item, config.cityField)) ?? defaults.city ?? null,
      lineType:
        nullableText(readPath(item, config.lineTypeField)) ??
        defaults.lineType ??
        null,
      network:
        nullableText(readPath(item, config.networkField)) ??
        defaults.network ??
        null,
      ipv4: nullableText(readPath(item, config.ipv4Field)),
      ipv6: nullableText(readPath(item, config.ipv6Field)),
      status: normalizeStatus(
        readPath(item, config.statusField),
        config.statusMap,
        defaults.status,
      ),
      purchaseUrl,
      promoCode: nullableText(readPath(item, config.promoCodeField)),
      prices,
      sourceUrl,
      raw: recordValue(item),
    };
  });
}

function htmlFieldValue(
  item: Cheerio<AnyNode>,
  field: HtmlFieldConfig | undefined,
) {
  if (!field) return "";
  const target = field.selector ? item.find(field.selector).first() : item;
  const raw = field.attribute
    ? (target.attr(field.attribute) ?? "")
    : target.text();
  const text = toText(raw);
  if (!field.pattern || !text) return text;
  let pattern: RegExp;
  try {
    pattern = new RegExp(field.pattern, "i");
  } catch {
    throw new Error(`HTML 字段正则无效：${field.pattern}`);
  }
  return toText(pattern.exec(text)?.[field.group] ?? "");
}

function parseHtmlCandidates(
  body: string,
  config: HtmlMonitorConfig,
  sourceUrl: string,
) {
  const $ = load(body);
  const items = $(config.itemSelector).toArray();
  return items.map<ProviderOfferCandidate>((element) => {
    const item = $(element);
    const fields = config.fields;
    const rawPurchaseUrl = htmlFieldValue(item, fields.purchaseUrl);
    const purchaseUrl = resolveUrl(rawPurchaseUrl, sourceUrl);
    const rawPrice = htmlFieldValue(item, fields.price);
    const amount = normalizeAmount(rawPrice);
    const currency = inferCurrency(
      htmlFieldValue(item, fields.currency) || rawPrice,
      config.defaults.currency,
    );
    const billingCycle =
      htmlFieldValue(item, fields.billingCycle) || config.defaults.billingCycle;
    const prices = amount
      ? [
          {
            amount,
            originalAmount:
              normalizeAmount(htmlFieldValue(item, fields.originalPrice)) ||
              null,
            currency,
            billingCycle,
            purchaseUrl: purchaseUrl || null,
          },
        ]
      : [];
    const value = (field: HtmlFieldConfig | undefined) =>
      nullableText(htmlFieldValue(item, field));
    return {
      externalProductId: inferExternalProductId(
        htmlFieldValue(item, fields.externalProductId),
        purchaseUrl,
      ),
      title: htmlFieldValue(item, fields.title),
      productGroup:
        value(fields.productGroup) ?? config.defaults.productGroup ?? null,
      productType:
        value(fields.productType) ?? config.defaults.productType ?? "vps",
      cpu: value(fields.cpu),
      memory: value(fields.memory),
      storage: value(fields.storage),
      bandwidth: value(fields.bandwidth),
      traffic: value(fields.traffic),
      region: value(fields.region) ?? config.defaults.region ?? null,
      countryCode:
        value(fields.countryCode) ?? config.defaults.countryCode ?? null,
      city: value(fields.city) ?? config.defaults.city ?? null,
      lineType: value(fields.lineType) ?? config.defaults.lineType ?? null,
      network: value(fields.network) ?? config.defaults.network ?? null,
      ipv4: value(fields.ipv4),
      ipv6: value(fields.ipv6),
      status: normalizeStatus(
        htmlFieldValue(item, fields.status),
        config.statusMap,
        config.defaults.status,
      ),
      purchaseUrl,
      promoCode: value(fields.promoCode),
      prices,
      sourceUrl,
      raw: { text: toText(item.text()).slice(0, 2_000) },
    };
  });
}

export function parseProviderSourcePayload(input: {
  adapter: ProviderSourceAdapter;
  body: string;
  config: ProviderMonitorConfig;
  sourceUrl: string;
}) {
  return input.adapter === "json"
    ? parseJsonCandidates(
        input.body,
        input.config as JsonMonitorConfig,
        input.sourceUrl,
      )
    : parseHtmlCandidates(
        input.body,
        input.config as HtmlMonitorConfig,
        input.sourceUrl,
      );
}

export function validateProviderOfferCandidate(
  candidate: ProviderOfferCandidate,
  requiredSpecCount = 2,
): ProviderOfferCandidateQuality {
  const reasons: string[] = [];
  const specCount = [
    candidate.cpu,
    candidate.memory,
    candidate.storage,
    candidate.bandwidth,
    candidate.traffic,
  ].filter(Boolean).length;
  if (!candidate.externalProductId) reasons.push("缺少稳定产品 ID");
  if (!candidate.title) reasons.push("缺少套餐标题");
  if (!candidate.purchaseUrl) reasons.push("缺少购买链接");
  if (candidate.prices.length === 0) reasons.push("缺少有效价格");
  if (specCount < requiredSpecCount) {
    reasons.push(`配置字段不足，需要至少 ${requiredSpecCount} 项`);
  }
  return { valid: reasons.length === 0, reasons, specCount };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "raw")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function hashProviderOfferCandidate(candidate: ProviderOfferCandidate) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(candidate)))
    .digest("hex");
}

export function hashProviderOfferSyncState(
  candidate: ProviderOfferCandidate,
  provider: { affUrl: string; affParam: string; affValue: string },
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue({
          candidate,
          affiliate: {
            affUrl: provider.affUrl,
            affParam: provider.affParam,
            affValue: provider.affValue,
          },
        }),
      ),
    )
    .digest("hex");
}

export function hashProviderMonitorSyncConfig(input: {
  adapter: ProviderSourceAdapter;
  config: ProviderMonitorConfig;
  affiliate: { affUrl: string; affParam: string; affValue: string };
  behavior: {
    purpose: string;
    autoPublish: boolean;
    missingThreshold: number;
    defaultPromoCode: string | null;
  };
}) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(input)))
    .digest("hex");
}

export function hashProviderSourceResponse(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export function applyProviderAffiliateUrl(
  rawUrl: string,
  provider: { affUrl: string; affParam: string; affValue: string },
) {
  if (provider.affParam === "href") return provider.affUrl;
  const url = new URL(rawUrl);
  url.searchParams.set(provider.affParam, provider.affValue);
  return url.toString();
}
