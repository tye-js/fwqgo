import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import type {
  PROVIDER_AVAILABILITY_STATUSES,
  HtmlFieldConfig,
  HtmlMonitorConfig,
  JsonMonitorConfig,
  ProductLinksMonitorConfig,
  ProviderMonitorConfig,
  ProviderSourceAdapter,
} from "@fwqgo/core/provider-monitor-config";
import {
  extractProductIdReference,
  getProviderOfferAffiliateMode,
  hasCompleteProviderOfferAffiliateConfig,
  normalizeProviderOfferAffiliateConfig,
  resolveProviderOfferAffiliateUrl,
  type ProviderOfferAffiliateConfigLike,
} from "@fwqgo/core/affiliate-provider";
import {
  isPersistableServerOfferAmount,
  isSupportedServerOfferCurrency,
  normalizeServerOfferBillingCycle,
} from "@fwqgo/core/server-offer-price";

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

type NumericToken = {
  raw: string;
  index: number;
};

function numericTokens(text: string) {
  const pattern =
    /[-+]?(?:\d{1,3}(?:[.,'’\s\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/g;
  return [...text.matchAll(pattern)].map<NumericToken>((match) => ({
    raw: match[0],
    index: match.index,
  }));
}

function currencyMarkerIndexes(text: string) {
  const indexes: Array<{ index: number; length: number }> = [];
  const explicit =
    /(?:HK\$|US\$|C\$|A\$|USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD|[$€£¥￥])/gi;
  const genericCode = /\b[A-Z]{3}\b/g;

  for (const match of text.matchAll(explicit)) {
    indexes.push({ index: match.index, length: match[0].length });
  }
  for (const match of text.matchAll(genericCode)) {
    indexes.push({ index: match.index, length: match[0].length });
  }
  return indexes;
}

function tokenDistance(
  token: NumericToken,
  marker: { index: number; length: number },
) {
  const tokenEnd = token.index + token.raw.length;
  const markerEnd = marker.index + marker.length;
  if (tokenEnd <= marker.index) return marker.index - tokenEnd;
  if (markerEnd <= token.index) return token.index - markerEnd;
  return 0;
}

function selectAmountToken(text: string) {
  const tokens = numericTokens(text);
  if (tokens.length <= 1) return tokens[0] ?? null;

  const markers = currencyMarkerIndexes(text);
  if (markers.length > 0) {
    return tokens.reduce((best, token) => {
      const bestDistance = Math.min(
        ...markers.map((marker) => tokenDistance(best, marker)),
      );
      const tokenMarkerDistance = Math.min(
        ...markers.map((marker) => tokenDistance(token, marker)),
      );
      return tokenMarkerDistance < bestDistance ? token : best;
    });
  }

  const withoutCycleQuantities = tokens.filter((token) => {
    const suffix = text.slice(token.index + token.raw.length);
    return !/^\s*(?:months?|mos?|years?|yrs?|days?|个月|月|年)\b/i.test(suffix);
  });
  return withoutCycleQuantities.at(-1) ?? tokens.at(-1) ?? null;
}

function normalizeNumericToken(raw: string) {
  const compact = raw.replace(/[\s\u00a0'’]/g, "");
  if (!compact || compact.startsWith("-")) return "";
  const unsigned = compact.startsWith("+") ? compact.slice(1) : compact;
  const commaIndex = unsigned.lastIndexOf(",");
  const dotIndex = unsigned.lastIndexOf(".");
  let normalized = unsigned;

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = unsigned.replaceAll(thousandsSeparator, "");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (commaIndex >= 0) {
    const parts = unsigned.split(",");
    const decimalDigits = parts.at(-1)?.length ?? 0;
    normalized =
      decimalDigits > 0 && decimalDigits <= 2
        ? `${parts.slice(0, -1).join("")}.${parts.at(-1)}`
        : parts.join("");
  } else if ((unsigned.match(/\./g) ?? []).length > 1) {
    const parts = unsigned.split(".");
    const decimalDigits = parts.at(-1)?.length ?? 0;
    normalized =
      decimalDigits > 0 && decimalDigits <= 2
        ? `${parts.slice(0, -1).join("")}.${parts.at(-1)}`
        : parts.join("");
  }

  if (!isPersistableServerOfferAmount(normalized)) return "";
  const amount = Number(normalized);
  return Object.is(amount, -0) ? "0" : normalized;
}

function normalizeAmount(value: unknown) {
  if (typeof value === "number") {
    return isPersistableServerOfferAmount(value) ? String(value) : "";
  }

  const text = toText(value);
  const token = selectAmountToken(text);
  if (!token) return "";
  const prefix = text.slice(Math.max(0, token.index - 4), token.index);
  if (/-(?:HK\$|US\$|C\$|A\$|[$€£¥￥])\s*$/i.test(prefix)) return "";
  return normalizeNumericToken(token.raw);
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
  if (text.includes("¥") || text.includes("￥")) {
    return fallback.trim().toUpperCase() === "JPY" ? "JPY" : "CNY";
  }
  const trailingCode = /-?\d[\d,.]*\s+([A-Z]{3})(?:\s*[/／].*)?$/.exec(
    text,
  )?.[1];
  if (trailingCode && !["FOR", "PER"].includes(trailingCode)) {
    return trailingCode;
  }
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
  const normalizedRaw = raw.toLocaleLowerCase();
  const mapped =
    statusMap[raw] ??
    statusMap[normalizedRaw] ??
    Object.entries(statusMap).find(
      ([key]) => key.trim().toLocaleLowerCase() === normalizedRaw,
    )?.[1];
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

function externalProductIdFromUrl(value: string) {
  const reference = extractProductIdReference(value);
  if (reference) return `${reference.parameter}:${reference.value}`;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || /\/(?:cart|order)(?:\.php)?$/i.test(path)) {
      return "";
    }
    return path;
  } catch {
    return "";
  }
}

function inferExternalProductId(explicitId: string, purchaseUrl: string) {
  if (explicitId) {
    const normalizedUrlId = externalProductIdFromUrl(explicitId);
    if (normalizedUrlId) return normalizedUrlId;
    if (!/[/?#=&]/.test(explicitId)) return explicitId;
  }
  return externalProductIdFromUrl(purchaseUrl);
}

const productPricePattern =
  /(?:HK\$|US\$|C\$|A\$|USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD|[$€£¥￥])\s*\d|\d(?:[.,]\d+)?\s*(?:USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD)\b/i;

function structuredHtmlLines(item: Cheerio<AnyNode>) {
  const html = item.html() ?? item.text();
  const text = load(
    `<div>${html
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(
        /<\/(?:address|article|dd|div|dl|dt|figcaption|h[1-6]|li|p|section|td|th|tr)>/gi,
        "$&\n",
      )}</div>`,
  )("div").text();
  return text
    .replace(/\u00a0/g, " ")
    .split(/\n+/)
    .map((line) => toText(line))
    .filter(Boolean);
}

function firstMatchingLine(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line)) ?? null;
}

function extractBandwidth(value: string | null) {
  if (!value) return null;
  return (
    /\b\d+(?:\.\d+)?\s*(?:G|M|K)bps\b/i.exec(value)?.[0] ??
    (/\bunmetered\s+(?:port|bandwidth)\b/i.test(value) ? value : null)
  );
}

function extractTraffic(value: string | null) {
  if (!value) return null;
  if (/\bunmetered\b/i.test(value)) return value;
  return /\b\d+(?:\.\d+)?\s*(?:TB|GB|MB)\b/i.exec(value)?.[0] ?? null;
}

function tableFieldMap(item: Cheerio<AnyNode>) {
  const fields = new Map<string, string>();
  if (!item.is("tr")) return fields;
  const table = item.closest("table");
  const headerNodes = table.find("tr:has(th)").first().find("th");
  const headers = headerNodes
    .toArray()
    .map((_, index) => toText(headerNodes.eq(index).text()).toLowerCase());
  const cellNodes = item.find("td");
  const cells = cellNodes
    .toArray()
    .map((_, index) => toText(cellNodes.eq(index).text()));
  headers.forEach((header, index) => {
    const value = cells[index];
    if (header && value) fields.set(header, value);
  });
  return fields;
}

function mappedTableValue(fields: Map<string, string>, pattern: RegExp) {
  for (const [key, value] of fields) {
    if (pattern.test(key)) return value;
  }
  return null;
}

function inferProductType(value: string, fallback: string) {
  if (fallback.trim() && fallback !== "vps") return fallback;
  if (/shared\s+hosting|web\s+hosting|虚拟主机/i.test(value)) {
    return "shared-hosting";
  }
  if (/dedicated|bare\s*metal|独立服务器|裸金属/i.test(value)) {
    return "dedicated-server";
  }
  if (/windows[\s/_-]*vps|vps[^\n]{0,40}windows/i.test(value)) {
    return "windows-vps";
  }
  return fallback.trim() || "vps";
}

function extractProductFields(input: {
  item: Cheerio<AnyNode>;
  pageGroup: string;
  productId: string;
}) {
  const lines = structuredHtmlLines(input.item);
  const tableFields = tableFieldMap(input.item);
  const combined = lines.join("\n");
  const tablePlan = mappedTableValue(tableFields, /plan|package|套餐/);
  const headingNodes = input.item.find(
    "h1, h2, h3, h4, h5, h6, .product-title, .plan-title, .title",
  );
  const heading = headingNodes
    .toArray()
    .map((_, index) => toText(headingNodes.eq(index).text()))
    .find(
      (value) =>
        value &&
        value.length <= 180 &&
        !productPricePattern.test(value) &&
        !/^(?:order|buy|pricing|price)$/i.test(value),
    );
  const memory =
    mappedTableValue(tableFields, /\bram\b|memory|plan/) ??
    firstMatchingLine(
      lines,
      /(?:\b\d+(?:\.\d+)?\s*(?:MB|GB|TB)\s*(?:RAM|Memory)\b|\b(?:RAM|Memory)\b.*\d)/i,
    );
  const cpu =
    mappedTableValue(tableFields, /cpu|processor|core/) ??
    firstMatchingLine(
      lines,
      /(?:\b\d+(?:\.\d+)?x?\s*(?:vCPU|CPU|v?Cores?|Threads?)\b|\b(?:Intel|AMD|Ryzen|EPYC|Xeon)\b)/i,
    );
  const storage =
    mappedTableValue(tableFields, /storage|disk|ssd|nvme|hdd/) ??
    firstMatchingLine(
      lines,
      /(?:\b\d+(?:\.\d+)?\s*(?:TB|GB|MB)\b.*\b(?:NVMe|SSD|HDD|Storage|Disk)\b|\b(?:NVMe|SSD|HDD|Storage|Disk)\b.*\d)/i,
    );
  const rawNetwork =
    mappedTableValue(tableFields, /bandwidth|traffic|transfer|network|port/) ??
    firstMatchingLine(lines, /\b\d+(?:\.\d+)?\s*(?:G|M|K)bps\b/i) ??
    firstMatchingLine(
      lines,
      /\b(?:Bandwidth|Traffic|Transfer|Network Port|Port Speed|Unmetered)\b/i,
    );
  const rawTraffic =
    mappedTableValue(tableFields, /traffic|transfer|bandwidth/) ??
    firstMatchingLine(
      lines,
      /(?:\b(?:Bandwidth|Traffic|Transfer)\b.*\b(?:TB|GB|MB)\b|\b\d+(?:\.\d+)?\s*(?:TB|GB|MB)\b.*\b(?:Bandwidth|Traffic|Transfer|@)\b|\bUnmetered\b)/i,
    );
  const ipv4 =
    mappedTableValue(tableFields, /ipv?4|ip address/) ??
    firstMatchingLine(lines, /\b(?:IPv4|Dedicated IP|Free IP)\b/i);
  const ipv6 =
    mappedTableValue(tableFields, /ipv?6/) ??
    firstMatchingLine(lines, /\bIPv6\b/i);
  const region = firstMatchingLine(
    lines,
    /^(?:available\s+in|locations?|region|机房|地区)\s*[:：]/i,
  );
  const priceLines = [
    ...new Set([
      mappedTableValue(tableFields, /pricing|price|cost/),
      ...lines.filter((line) => productPricePattern.test(line)),
    ]),
  ].filter((value): value is string => Boolean(value));
  const prices = priceLines.flatMap<ProviderOfferPriceCandidate>((line) => {
    const amount = normalizeAmount(line);
    if (!amount) return [];
    return [
      {
        amount,
        originalAmount: null,
        currency: inferCurrency(line, "USD"),
        billingCycle: normalizeServerOfferBillingCycle(line),
        purchaseUrl: null,
      },
    ];
  });
  const titleBase = heading ?? tablePlan ?? memory;
  const title = titleBase
    ? titleBase.toLowerCase().includes(input.pageGroup.toLowerCase())
      ? titleBase
      : `${input.pageGroup} ${titleBase}`.trim()
    : `${input.pageGroup} ${input.productId}`.trim();

  return {
    title,
    cpu,
    memory,
    storage,
    bandwidth: extractBandwidth(rawNetwork),
    traffic: extractTraffic(rawTraffic),
    region,
    ipv4,
    ipv6,
    prices,
    text: combined.slice(0, 2_000),
  };
}

function getProductPageGroup($: ReturnType<typeof load>, sourceUrl: string) {
  const heading = toText($("main h1, h1").first().text());
  const visualHeading = $("#page .service-header .title").first().clone();
  visualHeading.find("small").remove();
  const visualTitle = toText(visualHeading.text()).replace(
    /\s+deployed\b.*$/i,
    "",
  );
  const title = toText($("title").first().text()).split(/\s[-|]\s/, 1)[0] ?? "";
  if (heading && heading.length <= 180) return heading;
  if (visualTitle && visualTitle.length <= 180) return visualTitle;
  if (title && title.length <= 180) return title;
  const pathPart = new URL(sourceUrl).pathname
    .split("/")
    .filter(Boolean)
    .at(-1);
  return pathPart?.replace(/[-_]+/g, " ") ?? "Server Plan";
}

function countProductLinks(input: {
  item: Cheerio<AnyNode>;
  sourceUrl: string;
  productParam: string;
}) {
  const links = input.item.find("a[href]");
  return links.toArray().filter((_, index) => {
    const href = links.eq(index).attr("href");
    if (!href) return false;
    const resolved = resolveUrl(href, input.sourceUrl);
    return Boolean(
      resolved &&
      extractProductIdReference(resolved, input.productParam, {
        strictPreferred: true,
      }),
    );
  }).length;
}

function findProductLinkContainer(input: {
  anchor: Cheerio<AnyNode>;
  sourceUrl: string;
  productParam: string;
}) {
  let current = input.anchor.parent();
  let best = current;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let depth = 0; depth < 8 && current.length > 0; depth += 1) {
    if (current.is("body, html")) break;
    const text = toText(current.text());
    const linkCount = countProductLinks({ ...input, item: current });
    if (linkCount === 1 && text.length <= 8_000) {
      let score = 20 - depth;
      if (current.is("tr, article, li, section")) score += 6;
      if (
        /(?:product|plan|package|pricing|server|shared|vps|dedicated|box|card)/i.test(
          current.attr("class") ?? "",
        )
      ) {
        score += 8;
      }
      if (productPricePattern.test(text)) score += 6;
      if (
        /RAM|Memory|CPU|Core|SSD|NVMe|HDD|Storage|Bandwidth|Transfer/i.test(
          text,
        )
      ) {
        score += 6;
      }
      if (text.length >= 20) score += 4;
      if (score > bestScore) {
        best = current;
        bestScore = score;
      }
    }
    current = current.parent();
  }
  return best;
}

function parseProductLinkCandidates(input: {
  body: string;
  config: ProductLinksMonitorConfig;
  sourceUrl: string;
  affiliate?: ProviderOfferAffiliateConfigLike;
}) {
  if (
    !input.affiliate ||
    getProviderOfferAffiliateMode(input.affiliate) !== "product_param" ||
    !hasCompleteProviderOfferAffiliateConfig(input.affiliate)
  ) {
    throw new Error("套餐集合页要求供应商配置完整的按产品 ID 返利链接");
  }
  const affiliateConfig = normalizeProviderOfferAffiliateConfig(
    input.affiliate,
  );
  const productParam = affiliateConfig.offerAffiliateProductParam?.trim();
  if (!productParam) throw new Error("供应商未配置产品 ID 参数");

  const $ = load(input.body);
  const pageGroup =
    nullableText(input.config.defaults.productGroup) ??
    getProductPageGroup($, input.sourceUrl);
  const candidates = new Map<string, ProviderOfferCandidate>();

  $(input.config.linkSelector).each((_, element) => {
    const anchor = $(element);
    const originalPurchaseUrl = resolveUrl(
      anchor.attr("href"),
      input.sourceUrl,
    );
    if (!originalPurchaseUrl) return;
    const reference = extractProductIdReference(
      originalPurchaseUrl,
      productParam,
      { strictPreferred: true },
    );
    if (!reference) return;
    const externalProductId = `${productParam.toLowerCase()}:${reference.value}`;
    const affiliate = resolveProviderOfferAffiliateUrl({
      rawUrl: originalPurchaseUrl,
      affiliate: affiliateConfig,
      externalProductId,
    });
    if (!affiliate) return;

    const item = findProductLinkContainer({
      anchor,
      sourceUrl: input.sourceUrl,
      productParam,
    });
    const fields = extractProductFields({
      item,
      pageGroup,
      productId: reference.value,
    });
    const candidate: ProviderOfferCandidate = {
      externalProductId,
      title: fields.title,
      productGroup: pageGroup,
      productType: inferProductType(
        `${input.sourceUrl}\n${pageGroup}\n${fields.text}`,
        input.config.defaults.productType,
      ),
      cpu: fields.cpu,
      memory: fields.memory,
      storage: fields.storage,
      bandwidth: fields.bandwidth,
      traffic: fields.traffic,
      region: fields.region ?? input.config.defaults.region ?? null,
      countryCode: input.config.defaults.countryCode ?? null,
      city: input.config.defaults.city ?? null,
      lineType: input.config.defaults.lineType ?? null,
      network: input.config.defaults.network ?? null,
      ipv4: fields.ipv4,
      ipv6: fields.ipv6,
      status: /out\s+of\s+stock|sold\s+out|缺货/i.test(fields.text)
        ? "out_of_stock"
        : input.config.defaults.status,
      purchaseUrl: affiliate.url,
      promoCode: null,
      prices: fields.prices.map((price) => ({
        ...price,
        currency: price.currency || input.config.defaults.currency,
        purchaseUrl: affiliate.url,
      })),
      sourceUrl: input.sourceUrl,
      raw: {
        text: fields.text,
        originalPurchaseUrl,
        affiliatePurchaseUrl: affiliate.url,
        __evidence: {
          adapter: "product_links",
          linkSelector: input.config.linkSelector,
          productParam: productParam.toLowerCase(),
        },
      },
    };

    const current = candidates.get(externalProductId);
    const currentText =
      typeof current?.raw.text === "string" ? current.raw.text : "";
    if (!current || fields.text.length > currentText.length) {
      candidates.set(externalProductId, candidate);
    }
  });

  return [...candidates.values()];
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
      raw: {
        ...recordValue(item),
        __evidence: {
          adapter: "json",
          paths: {
            externalProductId: config.externalIdField,
            title: config.titleField,
            cpu: config.cpuField,
            memory: config.memoryField,
            storage: config.storageField,
            bandwidth: config.bandwidthField,
            traffic: config.trafficField,
            region: config.regionField,
            price: config.priceField,
            prices: config.pricesPath ?? null,
            billingCycle: config.billingCycleField,
            purchaseUrl: config.purchaseUrlField,
          },
        },
      },
    };
  });
}

