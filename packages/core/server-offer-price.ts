export const SERVER_OFFER_BILLING_CYCLES = [
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
  "biennial",
  "triennial",
] as const;

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
  return SERVER_OFFER_BILLING_CYCLES.includes(
    normalized as ServerOfferBillingCycle,
  )
    ? (normalized as ServerOfferBillingCycle)
    : "monthly";
}

export function getServerOfferTermMonths(
  value: string | null | undefined,
) {
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

  const cnyPerUsd = input.cnyPerUsd ?? 7.2;
  if (!Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) return null;

  const amountUsd =
    input.currency?.trim().toUpperCase() === "CNY"
      ? amount / cnyPerUsd
      : amount;
  const monthly = amountUsd / getServerOfferTermMonths(input.billingCycle);

  return Math.round(monthly * 10_000) / 10_000;
}
