import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { enqueueAdminBackgroundJob } from "@/server/admin/background-jobs";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import { fetchPublicHttpUrl } from "@fwqgo/core/network-url";
import {
  getProviderMonitorCheckRetentionCutoff,
  parseProviderMonitorConfig,
  type JsonMonitorConfig,
} from "@fwqgo/core/provider-monitor-config";
import type { PROVIDER_AVAILABILITY_STATUSES } from "@fwqgo/core/provider-monitor-config";
import {
  calculateMonthlyPriceUsd,
  getServerOfferTermMonths,
  normalizeServerOfferBillingCycle,
} from "@fwqgo/core/server-offer-price";
import { db } from "@fwqgo/db";
import {
  adminBackgroundJobs,
  affServiceProviders,
  providerMonitors,
  serverOfferChecks,
  serverOfferPrices,
  serverOfferSources,
  serverOffers,
} from "@fwqgo/db/schema";
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";

const MAX_MONITOR_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_MONITOR_ITEMS = 5_000;
const STALE_CHECK_THRESHOLD_MS = 24 * 60 * 60 * 1_000;

type AvailabilityStatus = (typeof PROVIDER_AVAILABILITY_STATUSES)[number];

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "未知错误";
}

function truncate(value: string, length = 5_000) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

async function pruneProviderMonitorCheckHistory(
  referenceTime: Date,
) {
  const cutoff = getProviderMonitorCheckRetentionCutoff(referenceTime);
  await db
    .delete(serverOfferChecks)
    .where(lt(serverOfferChecks.checkedAt, cutoff));
}

async function safelyPruneProviderMonitorCheckHistory(
  referenceTime: Date,
) {
  try {
    await pruneProviderMonitorCheckHistory(referenceTime);
  } catch (error) {
    console.error("清理过期库存探测记录失败:", error);
  }
}

function readPath(value: unknown, path: string) {
  if (!path.trim()) return value;
  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    if (typeof current === "object" && current !== null) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, value);
}

function toStringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function emptyStringToNull(value: string) {
  return value ? value : null;
}

function firstNonEmptyString(
  ...values: Array<string | null | undefined>
): string | null {
  return values.find((value) => Boolean(value)) ?? null;
}

function normalizeAvailabilityStatus(
  value: unknown,
  statusMap: JsonMonitorConfig["statusMap"],
): AvailabilityStatus | null {
  if (typeof value === "boolean") return value ? "in_stock" : "out_of_stock";
  const raw = toStringValue(value);
  if (!raw) return null;
  const mapped = statusMap[raw] ?? statusMap[raw.toLowerCase()];
  if (mapped) return mapped;
  if (/^(true|yes|available|in[_ -]?stock|有货)$/i.test(raw)) {
    return "in_stock";
  }
  if (
    /^(false|no|unavailable|out[_ -]?of[_ -]?stock|sold[_ -]?out|缺货)$/i.test(
      raw,
    )
  ) {
    return "out_of_stock";
  }
  if (/restock|补货/i.test(raw)) return "restocking";
  if (/preorder|预售/i.test(raw)) return "preorder";
  if (/discontinued|停售/i.test(raw)) return "discontinued";
  return null;
}

function normalizePriceRows(item: unknown, config: JsonMonitorConfig) {
  const source = config.pricesPath ? readPath(item, config.pricesPath) : null;
  const candidates =
    Array.isArray(source) && source.length > 0 ? source : [item];

  const normalized = candidates
    .map((candidate) => {
      const amount = toStringValue(readPath(candidate, config.priceField));
      const currency =
        toStringValue(
          readPath(candidate, config.currencyField),
        ).toUpperCase() || "USD";
      const billingCycle = normalizeServerOfferBillingCycle(
        toStringValue(readPath(candidate, config.billingCycleField)),
      );
      const monthlyPriceUsd = calculateMonthlyPriceUsd({
        amount,
        currency,
        billingCycle,
      });
      if (!amount || monthlyPriceUsd === null) return null;

      return {
        amount,
        currency,
        billingCycle,
        termMonths: getServerOfferTermMonths(billingCycle),
        monthlyPriceUsd,
        purchaseUrl: emptyStringToNull(
          toStringValue(readPath(candidate, config.purchaseUrlField)),
        ),
      };
    })
    .filter((price): price is NonNullable<typeof price> => Boolean(price))
    .sort((left, right) => left.monthlyPriceUsd - right.monthlyPriceUsd);
  const unique = new Map<string, (typeof normalized)[number]>();
  for (const price of normalized) {
    const key = `${price.billingCycle}:${price.currency}`;
    if (!unique.has(key)) unique.set(key, price);
  }
  return [...unique.values()];
}

