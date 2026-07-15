import { z } from "zod";

export const PROVIDER_AVAILABILITY_STATUSES = [
  "in_stock",
  "out_of_stock",
  "restocking",
  "discontinued",
  "preorder",
] as const;

const providerMonitorConfigSchema = z.object({
  itemsPath: z.string().trim().default("data"),
  externalIdField: z.string().trim().min(1).default("id"),
  statusField: z.string().trim().min(1).default("status"),
  titleField: z.string().trim().default("name"),
  priceField: z.string().trim().default("price"),
  currencyField: z.string().trim().default("currency"),
  billingCycleField: z.string().trim().default("billingCycle"),
  purchaseUrlField: z.string().trim().default("purchaseUrl"),
  pricesPath: z.string().trim().optional(),
  headers: z
    .record(z.string().trim().min(1).max(120), z.string().max(2_000))
    .default({})
    .refine((headers) => Object.keys(headers).length <= 20, {
      message: "请求头最多配置 20 项",
    }),
  statusMap: z
    .record(z.string(), z.enum(PROVIDER_AVAILABILITY_STATUSES))
    .default({}),
});

export type JsonMonitorConfig = z.infer<typeof providerMonitorConfigSchema>;

export const PROVIDER_MONITOR_CHECK_RETENTION_DAYS = 30;

export function getProviderMonitorCheckRetentionCutoff(
  now: Date,
  retentionDays = PROVIDER_MONITOR_CHECK_RETENTION_DAYS,
) {
  if (Number.isNaN(now.getTime())) {
    throw new Error("库存探测记录清理时间无效");
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
  "proxy-authorization",
  "transfer-encoding",
]);

export function parseProviderMonitorConfig(value: unknown) {
  const parsed = providerMonitorConfigSchema.parse(value);
  for (const name of Object.keys(parsed.headers)) {
    if (blockedRequestHeaders.has(name.trim().toLowerCase())) {
      throw new Error(`不允许配置请求头 ${name}`);
    }
  }
  return parsed;
}
