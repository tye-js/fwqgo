import { SERVER_OFFER_KINDS, type ServerOfferKind } from "./server-offer-kind";
import { PUBLIC_SERVER_OFFER_STATUSES } from "./server-offer-status";

export const publicInventorySorts = [
  "price-asc",
  "price-desc",
  "latest",
] as const;
export type PublicInventorySort = (typeof publicInventorySorts)[number];

/**
 * 库存筛选的可选值：全部库存 + 公开侧的三个库存状态。
 *
 * 状态本身（哪些状态公开、补货中如何并入有货）定义在 `server-offer-status.ts`，
 * 这里只加一个「不筛选」的取值，两边不会各写一份列表。
 *
 * 旧链接里的 `stock=discontinued`、`stock=restocking` 都按非法值处理，回落到默认库存视图。
 */
export const publicInventoryStocks = [
  "all",
  ...PUBLIC_SERVER_OFFER_STATUSES,
] as const;
export type PublicInventoryStock = (typeof publicInventoryStocks)[number];

/** 默认库存视图：只展示还可能买到的套餐。 */
export const publicInventoryDefaultStock: PublicInventoryStock = "in_stock";

/** 价格区间下拉框里代表「不限价格」的档位。 */
export const PUBLIC_INVENTORY_PRICE_ANY = "all";
/** 价格区间下拉框里代表「改用自定义月价输入框」的档位。 */
export const PUBLIC_INVENTORY_PRICE_CUSTOM = "custom";

export type PublicInventoryPriceRange = {
  key: string;
  label: string;
  minPrice?: number;
  maxPrice?: number;
};

/**
 * 主筛选栏的月价档位。
 *
 * `price` 只是价格下拉框的输入别名：解析时档位会被展开成 minPrice / maxPrice，
 * 所以规范 URL 始终只带 minPrice / maxPrice，档位键本身不被持久化。反过来，任意
 * 一组 minPrice / maxPrice 命中某个档位时下拉框回显该档位，否则回显「自定义」。
 */
export const publicInventoryPriceRanges: PublicInventoryPriceRange[] = [
  { key: "0-3", label: "3 美元以下/月", minPrice: 0, maxPrice: 3 },
  { key: "3-5", label: "3–5 美元/月", minPrice: 3, maxPrice: 5 },
  { key: "5-10", label: "5–10 美元/月", minPrice: 5, maxPrice: 10 },
  { key: "10-20", label: "10–20 美元/月", minPrice: 10, maxPrice: 20 },
  { key: "20-50", label: "20–50 美元/月", minPrice: 20, maxPrice: 50 },
  { key: "50-", label: "50 美元以上/月", minPrice: 50 },
];

/**
 * 把当前价格边界映射回下拉框取值：命中档位就是档位键，没有价格条件就是
 * 「不限价格」，其余（含只有单边边界）都是「自定义」。
 */
export function resolvePublicInventoryPriceRange(
  minPrice: number | undefined,
  maxPrice: number | undefined,
) {
  if (minPrice === undefined && maxPrice === undefined) {
    return PUBLIC_INVENTORY_PRICE_ANY;
  }

  const matched = publicInventoryPriceRanges.find(
    (range) => range.minPrice === minPrice && range.maxPrice === maxPrice,
  );
  return matched?.key ?? PUBLIC_INVENTORY_PRICE_CUSTOM;
}

/** 活动款套餐的探测状态筛选。默认 `all`（不筛）。 */
export const publicInventoryChecks = ["all", "ok", "failed", "unknown"] as const;
export type PublicInventoryCheck = (typeof publicInventoryChecks)[number];

/** 优惠码筛选。默认 `all`（不筛）。 */
export const publicInventoryPromos = ["all", "with", "without"] as const;
export type PublicInventoryPromo = (typeof publicInventoryPromos)[number];

type SearchParamValue = string | string[] | undefined;
export type PublicInventorySearchParams = Record<string, SearchParamValue>;

/**
 * 库存筛选的取值形状。
 *
 * 这里刻意不用 zod，而是手写解析：本模块会被 `server-inventory-filters` 与
 * `server-inventory-results` 两个客户端组件在运行时导入，而 schema 库会把整个运行时
 * （gzip 约 72 KB）带进 `/servers` 的首屏包。字段全是固定枚举与有界文本，手写解析能穷尽；
 * 换来的那点通用校验能力抵不过这 72 KB。
 *
 * 改动字段时同步 `scripts/verify-inventory-filters.tsx`（它逐字段断言了这些默认值与往返行为）。
 */
export type PublicInventoryFilters = {
  query: string;
  kind: ServerOfferKind;
  provider: string;
  group: string;
  stock: PublicInventoryStock;
  check: PublicInventoryCheck;
  region: string;
  line: string;
  feature: string;
  promo: PublicInventoryPromo;
  minPrice?: number;
  maxPrice?: number;
  sort: PublicInventorySort;
  cursor: string;
};

/** 月价边界上限（USD）。超出按「没给」处理，避免脏参数变成昂贵的范围查询。 */
const PUBLIC_INVENTORY_MAX_PRICE = 1_000_000;

/**
 * 筛选默认值，同时也是「规范 URL 里不出现」的那一档：`buildPublicInventoryHref` 丢掉
 * 等于默认值的字段，让同一组条件只有一种 URL 形态。
 *
 * 字段顺序就是 URL 参数顺序，不要随意调整。
 */
export const publicInventoryFilterDefaults: PublicInventoryFilters = {
  query: "",
  kind: "regular",
  provider: "all",
  group: "all",
  stock: publicInventoryDefaultStock,
  check: "all",
  region: "all",
  line: "all",
  feature: "all",
  promo: "all",
  minPrice: undefined,
  maxPrice: undefined,
  sort: "price-asc",
  cursor: "",
};