export type ProviderMonitorRunSummary = {
  monitorId: number;
  providerName: string;
  received: number;
  matched: number;
  changed: number;
  skipped: number;
  checkedAt: string;
};

export async function runProviderMonitor(
  monitorId: number,
): Promise<ProviderMonitorRunSummary> {
  const [monitor] = await db
    .select({
      id: providerMonitors.id,
      providerId: providerMonitors.providerId,
      name: providerMonitors.name,
      adapter: providerMonitors.adapter,
      endpointUrl: providerMonitors.endpointUrl,
      config: providerMonitors.config,
      enabled: providerMonitors.enabled,
      intervalMinutes: providerMonitors.intervalMinutes,
      timeoutSeconds: providerMonitors.timeoutSeconds,
      providerName: affServiceProviders.name,
    })
    .from(providerMonitors)
    .innerJoin(
      affServiceProviders,
      eq(providerMonitors.providerId, affServiceProviders.id),
    )
    .where(eq(providerMonitors.id, monitorId))
    .limit(1);

  if (!monitor) throw new Error("库存监控配置不存在");
  if (!monitor.enabled) {
    return {
      monitorId: monitor.id,
      providerName: monitor.providerName,
      received: 0,
      matched: 0,
      changed: 0,
      skipped: 0,
      checkedAt: new Date().toISOString(),
    };
  }
  if (monitor.adapter !== "json") {
    throw new Error(`暂不支持监控适配器：${monitor.adapter}`);
  }

  const config = parseProviderMonitorConfig(monitor.config);
  const startedAt = Date.now();
  const checkedAt = new Date();

  await db
    .update(providerMonitors)
    .set({
      lastStatus: "running",
      lastError: null,
      lastRunAt: checkedAt,
      updatedAt: checkedAt,
    })
    .where(eq(providerMonitors.id, monitor.id));

  try {
    const response = await fetchPublicHttpUrl(
      monitor.endpointUrl,
      {
        headers: { Accept: "application/json", ...config.headers },
        maxRedirects: 0,
        signal: AbortSignal.timeout(monitor.timeoutSeconds * 1_000),
      },
      "库存监控地址",
    );
    if (!response.ok) {
      throw new Error(
        `库存接口返回 HTTP ${response.status} ${response.statusText}`,
      );
    }
    const text = await readResponseTextWithLimit(
      response,
      MAX_MONITOR_RESPONSE_BYTES,
    );
    if (text === null) throw new Error("库存接口响应超过 8 MB 限制");

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("库存接口返回内容不是有效 JSON");
    }
    const rawItems = readPath(payload, config.itemsPath);
    if (!Array.isArray(rawItems)) {
      throw new Error(`库存接口字段 ${config.itemsPath || "根节点"} 不是数组`);
    }
    if (rawItems.length > MAX_MONITOR_ITEMS) {
      throw new Error(`库存接口一次返回超过 ${MAX_MONITOR_ITEMS} 条产品`);
    }

    const offers = await db
      .select({
        id: serverOffers.id,
        title: serverOffers.title,
        externalProductId: serverOffers.externalProductId,
        status: serverOffers.status,
        priceAmount: serverOffers.priceAmount,
        currency: serverOffers.currency,
        billingCycle: serverOffers.billingCycle,
        monthlyPriceUsd: serverOffers.monthlyPriceUsd,
        purchaseUrl: serverOffers.purchaseUrl,
        checkStatus: serverOffers.checkStatus,
        lastCheckedAt: serverOffers.lastCheckedAt,
        lockedFields: serverOffers.lockedFields,
      })
      .from(serverOffers)
      .where(
        and(
          eq(serverOffers.providerId, monitor.providerId),
          eq(serverOffers.offerKind, "promotion"),
          isNotNull(serverOffers.externalProductId),
        ),
      );
    const offersByExternalId = new Map(
      offers.map((offer) => [offer.externalProductId!, offer]),
    );

    let matched = 0;
    let changed = 0;
    let skipped = 0;
    let publicStateChanged = false;
    const checkRows: Array<typeof serverOfferChecks.$inferInsert> = [];

    for (const item of rawItems) {
      const externalId = toStringValue(readPath(item, config.externalIdField));
      const offer = externalId ? offersByExternalId.get(externalId) : null;
      if (!offer) {
        skipped += 1;
        continue;
      }
      matched += 1;
      const lockedFields = new Set(offer.lockedFields ?? []);
      const availability = normalizeAvailabilityStatus(
        readPath(item, config.statusField),
        config.statusMap,
      );
      const prices = normalizePriceRows(item, config);
      const primaryPrice = prices[0];
      const title = toStringValue(readPath(item, config.titleField));
      const purchaseUrl = firstNonEmptyString(
        toStringValue(readPath(item, config.purchaseUrlField)),
        primaryPrice?.purchaseUrl,
      );
      const nextStatus =
        availability && !lockedFields.has("status")
          ? availability
          : (offer.status as AvailabilityStatus);
      const statusChanged = nextStatus !== offer.status;
      const priceChanged = Boolean(
        primaryPrice &&
        !lockedFields.has("price") &&
        (offer.priceAmount !== primaryPrice.amount ||
          offer.currency !== primaryPrice.currency ||
          offer.billingCycle !== primaryPrice.billingCycle ||
          Number(offer.monthlyPriceUsd) !== primaryPrice.monthlyPriceUsd),
      );
      const titleChanged = Boolean(
        title && !lockedFields.has("title") && title !== offer.title,
      );
      const purchaseUrlChanged = Boolean(
        purchaseUrl &&
        !lockedFields.has("purchaseUrl") &&
        purchaseUrl !== offer.purchaseUrl,
      );
      const meaningfulChange =
        statusChanged || priceChanged || titleChanged || purchaseUrlChanged;
      const nextCheckStatus = availability ? "ok" : "unknown";
      const checkStateChanged = offer.checkStatus !== nextCheckStatus;
      const staleCheckRefreshed =
        offer.lastCheckedAt === null ||
        checkedAt.getTime() - offer.lastCheckedAt.getTime() >=
          STALE_CHECK_THRESHOLD_MS;

      const updateValues: Partial<typeof serverOffers.$inferInsert> = {
        checkStatus: nextCheckStatus,
        lastCheckedAt: checkedAt,
      };
      if (meaningfulChange) updateValues.updatedAt = checkedAt;
      if (statusChanged) {
        updateValues.status = nextStatus;
        updateValues.statusChangedAt = checkedAt;
      }
      if (title && !lockedFields.has("title")) updateValues.title = title;
      if (primaryPrice && !lockedFields.has("price")) {
        updateValues.priceAmount = primaryPrice.amount;
        updateValues.currency = primaryPrice.currency;
        updateValues.billingCycle = primaryPrice.billingCycle;
        updateValues.monthlyPriceUsd = String(primaryPrice.monthlyPriceUsd);
      }
      if (purchaseUrl && !lockedFields.has("purchaseUrl")) {
        updateValues.purchaseUrl = purchaseUrl;
      }

      await db
        .update(serverOffers)
        .set(updateValues)
        .where(eq(serverOffers.id, offer.id));

      if (!lockedFields.has("price")) {
        for (const price of prices) {
          await db
            .insert(serverOfferPrices)
            .values({
              offerId: offer.id,
              billingCycle: price.billingCycle,
              termMonths: price.termMonths,
              amount: price.amount,
              currency: price.currency,
              monthlyPriceUsd: String(price.monthlyPriceUsd),
              purchaseUrl: price.purchaseUrl ?? purchaseUrl,
              active: true,
              updatedAt: checkedAt,
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
                monthlyPriceUsd: String(price.monthlyPriceUsd),
                purchaseUrl: price.purchaseUrl ?? purchaseUrl,
                active: true,
                updatedAt: checkedAt,
              },
            });
        }
      }

      const [existingSource] = await db
        .select({
          id: serverOfferSources.id,
          sourceUrl: serverOfferSources.sourceUrl,
        })
        .from(serverOfferSources)
        .where(
          and(
            eq(serverOfferSources.offerId, offer.id),
            eq(serverOfferSources.sourceType, "monitor"),
            eq(serverOfferSources.externalId, externalId),
          ),
        )
        .limit(1);
      if (!existingSource) {
        await db.insert(serverOfferSources).values({
          offerId: offer.id,
          sourceType: "monitor",
          sourceUrl: monitor.endpointUrl,
          externalId,
          priority: 20,
        });
      } else if (existingSource.sourceUrl !== monitor.endpointUrl) {
        await db
          .update(serverOfferSources)
          .set({ sourceUrl: monitor.endpointUrl, updatedAt: checkedAt })
          .where(eq(serverOfferSources.id, existingSource.id));
      }

      checkRows.push({
        offerId: offer.id,
        monitorId: monitor.id,
        status: availability ? "ok" : "unknown",
        available: availability === null ? null : availability === "in_stock",
        priceAmount: primaryPrice?.amount ?? null,
        currency: primaryPrice?.currency ?? null,
        responseTimeMs: Date.now() - startedAt,
        checkedAt,
      });
      if (meaningfulChange) changed += 1;
      if (meaningfulChange || checkStateChanged || staleCheckRefreshed) {
        publicStateChanged = true;
      }
    }

    if (checkRows.length > 0)
      await db.insert(serverOfferChecks).values(checkRows);
    await safelyPruneProviderMonitorCheckHistory(checkedAt);
    const nextRunAt = new Date(
      checkedAt.getTime() + monitor.intervalMinutes * 60_000,
    );
    await db
      .update(providerMonitors)
      .set({
        lastRunAt: checkedAt,
        nextRunAt,
        lastStatus: "succeeded",
        lastError: null,
        updatedAt: checkedAt,
      })
      .where(eq(providerMonitors.id, monitor.id));

    if (publicStateChanged) {
      await notifyPublicWebCache("offer.changed", {
        topicSlugs: ["hong-kong", "united-states", "cheap-vps"],
      });
    }
    await enqueueProviderMonitorTask(monitor.id, nextRunAt);

    return {
      monitorId: monitor.id,
      providerName: monitor.providerName,
      received: rawItems.length,
      matched,
      changed,
      skipped,
      checkedAt: checkedAt.toISOString(),
    };
  } catch (error) {
    const message = truncate(getErrorMessage(error));
    const nextRunAt = new Date(
      checkedAt.getTime() + monitor.intervalMinutes * 60_000,
    );
    let failedOfferCount = 0;
    try {
      const mappedSources = await db
        .select({ offerId: serverOfferSources.offerId })
        .from(serverOfferSources)
        .innerJoin(
          serverOffers,
          eq(serverOfferSources.offerId, serverOffers.id),
        )
        .where(
          and(
            eq(serverOfferSources.sourceType, "monitor"),
            eq(serverOfferSources.sourceUrl, monitor.endpointUrl),
            eq(serverOffers.providerId, monitor.providerId),
            eq(serverOffers.offerKind, "promotion"),
          ),
        )
        .limit(MAX_MONITOR_ITEMS);
      const failedOfferIds = [
        ...new Set(mappedSources.map((source) => source.offerId)),
      ];
      failedOfferCount = failedOfferIds.length;
      if (failedOfferIds.length > 0) {
        await db
          .update(serverOffers)
          .set({ checkStatus: "failed", lastCheckedAt: checkedAt })
          .where(inArray(serverOffers.id, failedOfferIds));
        await db.insert(serverOfferChecks).values(
          failedOfferIds.map((offerId) => ({
            offerId,
            monitorId: monitor.id,
            status: "failed",
            error: message,
            responseTimeMs: Date.now() - startedAt,
            checkedAt,
          })),
        );
      }
    } catch (recordError) {
      console.error("记录库存监控失败状态时发生错误:", recordError);
    }
    await db
      .update(providerMonitors)
      .set({
        lastRunAt: checkedAt,
        nextRunAt,
        lastStatus: "failed",
        lastError: message,
        updatedAt: checkedAt,
      })
      .where(eq(providerMonitors.id, monitor.id));
    await safelyPruneProviderMonitorCheckHistory(checkedAt);
    if (failedOfferCount > 0) {
      try {
        await notifyPublicWebCache("offer.changed", {
          topicSlugs: ["hong-kong", "united-states", "cheap-vps"],
        });
      } catch (notifyError) {
        console.error("库存监控失败状态缓存通知失败:", notifyError);
      }
    }
    throw new Error(message);
  }
}

