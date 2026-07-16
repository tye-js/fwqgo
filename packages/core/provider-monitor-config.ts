import { z } from "zod";

export const PROVIDER_AVAILABILITY_STATUSES = [
  "in_stock",
  "out_of_stock",
  "restocking",
  "discontinued",
  "preorder",
] as const;

export const PROVIDER_SOURCE_ADAPTERS = ["json", "html", "whmcs"] as const;
export type ProviderSourceAdapter = (typeof PROVIDER_SOURCE_ADAPTERS)[number];

export const PROVIDER_SOURCE_PURPOSES = [
  "catalog",
  "promotion",
  "stock",
] as const;
export type ProviderSourcePurpose = (typeof PROVIDER_SOURCE_PURPOSES)[number];

const headersSchema = z
  .record(z.string().trim().min(1).max(120), z.string().max(2_000))
  .default({})
  .refine((headers) => Object.keys(headers).length <= 20, {
    message: "请求头最多配置 20 项",
  });

const statusMapSchema = z
  .record(z.string(), z.enum(PROVIDER_AVAILABILITY_STATUSES))
  .prefault({});

const defaultsSchema = z
  .object({
    productType: z.string().trim().default("vps"),
    productGroup: z.string().trim().optional(),
    currency: z.string().trim().default("USD"),
    billingCycle: z.string().trim().default("monthly"),
    status: z.enum(PROVIDER_AVAILABILITY_STATUSES).default("in_stock"),
    region: z.string().trim().optional(),
    countryCode: z.string().trim().optional(),
    city: z.string().trim().optional(),
    lineType: z.string().trim().optional(),
    network: z.string().trim().optional(),
  })
  .prefault({});

const jsonMonitorConfigSchema = z.object({
  itemsPath: z.string().trim().default("data"),
  externalIdField: z.string().trim().min(1).default("id"),
  statusField: z.string().trim().default("status"),
  titleField: z.string().trim().default("name"),
  productGroupField: z.string().trim().default("productGroup"),
  productTypeField: z.string().trim().default("productType"),
  cpuField: z.string().trim().default("cpu"),
  memoryField: z.string().trim().default("memory"),
  storageField: z.string().trim().default("storage"),
  bandwidthField: z.string().trim().default("bandwidth"),
  trafficField: z.string().trim().default("traffic"),
  regionField: z.string().trim().default("region"),
  countryCodeField: z.string().trim().default("countryCode"),
  cityField: z.string().trim().default("city"),
  lineTypeField: z.string().trim().default("lineType"),
  networkField: z.string().trim().default("network"),
  ipv4Field: z.string().trim().default("ipv4"),
  ipv6Field: z.string().trim().default("ipv6"),
  priceField: z.string().trim().default("price"),
  originalPriceField: z.string().trim().default("originalPrice"),
  currencyField: z.string().trim().default("currency"),
  billingCycleField: z.string().trim().default("billingCycle"),
  purchaseUrlField: z.string().trim().default("purchaseUrl"),
  promoCodeField: z.string().trim().default("promoCode"),
  pricesPath: z.string().trim().optional(),
  requiredSpecCount: z.number().int().min(0).max(5).default(2),
  defaults: defaultsSchema,
  headers: headersSchema,
  statusMap: statusMapSchema,
});

const htmlFieldSchema = z.object({
  selector: z.string().trim().default(""),
  attribute: z.string().trim().optional(),
  pattern: z.string().max(500).optional(),
  group: z.number().int().min(0).max(20).default(1),
});

export type HtmlFieldConfig = z.infer<typeof htmlFieldSchema>;

const htmlFieldsSchema = z.object({
  externalProductId: htmlFieldSchema.prefault({
    selector: "",
    attribute: "data-product-id",
  }),
  title: htmlFieldSchema.prefault({ selector: ".product-name" }),
  status: htmlFieldSchema.prefault({ selector: ".stock" }),
  productGroup: htmlFieldSchema.optional(),
  productType: htmlFieldSchema.optional(),
  cpu: htmlFieldSchema.optional(),
  memory: htmlFieldSchema.optional(),
  storage: htmlFieldSchema.optional(),
  bandwidth: htmlFieldSchema.optional(),
  traffic: htmlFieldSchema.optional(),
  region: htmlFieldSchema.optional(),
  countryCode: htmlFieldSchema.optional(),
  city: htmlFieldSchema.optional(),
  lineType: htmlFieldSchema.optional(),
  network: htmlFieldSchema.optional(),
  ipv4: htmlFieldSchema.optional(),
  ipv6: htmlFieldSchema.optional(),
  price: htmlFieldSchema.prefault({ selector: ".price" }),
  originalPrice: htmlFieldSchema.optional(),
  currency: htmlFieldSchema.optional(),
  billingCycle: htmlFieldSchema.optional(),
  purchaseUrl: htmlFieldSchema.prefault({
    selector: "a[href]",
    attribute: "href",
  }),
  promoCode: htmlFieldSchema.optional(),
});

const htmlMonitorConfigSchema = z.object({
  itemSelector: z.string().trim().min(1).default(".product"),
  fields: htmlFieldsSchema.prefault({}),
  requiredSpecCount: z.number().int().min(0).max(5).default(2),
  defaults: defaultsSchema,
  headers: headersSchema,
  statusMap: statusMapSchema,
});

export type JsonMonitorConfig = z.infer<typeof jsonMonitorConfigSchema>;
export type HtmlMonitorConfig = z.infer<typeof htmlMonitorConfigSchema>;
export type ProviderMonitorConfig = JsonMonitorConfig | HtmlMonitorConfig;

export const PROVIDER_MONITOR_CHECK_RETENTION_DAYS = 30;

export function getProviderMonitorCheckRetentionCutoff(
  now: Date,
  retentionDays = PROVIDER_MONITOR_CHECK_RETENTION_DAYS,
) {
  if (Number.isNaN(now.getTime())) {
    throw new Error("供应商采集记录清理时间无效");
  }

  const normalizedDays = Math.min(
    365,
    Math.max(
      1,
      Math.floor(Number.isFinite(retentionDays) ? retentionDays : 30),
    ),
  );
  return new Date(now.getTime() - normalizedDays * 24 * 60 * 60 * 1_000);
}

const blockedRequestHeaders = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "if-modified-since",
  "if-none-match",
  "proxy-authorization",
  "transfer-encoding",
]);

function assertSafeHeaders(headers: Record<string, string>) {
  for (const name of Object.keys(headers)) {
    if (blockedRequestHeaders.has(name.trim().toLowerCase())) {
      throw new Error(`不允许配置请求头 ${name}`);
    }
  }
}

export function parseProviderMonitorConfig(
  value: unknown,
  adapter?: "json",
): JsonMonitorConfig;
export function parseProviderMonitorConfig(
  value: unknown,
  adapter: "html" | "whmcs",
): HtmlMonitorConfig;
export function parseProviderMonitorConfig(
  value: unknown,
  adapter: ProviderSourceAdapter,
): ProviderMonitorConfig;
export function parseProviderMonitorConfig(
  value: unknown,
  adapter: ProviderSourceAdapter = "json",
): ProviderMonitorConfig {
  const parsed =
    adapter === "json"
      ? jsonMonitorConfigSchema.parse(value)
      : htmlMonitorConfigSchema.parse(value);
  assertSafeHeaders(parsed.headers);
  return parsed;
}
