import { z } from "zod";

import { SERVER_OFFER_KINDS } from "./server-offer-kind";

export const publicInventorySorts = [
  "price-asc",
  "price-desc",
  "latest",
] as const;
export type PublicInventorySort = (typeof publicInventorySorts)[number];

/**
 * 公开库存可筛选的库存状态。
 *
 * 公开侧只保留「用户能据此做决定」的两个状态差异：还有货、还是没货（预售单独一档）。
 * 数据层里另外两个状态不单独出现：
 *
 * - 停售（discontinued）：采集链路连续缺失后写入的终态标记，套餐已经买不到。留在筛选里
 *   只会让用户点进一个失效入口，所以它既不是可选项，也不进入结果集与 facet 统计
 *   （见 `src/server/offers/public-inventory-query.ts` 的 `publicInventoryAvailableWhere`）。
 * - 补货中（restocking）：仍在售、还能下单，对用户就是「有货」，见
 *   `publicInventoryInStockStatuses`。
 *
 * 旧链接里的 `stock=discontinued`、`stock=restocking` 都按非法值处理，回落到默认库存视图。
 */
export const publicInventoryStocks = [
  "all",
  "in_stock",
  "out_of_stock",
  "preorder",
] as const;
export type PublicInventoryStock = (typeof publicInventoryStocks)[number];

/**
 * 「有货」在数据层对应的状态：`restocking` 表示正在补货但依然可以购买，
 * 公开侧不把它当成独立状态，所以有货筛选要同时命中这两个值。
 */
export const publicInventoryInStockStatuses: Array<"in_stock" | "restocking"> = [
  "in_stock",
  "restocking",
];

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

const filterSchema = z.object({
  query: z.string().trim().max(80).default(""),
  kind: z.enum(SERVER_OFFER_KINDS).default("regular"),
  provider: z.string().trim().max(160).default("all"),
  group: z.string().trim().max(200).default("all"),
  stock: z.enum(publicInventoryStocks).default(publicInventoryDefaultStock),
  check: z.enum(["all", "ok", "failed", "unknown"]).default("all"),
  region: z.string().trim().max(160).default("all"),
  line: z.string().trim().max(160).default("all"),
  feature: z.string().trim().max(160).default("all"),
  promo: z.enum(["all", "with", "without"]).default("all"),
  minPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  sort: z.enum(publicInventorySorts).default("price-asc"),
  cursor: z.string().trim().max(512).default(""),
});

type SearchParamValue = string | string[] | undefined;
export type PublicInventorySearchParams = Record<string, SearchParamValue>;
export type PublicInventoryFilters = z.infer<typeof filterSchema>;

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

function parseFilterField<Value>(
  schema: z.ZodType<Value>,
  value: unknown,
  fallback: Value,
) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
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
  const defaults = filterSchema.parse({});
  const data: PublicInventoryFilters = {
    query: parseFilterField(
      filterSchema.shape.query,
      firstParam(input.q),
      defaults.query,
    ),
    kind: parseFilterField(
      filterSchema.shape.kind,
      firstParam(input.kind),
      defaults.kind,
    ),
    provider: parseFilterField(
      filterSchema.shape.provider,
      firstParam(input.provider),
      defaults.provider,
    ),
    group: parseFilterField(
      filterSchema.shape.group,
      firstParam(input.group),
      defaults.group,
    ),
    stock: parseFilterField(
      filterSchema.shape.stock,
      firstParam(input.stock),
      defaults.stock,
    ),
    check: parseFilterField(
      filterSchema.shape.check,
      firstParam(input.check),
      defaults.check,
    ),
    region: parseFilterField(
      filterSchema.shape.region,
      firstParam(input.region),
      defaults.region,
    ),
    line: parseFilterField(
      filterSchema.shape.line,
      firstParam(input.line),
      defaults.line,
    ),
    feature: parseFilterField(
      filterSchema.shape.feature,
      firstParam(input.feature),
      defaults.feature,
    ),
    promo: parseFilterField(
      filterSchema.shape.promo,
      firstParam(input.promo),
      defaults.promo,
    ),
    minPrice: parseFilterField(
      filterSchema.shape.minPrice,
      optionalParam(input.minPrice),
      defaults.minPrice,
    ),
    maxPrice: parseFilterField(
      filterSchema.shape.maxPrice,
      optionalParam(input.maxPrice),
      defaults.maxPrice,
    ),
    sort: parseFilterField(
      filterSchema.shape.sort,
      firstParam(input.sort),
      defaults.sort,
    ),
    cursor: parseFilterField(
      filterSchema.shape.cursor,
      firstParam(input.cursor),
      defaults.cursor,
    ),
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
  const defaults = filterSchema.parse({});
  const params = new URLSearchParams();

  for (const key of Object.keys(filterSchema.shape) as Array<
    keyof PublicInventoryFilters
  >) {
    const value = filters[key];
    if (value === undefined || value === "" || value === defaults[key])
      continue;
    params.set(key === "query" ? "q" : key, String(value));
  }

  return params.size ? `/servers?${params.toString()}` : "/servers";
}