function htmlFieldValue(
  item: Cheerio<AnyNode>,
  field: HtmlFieldConfig | undefined,
) {
  if (!field) return "";
  const target = field.selector
    ? item.is(field.selector)
      ? item
      : item.find(field.selector).first()
    : item;
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
      raw: {
        text: toText(item.text()).slice(0, 2_000),
        __evidence: {
          adapter: "html",
          itemSelector: config.itemSelector,
          fields: Object.fromEntries(
            Object.entries(fields).map(([key, field]) => [
              key,
              {
                selector: field?.selector ?? "",
                attribute: field?.attribute ?? null,
                value: htmlFieldValue(item, field),
              },
            ]),
          ),
        },
      },
    };
  });
}

export function parseWhmcsBillingCyclePrices(input: {
  body: string;
  purchaseUrl: string;
  fallbackCurrency?: string;
  optionSelector?: string;
}) {
  const $ = load(input.body);
  let selector = input.optionSelector?.trim();
  if (selector === undefined || selector.length === 0) {
    selector = 'select[name="billingcycle"] option';
  }
  const unique = new Map<string, ProviderOfferPriceCandidate>();
  const supportedWhmcsCycles = new Set([
    "monthly",
    "quarterly",
    "semiannual",
    "semiannually",
    "yearly",
    "annual",
    "annually",
    "biennial",
    "biennially",
    "triennial",
    "triennially",
  ]);

  $(selector).each((_, element) => {
    const option = $(element);
    if (option.is(":disabled")) return;

    const rawPrice = toText(option.text());
    const amount = normalizeAmount(rawPrice);
    if (!amount) return;

    const currency = inferCurrency(rawPrice, input.fallbackCurrency ?? "USD");
    const valueCycle = toText(option.attr("value"));
    const rawCycle = valueCycle
      ? valueCycle
      : (option.attr("data-cycle") ?? rawPrice);
    if (!supportedWhmcsCycles.has(rawCycle.trim().toLowerCase())) return;
    const billingCycle = normalizeServerOfferBillingCycle(rawCycle);
    const key = `${billingCycle}:${currency}`;
    if (unique.has(key)) return;
    const resolvedPurchaseUrl = resolveUrl(
      input.purchaseUrl,
      input.purchaseUrl,
    );

    unique.set(key, {
      amount,
      originalAmount: null,
      currency,
      billingCycle,
      purchaseUrl: resolvedPurchaseUrl ? resolvedPurchaseUrl : null,
    });
  });

  return [...unique.values()];
}

