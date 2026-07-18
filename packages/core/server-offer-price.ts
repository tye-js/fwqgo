export const SERVER_OFFER_BILLING_CYCLES = [
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
  "biennial",
  "triennial",
] as const;

export const SERVER_OFFER_CURRENCIES = ["USD", "CNY"] as const;

export type ServerOfferCurrency = (typeof SERVER_OFFER_CURRENCIES)[number];

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
    "2year": "biennial",
    "24month": "biennial",
    两年付: "biennial",
    triennial: "triennial",
    "3year": "triennial",
    "36month": "triennial",
    三年付: "triennial",
  };
  return aliases[compact] ??
    (SERVER_OFFER_BILLING_CYCLES.includes(
      normalized as ServerOfferBillingCycle,
    )
      ? (normalized as ServerOfferBillingCycle)
      : "monthly");
}

export function getServerOfferTermMonths(value: string | null | undefined) {
  return BILLING_CYCLE_MONTHS[normalizeServerOfferBillingCycle(value)];
}

export function calculateMonthlyPriceUsd(input: {
  amount: string | number | null | undefined;
  currency: string | null | undefined;
  billingCycle: string | null | undefined;
  cnyPerUsd?: number;
}) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const currency = input.currency?.trim().toUpperCase();
  if (!isSupportedServerOfferCurrency(currency)) return null;

  const cnyPerUsd = input.cnyPerUsd ?? 7.2;
  if (!Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) return null;

  const amountUsd = currency === "CNY" ? amount / cnyPerUsd : amount;
  const monthly = amountUsd / getServerOfferTermMonths(input.billingCycle);

  return Math.round(monthly * 10_000) / 10_000;
}