export async function enqueueProviderMonitorTask(
  monitorId: number,
  runAfter = new Date(),
) {
  return enqueueAdminBackgroundJob({
    key: `provider-monitor:${monitorId}`,
    label: `库存监控 #${monitorId}`,
    payload: { monitorId },
    runAfter,
    maxAttempts: 3,
    run: async ({ job }) => {
      try {
        await runProviderMonitor(monitorId);
      } catch (error) {
        if (job.attempts >= job.maxAttempts) {
          const [monitor] = await db
            .select({ nextRunAt: providerMonitors.nextRunAt })
            .from(providerMonitors)
            .where(eq(providerMonitors.id, monitorId))
            .limit(1);
          if (monitor) {
            await enqueueProviderMonitorTask(
              monitorId,
              monitor.nextRunAt ?? new Date(Date.now() + 30 * 60_000),
            );
          }
        }
        throw error;
      }
    },
  });
}

export async function ensureProviderMonitorWorkers() {
  const monitors = await db
    .select({
      id: providerMonitors.id,
      nextRunAt: providerMonitors.nextRunAt,
    })
    .from(providerMonitors)
    .where(eq(providerMonitors.enabled, true))
    .orderBy(asc(providerMonitors.nextRunAt));

  const now = new Date();
  for (const monitor of monitors) {
    await enqueueProviderMonitorTask(monitor.id, monitor.nextRunAt ?? now);
  }
}

