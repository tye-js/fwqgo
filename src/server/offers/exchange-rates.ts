import { eq } from "drizzle-orm";

import {
  FALLBACK_SERVER_OFFER_EXCHANGE_RATES,
  SERVER_OFFER_CURRENCIES,
  type ServerOfferCurrency,
  type ServerOfferExchangeRates,
} from "@fwqgo/core/server-offer-price";
import { readDb } from "@fwqgo/db";
import { serverExchangeRates } from "@fwqgo/db/schema";

export type ServerOfferExchangeRateSnapshot = {
  rates: ServerOfferExchangeRates;
  source: string;
  updatedAt: Date | null;
  fallbackCurrencies: ServerOfferCurrency[];
};

let cachedSnapshot: ServerOfferExchangeRateSnapshot | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1_000;

export async function getServerOfferExchangeRateSnapshot() {
  if (cachedSnapshot && Date.now() - cachedAt < CACHE_MS) {
    return cachedSnapshot;
  }

  const rows = await readDb
    .select({
      currency: serverExchangeRates.currency,
      unitsPerUsd: serverExchangeRates.unitsPerUsd,
      source: serverExchangeRates.source,
      fetchedAt: serverExchangeRates.fetchedAt,
    })
    .from(serverExchangeRates)
    .where(eq(serverExchangeRates.enabled, true));
  const rates: ServerOfferExchangeRates = {};
  const fallbackCurrencies: ServerOfferCurrency[] = [];
  const sourceNames = new Set<string>();
  let updatedAt: Date | null = null;

  for (const currency of SERVER_OFFER_CURRENCIES) {
    const row = rows.find((item) => item.currency === currency);
    const parsed = Number(row?.unitsPerUsd);
    if (row && Number.isFinite(parsed) && parsed > 0) {
      rates[currency] = parsed;
      sourceNames.add(row.source);
      if (!updatedAt || row.fetchedAt > updatedAt) updatedAt = row.fetchedAt;
    } else {
      rates[currency] = FALLBACK_SERVER_OFFER_EXCHANGE_RATES[currency];
      fallbackCurrencies.push(currency);
    }
  }

  cachedSnapshot = {
    rates,
    source:
      sourceNames.size > 0
        ? [...sourceNames].sort().join(", ")
        : "built-in fallback",
    updatedAt,
    fallbackCurrencies,
  };
  cachedAt = Date.now();
  return cachedSnapshot;
}

export function invalidateServerOfferExchangeRateCache() {
  cachedSnapshot = null;
  cachedAt = 0;
}
