import { and, eq, inArray } from "drizzle-orm";

import { parseProviderMonitorConfig } from "@fwqgo/core/provider-monitor-config";
import {
  calculateMonthlyPriceUsd,
  getServerOfferTermMonths,
} from "@fwqgo/core/server-offer-price";
import { db } from "@fwqgo/db";
import {
  affServiceProviders,
  providerOfferCandidates,
  providerMonitors,
  serverOfferPrices,
  serverOffers,
} from "@fwqgo/db/schema";
import {
  hashProviderOfferSyncState,
  parseWhmcsBillingCyclePrices,
  type ProviderOfferCandidate,
} from "@/server/offers/provider-source-parser";
import {
  fetchWhmcsProductPage,
  getWhmcsProductPageUrl,
} from "@/server/offers/whmcs-product-page";

const shouldWrite = process.argv.includes("--write");
const allowInterceptedDns = process.argv.includes("--allow-intercepted-dns");

function numericArgument(name: string, fallback?: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return value;
}

function pricesEqual(
  left: ProviderOfferCandidate["prices"],
  right: ProviderOfferCandidate["prices"],
) {
  const compact = (prices: ProviderOfferCandidate["prices"]) =>
    prices.map((price) => ({
      amount: price.amount,
      originalAmount: price.originalAmount,
      currency: price.currency,
      billingCycle: price.billingCycle,
      purchaseUrl: price.purchaseUrl,
    }));
  return JSON.stringify(compact(left)) === JSON.stringify(compact(right));
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  work: (item: TItem, index: number) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item === undefined) continue;
        results[index] = await work(item, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function notifyOfferCache() {
  const secret = process.env.WEB_REVALIDATION_SECRET?.trim();
  if (!secret) return;
  const port = process.env.WEB_PORT?.trim() ?? "3000";
  const url =
    process.env.WEB_REVALIDATION_URL?.trim() ??
    `http://127.0.0.1:${port}/api/internal/revalidate`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event: "offer.changed", payload: {} }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`缓存通知返回 HTTP ${response.status}`);
  }
}