export async function getProviderMonitorList() {
  return db
    .select({
      id: providerMonitors.id,
      providerId: providerMonitors.providerId,
      providerName: affServiceProviders.name,
      name: providerMonitors.name,
      adapter: providerMonitors.adapter,
      endpointUrl: providerMonitors.endpointUrl,
      config: providerMonitors.config,
      enabled: providerMonitors.enabled,
      intervalMinutes: providerMonitors.intervalMinutes,
      timeoutSeconds: providerMonitors.timeoutSeconds,
      lastRunAt: providerMonitors.lastRunAt,
      nextRunAt: providerMonitors.nextRunAt,
      lastStatus: providerMonitors.lastStatus,
      lastError: providerMonitors.lastError,
      updatedAt: providerMonitors.updatedAt,
      mappedOfferCount: sql<number>`(
        select count(*)::int
        from "server_offers" mapped_offers
        where mapped_offers."providerId" = ${providerMonitors.providerId}
          and mapped_offers."offerKind" = 'promotion'
          and mapped_offers."externalProductId" is not null
      )`,
    })
    .from(providerMonitors)
    .innerJoin(
      affServiceProviders,
      eq(providerMonitors.providerId, affServiceProviders.id),
    )
    .orderBy(desc(providerMonitors.enabled), asc(affServiceProviders.name));
}

