import { z } from "zod";

import { SERVER_OFFER_KINDS } from "./server-offer-kind";

export const publicInventorySorts = [
  "price-asc",
  "price-desc",
  "latest",
] as const;
export type PublicInventorySort = (typeof publicInventorySorts)[number];

const filterSchema = z.object({
  query: z.string().trim().max(80).default(""),
  kind: z.enum(SERVER_OFFER_KINDS).default("regular"),
  provider: z.string().trim().max(160).default("all"),
  group: z.string().trim().max(200).default("all"),
  stock: z
    .enum([
      "all",
      "in_stock",
      "out_of_stock",
      "restocking",
      "discontinued",
      "preorder",
    ])
    .default("in_stock"),
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
  if (
    data.minPrice !== undefined &&
    data.maxPrice !== undefined &&
    data.minPrice > data.maxPrice
  ) {
    return { ...data, minPrice: data.maxPrice, maxPrice: data.minPrice };
  }
  return data;
}