async function main() {
  const monitorId = numericArgument("monitor-id");
  if (!monitorId) {
    throw new Error("缺少 --monitor-id=<id>");
  }
  const concurrency = Math.min(numericArgument("concurrency", 3)!, 8);

  const [monitor] = await db
    .select({
      id: providerMonitors.id,
      adapter: providerMonitors.adapter,
      purpose: providerMonitors.purpose,
      config: providerMonitors.config,
      autoPublish: providerMonitors.autoPublish,
      missingThreshold: providerMonitors.missingThreshold,
      timeoutSeconds: providerMonitors.timeoutSeconds,
      providerId: affServiceProviders.id,
      providerName: affServiceProviders.name,
      providerSlug: affServiceProviders.slug,
      affUrl: affServiceProviders.affUrl,
      affParam: affServiceProviders.affParam,
      affValue: affServiceProviders.affValue,
      defaultPromoCode: affServiceProviders.defaultPromoCode,
    })
    .from(providerMonitors)
    .innerJoin(
      affServiceProviders,
      eq(providerMonitors.providerId, affServiceProviders.id),
    )
    .where(eq(providerMonitors.id, monitorId))
    .limit(1);
  if (!monitor) throw new Error(`采集源 ${monitorId} 不存在`);
  if (monitor.adapter !== "whmcs") {
    throw new Error(`采集源 ${monitorId} 不是 WHMCS 适配器`);
  }

  const config = parseProviderMonitorConfig(monitor.config, "whmcs");
  const context = {
    monitorId: monitor.id,
    providerId: monitor.providerId,
    providerName: monitor.providerName,
    providerSlug: monitor.providerSlug,
    purpose: monitor.purpose,
    autoPublish: monitor.autoPublish,
    missingThreshold: monitor.missingThreshold,
    affUrl: monitor.affUrl,
    affParam: monitor.affParam,
    affValue: monitor.affValue,
    defaultPromoCode: monitor.defaultPromoCode,
  };
  const rows = await db
    .select({
      id: providerOfferCandidates.id,
      status: providerOfferCandidates.status,
      offerId: providerOfferCandidates.offerId,
      normalizedData: providerOfferCandidates.normalizedData,
    })
    .from(providerOfferCandidates)
    .where(
      and(
        eq(providerOfferCandidates.monitorId, monitorId),
        inArray(providerOfferCandidates.status, ["accepted", "pending"]),
      ),
    );
  const monitorRows = rows.filter(
    (row) =>
      (row.normalizedData as { sourceUrl?: unknown }).sourceUrl &&
      (row.normalizedData as { externalProductId?: unknown }).externalProductId,
  );

  const fetched = await mapWithConcurrency(
    monitorRows,
    concurrency,
    async (row) => {
      const candidate = row.normalizedData as ProviderOfferCandidate;
      try {
        const detailUrl = getWhmcsProductPageUrl(candidate);
        const page = await fetchWhmcsProductPage({
          url: detailUrl,
          headers: config.headers,
          timeoutMs: monitor.timeoutSeconds * 1_000,
          allowInterceptedDns,
        });
        const prices = parseWhmcsBillingCyclePrices({
          body: page.body,
          purchaseUrl: candidate.purchaseUrl,
          fallbackCurrency: candidate.prices[0]?.currency ?? "USD",
        });
        if (prices.length === 0) {
          return {
            row,
            candidate,
            detailUrl,
            prices: candidate.prices,
            unavailable: true,
            error: null,
          };
        }
        return {
          row,
          candidate,
          detailUrl,
          prices,
          unavailable: false,
          error: null,
        };
      } catch (error) {
        return {
          row,
          candidate,
          detailUrl: null,
          prices: null,
          unavailable: false,
          error: error instanceof Error ? error.message : "未知错误",
        };
      }
    },
  );

  let changed = 0;
  let updated = 0;
  let unchanged = 0;
  let unavailable = 0;
  let failed = 0;
  for (const result of fetched) {
    if (!result) continue;
    if (result.error || !result.prices) {
      failed += 1;
      console.error(
        `failed candidate=${result.row.id} product=${result.candidate.externalProductId}: ${result.error}`,
      );
      continue;
    }
    if (result.unavailable) {
      unavailable += 1;
      unchanged += 1;
      console.log(
        `unavailable product=${result.candidate.externalProductId} keep_cycles=${result.prices.length}`,
      );
      continue;
    }
    if (pricesEqual(result.candidate.prices, result.prices)) {
      unchanged += 1;
      console.log(
        `unchanged product=${result.candidate.externalProductId} cycles=${result.prices.length}`,
      );
      continue;
    }

    changed += 1;
    console.log(
      `${shouldWrite ? "update" : "would_update"} product=${result.candidate.externalProductId} cycles=${result.prices.map((price) => `${price.billingCycle}:${price.amount}`).join(",")}`,
    );
    if (!shouldWrite) continue;

    const now = new Date();
    const candidate: ProviderOfferCandidate = {
      ...result.candidate,
      prices: result.prices,
      raw: {
        ...result.candidate.raw,
        pricing: {
          sourceUrl: result.detailUrl,
          collectedAt: now.toISOString(),
        },
      },
    };
    const sourceHash = hashProviderOfferSyncState(candidate, context);
    const normalizedPrices = candidate.prices
      .map((price) => {
        const monthlyPriceUsd = calculateMonthlyPriceUsd(price);
        return monthlyPriceUsd === null
          ? null
          : {
              ...price,
              termMonths: getServerOfferTermMonths(price.billingCycle),
              monthlyPriceUsd,
            };
      })
      .filter((price): price is NonNullable<typeof price> => price !== null)
      .sort((left, right) => left.monthlyPriceUsd - right.monthlyPriceUsd);
    const primaryPrice = normalizedPrices[0];
    if (!primaryPrice) {
      throw new Error(`套餐 ${candidate.externalProductId} 没有可入库价格`);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(providerOfferCandidates)
        .set({
          normalizedData: candidate,
          sourceHash,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(providerOfferCandidates.id, result.row.id));

      if (!result.row.offerId) return;
      const [offer] = await tx
        .select({ lockedFields: serverOffers.lockedFields })
        .from(serverOffers)
        .where(eq(serverOffers.id, result.row.offerId))
        .limit(1);
      if (!offer) {
        throw new Error(
          `套餐 ${candidate.externalProductId} 的已接收记录不存在`,
        );
      }
      if ((offer.lockedFields ?? []).includes("price")) {
        throw new Error(`套餐 ${candidate.externalProductId} 的价格字段已锁定`);
      }

      await tx
        .update(serverOffers)
        .set({
          sourceHash,
          priceAmount: primaryPrice.amount,
          originalPriceAmount: primaryPrice.originalAmount,
          currency: primaryPrice.currency,
          billingCycle: primaryPrice.billingCycle,
          monthlyPriceUsd: String(primaryPrice.monthlyPriceUsd),
          sourceLastSeenAt: now,
          lastCheckedAt: now,
          checkStatus: "ok",
          updatedAt: now,
        })
        .where(eq(serverOffers.id, result.row.offerId));
      await tx
        .update(serverOfferPrices)
        .set({ active: false, updatedAt: now })
        .where(eq(serverOfferPrices.offerId, result.row.offerId));

      for (const price of normalizedPrices) {
        await tx
          .insert(serverOfferPrices)
          .values({
            offerId: result.row.offerId,
            billingCycle: price.billingCycle,
            termMonths: price.termMonths,
            amount: price.amount,
            originalAmount: price.originalAmount,
            currency: price.currency,
            monthlyPriceUsd: String(price.monthlyPriceUsd),
            purchaseUrl: price.purchaseUrl,
            active: true,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              serverOfferPrices.offerId,
              serverOfferPrices.billingCycle,
              serverOfferPrices.currency,
            ],
            set: {
              termMonths: price.termMonths,
              amount: price.amount,
              originalAmount: price.originalAmount,
              monthlyPriceUsd: String(price.monthlyPriceUsd),
              purchaseUrl: price.purchaseUrl,
              active: true,
              updatedAt: now,
            },
          });
      }
    });
    updated += 1;
  }

  if (shouldWrite && updated > 0) {
    try {
      await notifyOfferCache();
    } catch (error) {
      console.error("套餐价格已更新，但前台缓存通知失败:", error);
    }
  }

  console.log(
    JSON.stringify({
      mode: shouldWrite ? "write" : "dry-run",
      monitorId,
      provider: monitor.providerName,
      scanned: fetched.length,
      changed,
      updated,
      unchanged,
      unavailable,
      failed,
    }),
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