function selectedWhmcsLocation($: ReturnType<typeof load>) {
  const labels = $("label").toArray();
  for (const [index] of labels.entries()) {
    const label = $(labels[index]);
    if (!/\blocation\b|机房|地区/i.test(toText(label.text()))) continue;
    const field = label.closest(".form-group, .field-container, div");
    const targetId = label.attr("for");
    const select = targetId
      ? $("select")
          .filter((_, element) => $(element).attr("id") === targetId)
          .first()
      : field.find("select").first().length > 0
        ? field.find("select").first()
        : label.nextAll("select, div").first().find("select").first();
    const option = select.find("option:selected, option[selected]").first();
    const value = toText(option.text()).replace(/\s*\(Test IP:[^)]+\)\s*/i, "");
    if (value) return value;
  }
  return null;
}

export function mergeWhmcsProductPageDetails(input: {
  body: string;
  candidate: ProviderOfferCandidate;
  finalUrl: string;
}) {
  const $ = load(input.body);
  const productInfo = $(".product-info").first();
  const prices = parseWhmcsBillingCyclePrices({
    body: input.body,
    purchaseUrl: input.candidate.purchaseUrl,
    fallbackCurrency: input.candidate.prices[0]?.currency ?? "USD",
  });
  if (productInfo.length === 0) {
    return {
      ...input.candidate,
      prices: prices.length > 0 ? prices : input.candidate.prices,
    };
  }

  const detailTitle = toText(productInfo.find(".product-title").first().text());
  const details = extractProductFields({
    item: productInfo,
    pageGroup:
      input.candidate.productGroup ??
      input.candidate.productType ??
      "Server Plan",
    productId: input.candidate.externalProductId,
  });
  const location = selectedWhmcsLocation($);
  return {
    ...input.candidate,
    title: detailTitle || input.candidate.title || details.title,
    productType: inferProductType(
      `${detailTitle}\n${details.text}`,
      input.candidate.productType,
    ),
    cpu: details.cpu ?? input.candidate.cpu,
    memory: details.memory ?? input.candidate.memory,
    storage: details.storage ?? input.candidate.storage,
    bandwidth: details.bandwidth ?? input.candidate.bandwidth,
    traffic: details.traffic ?? input.candidate.traffic,
    region: location ?? details.region ?? input.candidate.region,
    ipv4: details.ipv4 ?? input.candidate.ipv4,
    ipv6: details.ipv6 ?? input.candidate.ipv6,
    prices: prices.length > 0 ? prices : input.candidate.prices,
    raw: {
      ...input.candidate.raw,
      detail: {
        sourceUrl: input.finalUrl,
        text: details.text,
      },
    },
  } satisfies ProviderOfferCandidate;
}