export type ProviderMonitorMutationInput = {
  providerId: number;
  name: string;
  endpointUrl: string;
  config: JsonMonitorConfig;
  enabled: boolean;
  intervalMinutes: number;
  timeoutSeconds: number;
};

export async function createProviderMonitor(
  input: ProviderMonitorMutationInput,
) {
  const now = new Date();
  const [created] = await db
    .insert(providerMonitors)
    .values({
      ...input,
      adapter: "json",
      nextRunAt: input.enabled ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: providerMonitors.id });

  if (!created) throw new Error("库存监控配置创建失败");
  if (input.enabled) await enqueueProviderMonitorTask(created.id, now);
  return created;
}

export async function updateProviderMonitor(
  id: number,
  input: ProviderMonitorMutationInput,
) {
  const now = new Date();
  const [updated] = await db
    .update(providerMonitors)
    .set({
      ...input,
      adapter: "json",
      nextRunAt: input.enabled ? now : null,
      updatedAt: now,
    })
    .where(eq(providerMonitors.id, id))
    .returning({ id: providerMonitors.id });

  if (!updated) throw new Error("库存监控配置不存在");
  if (input.enabled) {
    await enqueueProviderMonitorTask(id, now);
  } else {
    await cancelQueuedProviderMonitorJobs(id);
  }
  return updated;
}