export type PublicInventoryFacetSource = {
  key: string | null | undefined;
  label: string | null | undefined;
  count: number | string;
};

export type PublicInventoryFacet = {
  key: string;
  label: string;
  count: number;
};

export function normalizeServerCollectionSlug(
  value: string | null | undefined,
) {
  if (!value) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value).trim();
  } catch {
    return null;
  }

  if (
    decoded.length === 0 ||
    decoded.length > 160 ||
    /[\\/#?\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return null;
  }

  return decoded;
}

export function aggregatePublicInventoryFacets(
  rows: PublicInventoryFacetSource[],
  limit: number,
) {
  const facets = new Map<string, PublicInventoryFacet>();

  for (const row of rows) {
    const key = row.key?.trim();
    if (!key) continue;

    const trimmedLabel = row.label?.trim();
    const label = trimmedLabel && trimmedLabel.length > 0 ? trimmedLabel : key;
    const count = Number(row.count);
    const normalizedCount = Number.isFinite(count) && count > 0 ? count : 0;
    const existing = facets.get(key);
    if (existing) {
      existing.count += normalizedCount;
      if (existing.label === existing.key && label !== key) {
        existing.label = label;
      }
      continue;
    }

    facets.set(key, { key, label, count: normalizedCount });
  }

  return [...facets.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.label.localeCompare(right.label, "zh-CN"),
    )
    .slice(0, Math.max(0, limit));
}

function firstParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function optionalParam(value: SearchParamValue) {
  const first = firstParam(value);
  return first?.trim() ? first : undefined;
}

/** 有界文本筛选：去空白后超长就当作「没给」，回落到默认值。空串是合法值，不是缺省。 */
function parseTextFilter(
  value: SearchParamValue,
  limit: number,
  fallback: string,
) {
  const text = firstParam(value)?.trim();
  return text === undefined || text.length > limit ? fallback : text;
}

/** 枚举筛选：只认精确匹配，其余（含大小写不同、空串）都回落到默认档。 */
function parseEnumFilter<Value extends string>(
  value: SearchParamValue,
  options: readonly Value[],
  fallback: Value,
): Value {
  const text = firstParam(value);
  return text !== undefined && (options as readonly string[]).includes(text)
    ? (text as Value)
    : fallback;
}

/** 价格边界：非法、负数、超上限都当「没给」，避免脏参数落进 SQL 范围条件。 */
function parsePriceFilter(value: SearchParamValue, fallback?: number) {
  const text = optionalParam(value);
  if (text === undefined) return fallback;

  const parsed = Number(text);
  return Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= PUBLIC_INVENTORY_MAX_PRICE
    ? parsed
    : fallback;
}

/**
 * 读取价格下拉框的档位。`all` / `custom` / 非法值都不算档位：它们交给
 * minPrice / maxPrice 输入框决定，档位只在真正命中时才覆盖价格边界。
 */
function requestedPriceRange(value: SearchParamValue) {
  const key = firstParam(value)?.trim();
  if (!key) return null;
  return publicInventoryPriceRanges.find((range) => range.key === key) ?? null;
}

export function parsePublicInventoryFilters(
  input: PublicInventorySearchParams,
): PublicInventoryFilters {
  const defaults = publicInventoryFilterDefaults;
  const data: PublicInventoryFilters = {
    query: parseTextFilter(input.q, 80, defaults.query),
    kind: parseEnumFilter(input.kind, SERVER_OFFER_KINDS, defaults.kind),
    provider: parseTextFilter(input.provider, 160, defaults.provider),
    group: parseTextFilter(input.group, 200, defaults.group),
    stock: parseEnumFilter(input.stock, publicInventoryStocks, defaults.stock),
    check: parseEnumFilter(input.check, publicInventoryChecks, defaults.check),
    region: parseTextFilter(input.region, 160, defaults.region),
    line: parseTextFilter(input.line, 160, defaults.line),
    feature: parseTextFilter(input.feature, 160, defaults.feature),
    promo: parseEnumFilter(input.promo, publicInventoryPromos, defaults.promo),
    minPrice: parsePriceFilter(input.minPrice, defaults.minPrice),
    maxPrice: parsePriceFilter(input.maxPrice, defaults.maxPrice),
    sort: parseEnumFilter(input.sort, publicInventorySorts, defaults.sort),
    cursor: parseTextFilter(input.cursor, 512, defaults.cursor),
  };
  // 价格档位比 minPrice / maxPrice 输入框优先：用户在同一个表单里选了档位时，
  // 输入框里仍然是上一次的值，不能让它覆盖刚选的档位。
  const priceRange = requestedPriceRange(input.price);
  if (priceRange) {
    data.minPrice = priceRange.minPrice;
    data.maxPrice = priceRange.maxPrice;
  }
  if (
    data.minPrice !== undefined &&
    data.maxPrice !== undefined &&
    data.minPrice > data.maxPrice
  ) {
    return { ...data, minPrice: data.maxPrice, maxPrice: data.minPrice };
  }
  return data;
}

export function buildPublicInventoryHref(filters: PublicInventoryFilters) {
  const params = new URLSearchParams();

  for (const key of Object.keys(
    publicInventoryFilterDefaults,
  ) as Array<keyof PublicInventoryFilters>) {
    const value = filters[key];
    if (
      value === undefined ||
      value === "" ||
      value === publicInventoryFilterDefaults[key]
    )
      continue;
    params.set(key === "query" ? "q" : key, String(value));
  }

  return params.size ? `/servers?${params.toString()}` : "/servers";
}