export function parseProviderSourcePayload(input: {
  adapter: ProviderSourceAdapter;
  body: string;
  config: ProviderMonitorConfig;
  sourceUrl: string;
  affiliate?: ProviderOfferAffiliateConfigLike;
}) {
  if (input.adapter === "json") {
    return parseJsonCandidates(
      input.body,
      input.config as JsonMonitorConfig,
      input.sourceUrl,
    );
  }
  if (input.adapter === "product_links") {
    return parseProductLinkCandidates({
      body: input.body,
      config: input.config as ProductLinksMonitorConfig,
      sourceUrl: input.sourceUrl,
      affiliate: input.affiliate,
    });
  }
  return parseHtmlCandidates(
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
  const unsupportedCurrencies = [
    ...new Set(
      candidate.prices
        .map((price) => price.currency.trim().toUpperCase())
        .filter((currency) => !isSupportedServerOfferCurrency(currency)),
    ),
  ];
  if (unsupportedCurrencies.length > 0) {
    reasons.push(`不支持币种 ${unsupportedCurrencies.join("、")}`);
  }
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
  provider: ProviderOfferAffiliateConfigLike & {
    purpose: string;
    defaultPromoCode: string | null;
  },
) {
  const affiliate = normalizeProviderOfferAffiliateConfig(provider);
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue({
          candidate,
          affiliate: {
            offerAffUrl: affiliate.offerAffUrl,
            offerAffParam: affiliate.offerAffParam,
            offerAffValue: affiliate.offerAffValue,
            offerAffiliateMode: affiliate.offerAffiliateMode ?? null,
            offerAffiliateProductParam:
              affiliate.offerAffiliateProductParam ?? null,
          },
          behavior: {
            purpose: provider.purpose,
            defaultPromoCode: provider.defaultPromoCode,
          },
        }),
      ),
    )
    .digest("hex");
}

