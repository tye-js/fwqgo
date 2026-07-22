import { eq } from "drizzle-orm";

import {
  FALLBACK_SERVER_OFFER_EXCHANGE_RATES,
  SERVER_OFFER_CURRENCIES,
  type ServerOfferCurrency,
  type ServerOfferExchangeRates,
} from "@fwqgo/core/server-offer-price";
import { isPostgresUndefinedTableError } from "@fwqgo/core/postgres-error";
import { readDb } from "@fwqgo/db";
import { serverExchangeRates } from "@fwqgo/db/schema";

export type ServerOfferExchangeRateSnapshot = {
  rates: ServerOfferExchangeRates;
  source: string;
  updatedAt: Date | null;
  fallbackCurrencies: ServerOfferCurrency[];
};

export type ServerOfferExchangeRateRow = {
  currency: string;
  unitsPerUsd: string;
  source: string;
  fetchedAt: Date;
};

let cachedSnapshot: ServerOfferExchangeRateSnapshot | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1_000;

async function loadServerOfferExchangeRateRows() {
  return readDb
    .select({
      currency: serverExchangeRates.currency,
      unitsPerUsd: serverExchangeRates.unitsPerUsd,
      source: serverExchangeRates.source,
      fetchedAt: serverExchangeRates.fetchedAt,
    })
    .from(serverExchangeRates)
    .where(eq(serverExchangeRates.enabled, true));
}

export function isMissingServerExchangeRateTableError(error: unknown) {
  return isPostgresUndefinedTableError(error, "server_exchange_rates");
}

export async function getServerOfferExchangeRateSnapshot(
  loadRows: () => Promise<
    ServerOfferExchangeRateRow[]
  > = loadServerOfferExchangeRateRows,
) {
  if (cachedSnapshot && Date.now() - cachedAt < CACHE_MS) {
    return cachedSnapshot;
  }

  let rows: ServerOfferExchangeRateRow[];
  try {
    rows = await loadRows();
  } catch (error) {
    if (!isMissingServerExchangeRateTableError(error)) throw error;
    console.warn("server_exchange_rates 尚未迁移，服务器套餐暂时使用内置汇率");
    rows = [];
  }
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
