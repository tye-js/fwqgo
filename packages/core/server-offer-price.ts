export const SERVER_OFFER_BILLING_CYCLES = [
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
  "biennial",
  "triennial",
] as const;

export const SERVER_OFFER_CURRENCIES = [
  "USD",
  "CNY",
  "EUR",
  "GBP",
  "HKD",
  "JPY",
  "CAD",
  "AUD",
] as const;

export type ServerOfferCurrency = (typeof SERVER_OFFER_CURRENCIES)[number];

export type ServerOfferExchangeRates = Partial<
  Record<ServerOfferCurrency, number>
>;

export const FALLBACK_SERVER_OFFER_EXCHANGE_RATES: Readonly<
  Record<ServerOfferCurrency, number>
> = {
  USD: 1,
  CNY: 7.2,
  EUR: 0.92,
  GBP: 0.79,
  HKD: 7.8,
  JPY: 150,
  CAD: 1.36,
  AUD: 1.52,
};

export function parseServerOfferAmount(
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseSpecNumber(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseServerOfferMemoryMb(
  value: string | null | undefined,
) {
  const match = value?.match(/([0-9]+(?:\.[0-9]+)?)\s*(GB|G|MB|M)\b/i);
  const amount = parseSpecNumber(match?.[1]);
  if (amount === null || !match?.[2]) return null;
  return Math.round(/g/i.test(match[2]) ? amount * 1024 : amount);
}

export function parseServerOfferStorageGb(
  value: string | null | undefined,
) {
  const match = value?.match(/([0-9]+(?:\.[0-9]+)?)\s*(TB|T|GB|G)\b/i);
  const amount = parseSpecNumber(match?.[1]);
  if (amount === null || !match?.[2]) return null;
  return Math.round(/t/i.test(match[2]) ? amount * 1024 : amount);
}

export function parseServerOfferBandwidthMbps(
  value: string | null | undefined,
) {
  const match = value?.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(Gbps|G口|Mbps|M口|G|M)\b/i,
  );
  const amount = parseSpecNumber(match?.[1]);
  if (amount === null || !match?.[2]) return null;
  return Math.round(/g/i.test(match[2]) ? amount * 1000 : amount);
}

export function parseServerOfferTrafficGb(
  value: string | null | undefined,
) {
  return parseServerOfferStorageGb(value);
}

export function isSupportedServerOfferCurrency(
  value: string | null | undefined,
) {
  return SERVER_OFFER_CURRENCIES.includes(
    value?.trim().toUpperCase() as ServerOfferCurrency,
  );
}

export type ServerOfferBillingCycle =
  (typeof SERVER_OFFER_BILLING_CYCLES)[number];

const BILLING_CYCLE_MONTHS: Record<ServerOfferBillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
};

export function normalizeServerOfferBillingCycle(
  value: string | null | undefined,
): ServerOfferBillingCycle {
  const normalized = value?.trim().toLowerCase();
  const compact = normalized?.replace(/[\s_-]+/g, "") ?? "";
  const aliases: Record<string, ServerOfferBillingCycle> = {
    month: "monthly",
    mo: "monthly",
    "1month": "monthly",
    月: "monthly",
    月付: "monthly",
    quarter: "quarterly",
    "3month": "quarterly",
    "3months": "quarterly",
    季付: "quarterly",
    semiannual: "semiannual",
    semiannually: "semiannual",
    halfyear: "semiannual",
    "6month": "semiannual",
    "6months": "semiannual",
    半年付: "semiannual",
    annual: "yearly",
    annually: "yearly",
    year: "yearly",
    yr: "yearly",
    "12month": "yearly",
    "12months": "yearly",
    年付: "yearly",
    biennial: "biennial",
    biennially: "biennial",
    "2year": "biennial",
    "24month": "biennial",
    两年付: "biennial",
    triennial: "triennial",
    triennially: "triennial",
    "3year": "triennial",
    "36month": "triennial",
    三年付: "triennial",
  };
  return (
    aliases[compact] ??
    (SERVER_OFFER_BILLING_CYCLES.includes(normalized as ServerOfferBillingCycle)
      ? (normalized as ServerOfferBillingCycle)
      : "monthly")
  );
}

export function getServerOfferTermMonths(value: string | null | undefined) {
  return BILLING_CYCLE_MONTHS[normalizeServerOfferBillingCycle(value)];
}

export function calculateMonthlyPriceUsd(input: {
  amount: string | number | null | undefined;
  currency: string | null | undefined;
  billingCycle: string | null | undefined;
  cnyPerUsd?: number;
  exchangeRates?: ServerOfferExchangeRates;
}) {
  const amount = parseServerOfferAmount(input.amount);
  if (amount === null) return null;

  const currency = input.currency?.trim().toUpperCase();
  if (!isSupportedServerOfferCurrency(currency)) return null;

  const rate =
    (currency === "CNY" ? input.cnyPerUsd : undefined) ??
    input.exchangeRates?.[currency as ServerOfferCurrency] ??
    FALLBACK_SERVER_OFFER_EXCHANGE_RATES[currency as ServerOfferCurrency];
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const amountUsd = amount / rate;
  const monthly = amountUsd / getServerOfferTermMonths(input.billingCycle);

  return Math.round(monthly * 10_000) / 10_000;
}

export function resolveMonthlyPriceUsd(input: {
  monthlyPriceUsd?: string | number | null;
  amount: string | number | null | undefined;
  currency: string | null | undefined;
  billingCycle: string | null | undefined;
}) {
  const storedMonthlyPrice = parseServerOfferAmount(input.monthlyPriceUsd);
  if (storedMonthlyPrice !== null) return storedMonthlyPrice;

  return calculateMonthlyPriceUsd(input);
}

export function formatServerOfferAmount(input: {
  amount: string | number | null | undefined;
  currency: string | null | undefined;
}) {
  const amount = parseServerOfferAmount(input.amount);
  const currency = input.currency?.trim().toUpperCase();
  if (amount === null || !isSupportedServerOfferCurrency(currency)) {
    return null;
  }

  const symbols: Partial<Record<ServerOfferCurrency, string>> = {
    USD: "$",
    CNY: "¥",
    EUR: "€",
    GBP: "£",
    HKD: "HK$",
    JPY: "¥",
    CAD: "C$",
    AUD: "A$",
  };
  return `${symbols[currency as ServerOfferCurrency] ?? `${currency} `}${amount.toFixed(2)}`;
}