async function cancelQueuedProviderMonitorJobs(monitorId: number) {
  const now = new Date();
  await db
    .update(adminBackgroundJobs)
    .set({
      status: "cancelled",
      lastError: "库存监控已停用",
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(adminBackgroundJobs.jobKey, `provider-monitor:${monitorId}`),
        eq(adminBackgroundJobs.status, "queued"),
      ),
    );
}

export async function deleteProviderMonitor(id: number) {
  const [running] = await db
    .select({ id: adminBackgroundJobs.id })
    .from(adminBackgroundJobs)
    .where(
      and(
        eq(adminBackgroundJobs.jobKey, `provider-monitor:${id}`),
        eq(adminBackgroundJobs.status, "running"),
      ),
    )
    .limit(1);
  if (running) throw new Error("监控正在执行，请等待本次检测结束后再删除");

  await cancelQueuedProviderMonitorJobs(id);
  const [deleted] = await db
    .delete(providerMonitors)
    .where(eq(providerMonitors.id, id))
    .returning({ id: providerMonitors.id });
  if (!deleted) throw new Error("库存监控配置不存在");
  return deleted;
}

export async function getProviderMonitorCheckHistory(
  monitorId?: number,
  limit = 80,
) {
  return db
    .select({
      id: serverOfferChecks.id,
      monitorId: serverOfferChecks.monitorId,
      offerId: serverOfferChecks.offerId,
      offerTitle: serverOffers.title,
      providerName: affServiceProviders.name,
      status: serverOfferChecks.status,
      available: serverOfferChecks.available,
      priceAmount: serverOfferChecks.priceAmount,
      currency: serverOfferChecks.currency,
      responseTimeMs: serverOfferChecks.responseTimeMs,
      error: serverOfferChecks.error,
      checkedAt: serverOfferChecks.checkedAt,
    })
    .from(serverOfferChecks)
    .innerJoin(serverOffers, eq(serverOfferChecks.offerId, serverOffers.id))
    .leftJoin(
      affServiceProviders,
      eq(serverOffers.providerId, affServiceProviders.id),
    )
    .where(
      and(
        eq(serverOffers.offerKind, "promotion"),
        monitorId && Number.isInteger(monitorId)
          ? eq(serverOfferChecks.monitorId, monitorId)
          : undefined,
      ),
    )
    .orderBy(desc(serverOfferChecks.checkedAt), desc(serverOfferChecks.id))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function getProviderOptionsForMonitoring() {
  return db
    .select({ id: affServiceProviders.id, name: affServiceProviders.name })
    .from(affServiceProviders)
    .orderBy(asc(affServiceProviders.name));
}

export async function getDueProviderMonitorIds(now = new Date()) {
  return db
    .select({ id: providerMonitors.id })
    .from(providerMonitors)
    .where(
      and(
        eq(providerMonitors.enabled, true),
        or(
          isNull(providerMonitors.nextRunAt),
          lte(providerMonitors.nextRunAt, now),
        ),
      ),
    );
}