export function prepareProviderOfferCandidates(
  candidates: ProviderOfferCandidate[],
  requiredSpecCount = 2,
) {
  const seenExternalIds = new Set<string>();
  const syncableExternalIds = new Set<string>();
  const syncableCandidates: ProviderOfferCandidate[] = [];
  const rejectionReasonCounts = new Map<string, number>();
  let skipped = 0;

  const recordRejectionReason = (reason: string) => {
    rejectionReasonCounts.set(
      reason,
      (rejectionReasonCounts.get(reason) ?? 0) + 1,
    );
  };

  for (const candidate of candidates) {
    const externalId = candidate.externalProductId.trim();
    if (externalId) seenExternalIds.add(externalId);

    const quality = validateProviderOfferCandidate(
      candidate,
      requiredSpecCount,
    );
    if (!quality.valid) {
      skipped += 1;
      for (const reason of quality.reasons) recordRejectionReason(reason);
      continue;
    }

    if (syncableExternalIds.has(externalId)) {
      skipped += 1;
      recordRejectionReason("重复稳定产品 ID");
      continue;
    }
    syncableExternalIds.add(externalId);
    syncableCandidates.push(candidate);
  }

  return {
    seenExternalIds,
    syncableCandidates,
    skipped,
    rejectionReasons: Object.fromEntries(
      [...rejectionReasonCounts].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

export function hashProviderMonitorSyncConfig(input: {
  adapter: ProviderSourceAdapter;
  config: ProviderMonitorConfig;
  affiliate: ProviderOfferAffiliateConfigLike;
  behavior: {
    purpose: string;
    autoPublish: boolean;
    missingThreshold: number;
    defaultPromoCode: string | null;
  };
}) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue({
          ...input,
          affiliate: normalizeProviderOfferAffiliateConfig(input.affiliate),
        }),
      ),
    )
    .digest("hex");
}

export function hashProviderSourceResponse(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export function applyProviderAffiliateUrl(
  rawUrl: string,
  provider: ProviderOfferAffiliateConfigLike,
  externalProductId?: string | null,
) {
  return (
    resolveProviderOfferAffiliateUrl({
      rawUrl,
      affiliate: provider,
      externalProductId,
    })?.url ?? rawUrl
  );
}
