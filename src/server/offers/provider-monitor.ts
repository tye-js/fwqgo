import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import {
  acquireAdminBackgroundJobCoordinationLock,
  enqueueAdminBackgroundJobInTransaction,
  runWithCurrentAdminBackgroundJobTerminalState,
  wakeAdminBackgroundJobWorkerForRegisteredKeys,
  type AdminBackgroundJobTransaction,
  type BackgroundJobContext,
  type BackgroundJobInput,
} from "@/server/admin/background-jobs";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import { fetchPublicHttpUrl } from "@fwqgo/core/network-url";
import {
  boundOffsetPaginationByTotal,
  normalizeOffsetPagination,
} from "@fwqgo/core/pagination";
import { getProviderMonitorSuccessSchedule } from "@fwqgo/core/provider-catalog-discovery";
import {
  getProviderMonitorCheckRetentionCutoff,
  parseProviderMonitorConfig,
  type AffiliateLinkMonitorConfig,
  type ProviderMonitorConfig,
  type ProviderSourceAdapter,
  type ProviderSourcePurpose,
} from "@fwqgo/core/provider-monitor-config";
import { db } from "@fwqgo/db";
import {
  adminBackgroundJobs,
  affServiceProviders,
  affiliateLinks,
  outboundLinks,
  providerOfferCandidates,
  providerMonitorRuns,
  providerMonitors,
  serverOfferChecks,
  serverOffers,
} from "@fwqgo/db/schema";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  assertProviderMonitorRunOwnership,
  markMissingProviderOffers,
  ProviderMonitorRunSupersededError,
  syncProviderOfferCandidate,
  type ProviderSyncContext,
} from "@/server/offers/provider-offer-sync";
import {
  hashProviderMonitorSyncConfig,
  hashProviderOfferSyncState,
  buildAffiliateLinkCandidate,
  hashProviderSourceResponse,
  parseAffiliateLinkListingCandidate,
  parseProviderSourcePayload,
  prepareProviderOfferCandidates,
  type ProviderOfferCandidate,
  validateProviderOfferCandidate,
} from "@/server/offers/provider-source-parser";
import {
  enrichWhmcsProductPrices,
  fetchWhmcsProductPage,
} from "@/server/offers/whmcs-product-page";
import { refreshProviderCatalogScanStatus } from "@/server/providers/provider-catalog-scan-status";
import {
  maskProviderMonitorSecrets,
  mergeMaskedProviderMonitorSecrets,
  prepareProviderMonitorSecrets,
  resolveProviderMonitorSecrets,
} from "@/server/offers/provider-monitor-secrets";

const MAX_MONITOR_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_MONITOR_ITEMS = 5_000;
const MAX_WHMCS_PRODUCT_DETAILS = 200;

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

function isAffiliateHtmlListingConfig(
  config: ProviderMonitorConfig,
): config is AffiliateLinkMonitorConfig {
  return "collection" in config && config.collection.type === "html_listing";
}

async function completeProviderMonitorRun(input: {
  monitorId: number;
  runId: number;
  checkedAt: Date;
  runGeneration: number;
  monitorValues: Partial<typeof providerMonitors.$inferInsert>;
  runValues: Partial<typeof providerMonitorRuns.$inferInsert>;
}) {
  try {
    await db.transaction(async (tx) => {
      const [updatedMonitor] = await tx
        .update(providerMonitors)
        .set(input.monitorValues)
        .where(
          and(
            eq(providerMonitors.id, input.monitorId),
            eq(providerMonitors.enabled, true),
            eq(providerMonitors.lastStatus, "running"),
            eq(providerMonitors.lastRunAt, input.checkedAt),
            eq(providerMonitors.runGeneration, input.runGeneration),
          ),
        )
        .returning({ id: providerMonitors.id });

      if (!updatedMonitor) throw new ProviderMonitorRunSupersededError();

      const [updatedRun] = await tx
        .update(providerMonitorRuns)
        .set(input.runValues)
        .where(
          and(
            eq(providerMonitorRuns.id, input.runId),
            eq(providerMonitorRuns.status, "running"),
          ),
        )
        .returning({ id: providerMonitorRuns.id });

      if (!updatedRun) throw new ProviderMonitorRunSupersededError();
    });
    return true;
  } catch (error) {
    if (error instanceof ProviderMonitorRunSupersededError) return false;
    throw error;
  }
}

async function pruneProviderMonitorCheckHistory(referenceTime: Date) {
  const cutoff = getProviderMonitorCheckRetentionCutoff(referenceTime);
  await db
    .delete(serverOfferChecks)
    .where(lt(serverOfferChecks.checkedAt, cutoff));
}

async function safelyPruneProviderMonitorCheckHistory(referenceTime: Date) {
  try {
    await pruneProviderMonitorCheckHistory(referenceTime);
  } catch (error) {
    console.error("清理过期库存探测记录失败:", error);
  }
}

function scheduleProviderOfferChanges() {
  schedulePublicWebCache("offer.changed", {
    topicSlugs: ["hong-kong", "united-states", "cheap-vps"],
  });
}

export type ProviderMonitorRunSummary = {
  monitorId: number;
  runId: number | null;
  providerName: string;
  received: number;
  created: number;
  pending: number;
  updated: number;
  unchanged: number;
  skipped: number;
  missing: number;
  rejectionReasons: Record<string, number>;
  configHash: string | null;
  checkedAt: string;
};

function createSupersededProviderMonitorRunSummary(input: {
  monitorId: number;
  runId: number;
  providerName: string;
  configHash: string;
  checkedAt: Date;
}): ProviderMonitorRunSummary {
  return {
    monitorId: input.monitorId,
    runId: input.runId,
    providerName: input.providerName,
    received: 0,
    created: 0,
    pending: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    missing: 0,
    rejectionReasons: {},
    configHash: input.configHash,
    checkedAt: input.checkedAt.toISOString(),
  };
}

async function markProviderMonitorRunSuperseded(
  runId: number,
  finishedAt: Date,
) {
  await db
    .update(providerMonitorRuns)
    .set({
      status: "failed",
      errorTitle: "采集运行被接管",
      errorDetail: "采集源已停用，或更新的运行已接管该采集源",
      finishedAt,
    })
    .where(
      and(
        eq(providerMonitorRuns.id, runId),
        eq(providerMonitorRuns.status, "running"),
      ),
    );
}

export async function runProviderMonitor(
  monitorId: number,
): Promise<ProviderMonitorRunSummary> {
  const [monitor] = await db
    .select({
      id: providerMonitors.id,
      providerId: providerMonitors.providerId,
      name: providerMonitors.name,
      adapter: providerMonitors.adapter,
      purpose: providerMonitors.purpose,
      scheduleMode: providerMonitors.scheduleMode,
      discoveredByScanId: providerMonitors.discoveredByScanId,
      affiliateLinkId: providerMonitors.affiliateLinkId,
      endpointUrl: providerMonitors.endpointUrl,
      config: providerMonitors.config,
      enabled: providerMonitors.enabled,
      autoPublish: providerMonitors.autoPublish,
      missingThreshold: providerMonitors.missingThreshold,
      intervalMinutes: providerMonitors.intervalMinutes,
      timeoutSeconds: providerMonitors.timeoutSeconds,
      etag: providerMonitors.etag,
      lastModified: providerMonitors.lastModified,
      responseHash: providerMonitors.responseHash,
      lastSummary: providerMonitors.lastSummary,
      runGeneration: providerMonitors.runGeneration,
      providerName: affServiceProviders.name,
      providerSlug: affServiceProviders.slug,
      offerAffUrl: affServiceProviders.offerAffUrl,
      offerAffParam: affServiceProviders.offerAffParam,
      offerAffValue: affServiceProviders.offerAffValue,
      offerAffiliateMode: affServiceProviders.offerAffiliateMode,
      offerAffiliateProductParam:
        affServiceProviders.offerAffiliateProductParam,
      defaultPromoCode: affServiceProviders.defaultPromoCode,
      affiliateExternalProductId: affiliateLinks.externalProductId,
      affiliateTargetUrl: affiliateLinks.affiliateTargetUrl,
      affiliateSourceUrl: affiliateLinks.sourceUrl,
      affiliateEnabled: affiliateLinks.enabled,
      outboundSlug: outboundLinks.slug,
    })
    .from(providerMonitors)
    .innerJoin(
      affServiceProviders,
      eq(providerMonitors.providerId, affServiceProviders.id),
    )
    .leftJoin(
      affiliateLinks,
      eq(providerMonitors.affiliateLinkId, affiliateLinks.id),
    )
    .leftJoin(
      outboundLinks,
      eq(affiliateLinks.outboundLinkId, outboundLinks.id),
    )
    .where(eq(providerMonitors.id, monitorId))
    .limit(1);

  if (!monitor) throw new Error("供应商采集源不存在");
  if (!monitor.enabled) {
    return {
      monitorId: monitor.id,
      runId: null,
      providerName: monitor.providerName,
      received: 0,
      created: 0,
      pending: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      missing: 0,
      rejectionReasons: {},
      configHash: null,
      checkedAt: new Date().toISOString(),
    };
  }

  const adapter = monitor.adapter as ProviderSourceAdapter;
  const parsedConfig = parseProviderMonitorConfig(monitor.config, adapter);
  const resolvedSecrets = resolveProviderMonitorSecrets(parsedConfig);
  const config = resolvedSecrets.config;
  const affiliateHtmlListing =
    adapter === "affiliate_link" && isAffiliateHtmlListingConfig(config);
  const bypassesResponseCache =
    adapter === "whmcs" || adapter === "affiliate_link";
  const enrichesWhmcsProductDetails =
    adapter === "whmcs" ||
    (adapter === "affiliate_link" && !affiliateHtmlListing);
  if (resolvedSecrets.needsMigration) {
    const [migratedMonitor] = await db
      .update(providerMonitors)
      .set({ config: resolvedSecrets.storageConfig })
      .where(
        and(
          eq(providerMonitors.id, monitor.id),
          eq(providerMonitors.runGeneration, monitor.runGeneration),
        ),
      )
      .returning({ id: providerMonitors.id });
    if (!migratedMonitor) throw new ProviderMonitorRunSupersededError();
  }
  const context: ProviderSyncContext = {
    monitorId: monitor.id,
    scanId: monitor.scheduleMode === "once" ? monitor.discoveredByScanId : null,
    providerId: monitor.providerId,
    providerName: monitor.providerName,
    providerSlug: monitor.providerSlug,
    purpose: monitor.purpose,
    autoPublish: monitor.autoPublish,
    missingThreshold: monitor.missingThreshold,
    offerAffUrl: monitor.offerAffUrl,
    offerAffParam: monitor.offerAffParam,
    offerAffValue: monitor.offerAffValue,
    offerAffiliateMode: monitor.offerAffiliateMode,
    offerAffiliateProductParam: monitor.offerAffiliateProductParam,
    defaultPromoCode: monitor.defaultPromoCode,
    preservePurchaseUrl: adapter === "affiliate_link",
  };
  const configHash = hashProviderMonitorSyncConfig({
    adapter,
    config,
    affiliate: {
      offerAffUrl: monitor.offerAffUrl,
      offerAffParam: monitor.offerAffParam,
      offerAffValue: monitor.offerAffValue,
      offerAffiliateMode: monitor.offerAffiliateMode,
      offerAffiliateProductParam: monitor.offerAffiliateProductParam,
    },
    behavior: {
      purpose: monitor.purpose,
      autoPublish: monitor.autoPublish,
      missingThreshold: monitor.missingThreshold,
      defaultPromoCode: monitor.defaultPromoCode,
      preservePurchaseUrl: adapter === "affiliate_link",
    },
  });
  const previousConfigHash =
    typeof monitor.lastSummary?.configHash === "string"
      ? monitor.lastSummary.configHash
      : null;
  const configUnchanged = previousConfigHash === configHash;
  const startedAt = Date.now();
  const checkedAt = new Date();
  const nextRunAt = new Date(
    checkedAt.getTime() + monitor.intervalMinutes * 60_000,
  );
  let responseStatus: number | null = null;

  const run = await db.transaction(async (tx) => {
    const [claimedMonitor] = await tx
      .update(providerMonitors)
      .set({
        lastStatus: "running",
        lastError: null,
        lastRunAt: checkedAt,
        updatedAt: checkedAt,
      })
      .where(
        and(
          eq(providerMonitors.id, monitor.id),
          eq(providerMonitors.enabled, true),
          eq(providerMonitors.runGeneration, monitor.runGeneration),
        ),
      )
      .returning({ id: providerMonitors.id });
    if (!claimedMonitor) return null;

    await tx
      .update(providerMonitorRuns)
      .set({
        status: "failed",
        errorTitle: "采集运行被中断",
        errorDetail: "进程重启或 worker 心跳超时，后续运行已接管该采集源",
        finishedAt: checkedAt,
      })
      .where(
        and(
          eq(providerMonitorRuns.monitorId, monitor.id),
          eq(providerMonitorRuns.status, "running"),
        ),
      );
    const [createdRun] = await tx
      .insert(providerMonitorRuns)
      .values({
        monitorId: monitor.id,
        scanId: context.scanId,
        runMode: monitor.scheduleMode,
        status: "running",
        startedAt: checkedAt,
      })
      .returning({ id: providerMonitorRuns.id });
    if (!createdRun) throw new Error("供应商采集运行记录创建失败");
    return createdRun;
  });
  if (!run) {
    return {
      monitorId: monitor.id,
      runId: null,
      providerName: monitor.providerName,
      received: 0,
      created: 0,
      pending: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      missing: 0,
      rejectionReasons: {},
      configHash: null,
      checkedAt: checkedAt.toISOString(),
    };
  }
  const ownership = {
    monitorId: monitor.id,
    checkedAt,
    runGeneration: monitor.runGeneration,
  };

  try {
    let responseStatusCode: number;
    let responseStatusText: string;
    let responseHeaders: Headers;
    let text: string;
    let initialCandidates: ProviderOfferCandidate[] | null = null;
    let prefetchedProductPage: Awaited<
      ReturnType<typeof fetchWhmcsProductPage>
    > | null = null;
    let affiliateCollectionUrl: string | null = null;

    if (adapter === "affiliate_link") {
      if (
        !monitor.affiliateLinkId ||
        !monitor.affiliateEnabled ||
        !monitor.affiliateExternalProductId ||
        !monitor.affiliateTargetUrl ||
        !monitor.outboundSlug
      ) {
        throw new Error("完整返利链接采集源缺少有效的套餐返利链接记录");
      }
      const affiliateConfig = config as AffiliateLinkMonitorConfig;
      if (affiliateHtmlListing) {
        if (!monitor.affiliateSourceUrl) {
          throw new Error("HTML 套餐列表模式必须填写独立采集地址");
        }
        affiliateCollectionUrl = monitor.affiliateSourceUrl;
        const response = await fetchPublicHttpUrl(
          affiliateCollectionUrl,
          {
            headers: {
              Accept: "text/html,application/xhtml+xml",
              ...affiliateConfig.headers,
            },
            maxRedirects: 0,
            signal: AbortSignal.timeout(monitor.timeoutSeconds * 1_000),
          },
          "供应商公开采集地址",
        );
        responseStatusCode = response.status;
        responseStatusText = response.statusText;
        responseHeaders = response.headers;
        const responseText = await readResponseTextWithLimit(
          response,
          MAX_MONITOR_RESPONSE_BYTES,
        );
        if (responseText === null) {
          throw new Error("供应商响应超过 8 MB 限制");
        }
        text = responseText;
      } else {
        affiliateCollectionUrl =
          monitor.affiliateSourceUrl ?? monitor.affiliateTargetUrl;
        const candidate = buildAffiliateLinkCandidate({
          externalProductId: monitor.affiliateExternalProductId,
          affiliateTargetUrl: monitor.affiliateTargetUrl,
          purchaseUrl: `/go/${monitor.outboundSlug}`,
          sourceUrl: affiliateCollectionUrl,
          config: affiliateConfig,
        });
        const productPage = await fetchWhmcsProductPage({
          url: affiliateCollectionUrl,
          headers: affiliateConfig.headers,
          timeoutMs: monitor.timeoutSeconds * 1_000,
        });
        responseStatusCode = 200;
        responseStatusText = "OK";
        responseHeaders = new Headers();
        text = productPage.body;
        initialCandidates = [candidate];
        prefetchedProductPage = productPage;
      }
    } else {
      const conditionalHeaders: Record<string, string> = {};
      if (!bypassesResponseCache && configUnchanged && monitor.etag) {
        conditionalHeaders["If-None-Match"] = monitor.etag;
      }
      if (!bypassesResponseCache && configUnchanged && monitor.lastModified) {
        conditionalHeaders["If-Modified-Since"] = monitor.lastModified;
      }
      const response = await fetchPublicHttpUrl(
        monitor.endpointUrl,
        {
          headers: {
            Accept:
              adapter === "json"
                ? "application/json"
                : "text/html,application/xhtml+xml",
            ...conditionalHeaders,
            ...config.headers,
          },
          maxRedirects: 0,
          signal: AbortSignal.timeout(monitor.timeoutSeconds * 1_000),
        },
        "供应商采集地址",
      );
      responseStatusCode = response.status;
      responseStatusText = response.statusText;
      responseHeaders = response.headers;
      if (response.status === 304) {
        text = "";
      } else {
        const responseText = await readResponseTextWithLimit(
          response,
          MAX_MONITOR_RESPONSE_BYTES,
        );
        if (responseText === null) {
          throw new Error("供应商响应超过 8 MB 限制");
        }
        text = responseText;
      }
    }
    responseStatus = responseStatusCode;
    if (responseStatusCode === 304 && !configUnchanged) {
      throw new Error("供应商网站在采集配置变化后错误返回 304");
    }
    if (
      (responseStatusCode < 200 || responseStatusCode >= 300) &&
      responseStatusCode !== 304
    ) {
      throw new Error(
        `供应商网站返回 HTTP ${responseStatusCode} ${responseStatusText}`,
      );
    }
    if (
      affiliateHtmlListing &&
      affiliateCollectionUrl &&
      monitor.affiliateExternalProductId &&
      monitor.affiliateTargetUrl &&
      monitor.outboundSlug
    ) {
      initialCandidates = [
        parseAffiliateLinkListingCandidate({
          body: text,
          sourceUrl: affiliateCollectionUrl,
          affiliateTargetUrl: monitor.affiliateTargetUrl,
          externalProductId: monitor.affiliateExternalProductId,
          purchaseUrl: `/go/${monitor.outboundSlug}`,
          config,
        }),
      ];
    }
    const responseHash = text
      ? hashProviderSourceResponse(text)
      : monitor.responseHash;
    const notModified =
      !bypassesResponseCache &&
      (responseStatusCode === 304 ||
        Boolean(
          configUnchanged &&
          responseHash &&
          responseHash === monitor.responseHash,
        ));

    if (notModified) {
      const refreshed = await db.transaction(async (tx) => {
        await assertProviderMonitorRunOwnership(ownership, tx);
        const rows = await tx
          .update(serverOffers)
          .set({
            sourceLastSeenAt: checkedAt,
            missingRuns: 0,
            lastCheckedAt: checkedAt,
            checkStatus: "ok",
          })
          .where(eq(serverOffers.sourceMonitorId, monitor.id))
          .returning({ id: serverOffers.id });
        if (rows.length === 0) {
          await tx
            .update(providerMonitors)
            .set({
              etag: null,
              lastModified: null,
              responseHash: null,
              lastSummary: null,
              updatedAt: checkedAt,
            })
            .where(eq(providerMonitors.id, monitor.id));
        }
        return rows;
      });
      if (refreshed.length === 0) {
        throw new Error(
          "供应商返回未变化，但本地没有套餐；已清除缓存，下次采集将重新读取完整数据",
        );
      }
      const summary: ProviderMonitorRunSummary = {
        monitorId: monitor.id,
        runId: run.id,
        providerName: monitor.providerName,
        received: 0,
        created: 0,
        pending: 0,
        updated: 0,
        unchanged: refreshed.length,
        skipped: 0,
        missing: 0,
        rejectionReasons: {},
        configHash,
        checkedAt: checkedAt.toISOString(),
      };
      const completed = await completeProviderMonitorRun({
        monitorId: monitor.id,
        runId: run.id,
        checkedAt,
        runGeneration: monitor.runGeneration,
        runValues: {
          status: "succeeded",
          httpStatus: responseStatusCode,
          responseHash,
          unchanged: refreshed.length,
          finishedAt: new Date(),
        },
        monitorValues: {
          lastRunAt: checkedAt,
          ...getProviderMonitorSuccessSchedule(monitor.scheduleMode, nextRunAt),
          lastStatus: "succeeded",
          lastError: null,
          etag: responseHeaders.get("etag") ?? monitor.etag,
          lastModified:
            responseHeaders.get("last-modified") ?? monitor.lastModified,
          responseHash,
          lastSummary: summary,
          updatedAt: checkedAt,
        },
      });
      if (!completed) {
        await markProviderMonitorRunSuperseded(run.id, new Date());
        return summary;
      }
      if (monitor.scheduleMode === "once") {
        if (monitor.discoveredByScanId) {
          await refreshProviderCatalogScanStatus(monitor.discoveredByScanId);
        }
      } else {
        await safelyEnqueueEnabledProviderMonitorTask(monitor.id, nextRunAt);
      }
      return summary;
    }

    let candidates =
      initialCandidates ??
      parseProviderSourcePayload({
        adapter,
        body: text,
        config,
        sourceUrl: monitor.endpointUrl,
      });
    if (candidates.length > MAX_MONITOR_ITEMS) {
      throw new Error(`供应商网站一次返回超过 ${MAX_MONITOR_ITEMS} 个套餐`);
    }
    if (enrichesWhmcsProductDetails) {
      if (candidates.length > MAX_WHMCS_PRODUCT_DETAILS) {
        throw new Error(
          `WHMCS 采集源一次最多读取 ${MAX_WHMCS_PRODUCT_DETAILS} 个产品配置页`,
        );
      }
      const previousRows = await db
        .select({
          externalProductId: providerOfferCandidates.externalProductId,
          normalizedData: providerOfferCandidates.normalizedData,
        })
        .from(providerOfferCandidates)
        .where(eq(providerOfferCandidates.monitorId, monitor.id));
      const previousCandidates = new Map(
        previousRows.map((row) => [
          row.externalProductId,
          row.normalizedData as ProviderOfferCandidate,
        ]),
      );
      const cachedProductPage = prefetchedProductPage;
      const enrichment = await enrichWhmcsProductPrices({
        candidates,
        previousCandidates,
        headers: config.headers,
        timeoutMs: monitor.timeoutSeconds * 1_000,
        fetchProductPage: cachedProductPage
          ? async () => cachedProductPage
          : undefined,
        detailUrlForCandidate:
          adapter === "affiliate_link" && affiliateCollectionUrl
            ? () => affiliateCollectionUrl
            : undefined,
      });
      candidates = enrichment.candidates;
      for (const issue of enrichment.issues) {
        console.warn(
          `WHMCS 套餐 ${issue.externalProductId} 详情价格${issue.kind === "failed" ? "读取失败" : "不可用"}，已保留列表或历史价格：${issue.message}`,
        );
      }
    }
    if (candidates.length === 0) {
      const [existingOffer] = await db
        .select({ id: serverOffers.id })
        .from(serverOffers)
        .where(eq(serverOffers.sourceMonitorId, monitor.id))
        .limit(1);
      if (existingOffer) {
        throw new Error(
          "供应商响应未识别到任何套餐；为避免误停售，已保留现有套餐并暂停本次缺失统计",
        );
      }
    }

    const counters = {
      created: 0,
      pending: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
    };
    const preparedCandidates = prepareProviderOfferCandidates(
      candidates,
      config.requiredSpecCount,
    );
    counters.skipped = preparedCandidates.skipped;
    const checkRows: Array<typeof serverOfferChecks.$inferInsert> = [];
    for (const candidate of preparedCandidates.syncableCandidates) {
      const result = await syncProviderOfferCandidate({
        context,
        candidate,
        sourceHash: hashProviderOfferSyncState(candidate, context),
        now: checkedAt,
        ownership,
      });
      counters[result.outcome] += 1;
      if (result.offerId) {
        const primaryPrice = candidate.prices[0];
        checkRows.push({
          offerId: result.offerId,
          monitorId: monitor.id,
          status: "ok",
          available: candidate.status === "in_stock",
          priceAmount: primaryPrice?.amount ?? null,
          currency: primaryPrice?.currency.trim().toUpperCase() ?? null,
          responseTimeMs: Date.now() - startedAt,
          checkedAt,
        });
      }
    }

    const missing = await markMissingProviderOffers({
      context,
      seenExternalIds: preparedCandidates.seenExternalIds,
      now: checkedAt,
      ownership,
    });
    if (checkRows.length > 0) {
      await db.transaction(async (tx) => {
        await assertProviderMonitorRunOwnership(ownership, tx);
        await tx.insert(serverOfferChecks).values(checkRows);
      });
    }
    const summary: ProviderMonitorRunSummary = {
      monitorId: monitor.id,
      runId: run.id,
      providerName: monitor.providerName,
      received: candidates.length,
      ...counters,
      missing,
      rejectionReasons:
        candidates.length === 0
          ? { 字段映射未匹配到套餐项: 1 }
          : preparedCandidates.rejectionReasons,
      configHash,
      checkedAt: checkedAt.toISOString(),
    };
    const completed = await completeProviderMonitorRun({
      monitorId: monitor.id,
      runId: run.id,
      checkedAt,
      runGeneration: monitor.runGeneration,
      runValues: {
        status: "succeeded",
        httpStatus: responseStatusCode,
        responseHash,
        received: candidates.length,
        ...counters,
        missing,
        finishedAt: new Date(),
      },
      monitorValues: {
        lastRunAt: checkedAt,
        ...getProviderMonitorSuccessSchedule(monitor.scheduleMode, nextRunAt),
        lastStatus: "succeeded",
        lastError: null,
        etag: responseHeaders.get("etag"),
        lastModified: responseHeaders.get("last-modified"),
        responseHash,
        lastSummary: summary,
        updatedAt: checkedAt,
      },
    });
    if (!completed) {
      await markProviderMonitorRunSuperseded(run.id, new Date());
      return summary;
    }
    if (adapter === "affiliate_link" && monitor.affiliateLinkId) {
      await db
        .update(affiliateLinks)
        .set({ verifiedAt: checkedAt, updatedAt: checkedAt })
        .where(
          and(
            eq(affiliateLinks.id, monitor.affiliateLinkId),
            eq(
              affiliateLinks.affiliateTargetUrl,
              monitor.affiliateTargetUrl ?? "",
            ),
          ),
        );
    }
    await safelyPruneProviderMonitorCheckHistory(checkedAt);
    if (counters.created > 0 || counters.updated > 0 || missing > 0) {
      scheduleProviderOfferChanges();
    }
    if (monitor.scheduleMode === "once") {
      if (monitor.discoveredByScanId) {
        await refreshProviderCatalogScanStatus(monitor.discoveredByScanId);
      }
    } else {
      await safelyEnqueueEnabledProviderMonitorTask(monitor.id, nextRunAt);
    }
    return summary;
  } catch (error) {
    const supersededSummary = createSupersededProviderMonitorRunSummary({
      monitorId: monitor.id,
      runId: run.id,
      providerName: monitor.providerName,
      configHash,
      checkedAt,
    });
    if (error instanceof ProviderMonitorRunSupersededError) {
      await markProviderMonitorRunSuperseded(run.id, new Date());
      return supersededSummary;
    }

    const message = truncate(getErrorMessage(error));
    let failedOfferCount = 0;
    try {
      failedOfferCount = await db.transaction(async (tx) => {
        await assertProviderMonitorRunOwnership(ownership, tx);
        const mappedOffers = await tx
          .select({ id: serverOffers.id })
          .from(serverOffers)
          .where(eq(serverOffers.sourceMonitorId, monitor.id))
          .limit(MAX_MONITOR_ITEMS);
        const failedOfferIds = mappedOffers.map((offer) => offer.id);
        if (failedOfferIds.length > 0) {
          await tx
            .update(serverOffers)
            .set({ checkStatus: "failed", lastCheckedAt: checkedAt })
            .where(inArray(serverOffers.id, failedOfferIds));
          await tx.insert(serverOfferChecks).values(
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

        const finishedAt = new Date();
        const [updatedRun] = await tx
          .update(providerMonitorRuns)
          .set({
            status: "failed",
            httpStatus: responseStatus,
            errorTitle: "供应商采集失败",
            errorDetail: message,
            finishedAt,
          })
          .where(
            and(
              eq(providerMonitorRuns.id, run.id),
              eq(providerMonitorRuns.status, "running"),
            ),
          )
          .returning({ id: providerMonitorRuns.id });
        if (!updatedRun) throw new ProviderMonitorRunSupersededError();

        const [updatedMonitor] = await tx
          .update(providerMonitors)
          .set({
            lastRunAt: checkedAt,
            nextRunAt,
            lastStatus: "failed",
            lastError: message,
            updatedAt: checkedAt,
          })
          .where(
            and(
              eq(providerMonitors.id, monitor.id),
              eq(providerMonitors.enabled, true),
              eq(providerMonitors.lastStatus, "running"),
              eq(providerMonitors.lastRunAt, checkedAt),
              eq(providerMonitors.runGeneration, monitor.runGeneration),
            ),
          )
          .returning({ id: providerMonitors.id });
        if (!updatedMonitor) throw new ProviderMonitorRunSupersededError();

        return failedOfferIds.length;
      });
    } catch (recordError) {
      if (recordError instanceof ProviderMonitorRunSupersededError) {
        await markProviderMonitorRunSuperseded(run.id, new Date());
        return supersededSummary;
      }
      console.error("记录供应商采集失败状态时发生错误:", recordError);
    }
    await safelyPruneProviderMonitorCheckHistory(checkedAt);
    if (failedOfferCount > 0) {
      scheduleProviderOfferChanges();
    }
    throw new Error(message);
  }
}

async function reconcileProviderMonitorTerminalFailure(input: {
  monitorId: number;
  job: BackgroundJobContext["job"];
  status: "failed";
  error: unknown;
}) {
  const finishedAt = new Date();
  const message = truncate(getErrorMessage(input.error));
  const result = await runWithCurrentAdminBackgroundJobTerminalState(
    { job: input.job, status: input.status },
    async (tx) => {
      const [monitor] = await tx
        .select({
          enabled: providerMonitors.enabled,
          intervalMinutes: providerMonitors.intervalMinutes,
          scheduleMode: providerMonitors.scheduleMode,
          discoveredByScanId: providerMonitors.discoveredByScanId,
          lastRunAt: providerMonitors.lastRunAt,
          nextRunAt: providerMonitors.nextRunAt,
          lastStatus: providerMonitors.lastStatus,
        })
        .from(providerMonitors)
        .where(eq(providerMonitors.id, input.monitorId))
        .for("update")
        .limit(1);
      if (!monitor?.enabled) return null;

      if (monitor.scheduleMode === "once") {
        await tx
          .update(providerMonitorRuns)
          .set({
            status: "failed",
            errorTitle: "一次性供应商采集失败",
            errorDetail: message,
            finishedAt,
          })
          .where(
            and(
              eq(providerMonitorRuns.monitorId, input.monitorId),
              eq(providerMonitorRuns.status, "running"),
            ),
          );
        await tx
          .update(providerMonitors)
          .set({
            enabled: false,
            nextRunAt: null,
            lastStatus: "failed",
            lastError: message,
            updatedAt: finishedAt,
          })
          .where(eq(providerMonitors.id, input.monitorId));
        return {
          runAfter: null,
          scanId: monitor.discoveredByScanId,
        };
      }

      const [runningRun] = await tx
        .select({ id: providerMonitorRuns.id })
        .from(providerMonitorRuns)
        .where(
          and(
            eq(providerMonitorRuns.monitorId, input.monitorId),
            eq(providerMonitorRuns.status, "running"),
          ),
        )
        .orderBy(
          desc(providerMonitorRuns.startedAt),
          desc(providerMonitorRuns.id),
        )
        .for("update")
        .limit(1);

      let runAfter =
        monitor.nextRunAt ??
        new Date(
          (monitor.lastRunAt ?? finishedAt).getTime() +
            monitor.intervalMinutes * 60_000,
        );
      if (monitor.lastStatus === "running" || runningRun) {
        runAfter = new Date(
          (monitor.lastRunAt ?? finishedAt).getTime() +
            monitor.intervalMinutes * 60_000,
        );
        await tx
          .update(providerMonitorRuns)
          .set({
            status: "failed",
            errorTitle: "供应商采集任务中断",
            errorDetail: message,
            finishedAt,
          })
          .where(
            and(
              eq(providerMonitorRuns.monitorId, input.monitorId),
              eq(providerMonitorRuns.status, "running"),
            ),
          );
        await tx
          .update(providerMonitors)
          .set({
            nextRunAt: runAfter,
            lastStatus: "failed",
            lastError: message,
            updatedAt: finishedAt,
          })
          .where(
            and(
              eq(providerMonitors.id, input.monitorId),
              eq(providerMonitors.enabled, true),
            ),
          );
      }

      return { runAfter, scanId: null };
    },
  );

  if (!result.active || !result.value) return false;
  const { runAfter, scanId } = result.value;
  if (scanId) await refreshProviderCatalogScanStatus(scanId);
  if (runAfter) {
    await safelyEnqueueEnabledProviderMonitorTask(input.monitorId, runAfter);
  }
  return true;
}

export async function enqueueProviderMonitorTask(
  monitorId: number,
  runAfter = new Date(),
) {
  return enqueueEnabledProviderMonitorTask(monitorId, runAfter);
}

function getProviderMonitorBackgroundJobInput(
  monitorId: number,
  runAfter: Date,
): BackgroundJobInput {
  return {
    key: `provider-monitor:${monitorId}`,
    label: `供应商采集 #${monitorId}`,
    payload: { monitorId },
    runAfter,
    maxAttempts: 3,
    run: async () => {
      await runProviderMonitor(monitorId);
    },
    onTerminal: async ({ status, job, error }) => {
      if (status !== "failed") return;
      await reconcileProviderMonitorTerminalFailure({
        monitorId,
        job,
        status,
        error,
      });
    },
  };
}

function enqueueProviderMonitorTaskInTransaction(
  monitorId: number,
  runAfter: Date,
  tx: AdminBackgroundJobTransaction,
) {
  return enqueueAdminBackgroundJobInTransaction(
    getProviderMonitorBackgroundJobInput(monitorId, runAfter),
    tx,
  );
}

function wakeProviderMonitorTask(monitorId: number) {
  wakeAdminBackgroundJobWorkerForRegisteredKeys([
    `provider-monitor:${monitorId}`,
  ]);
}

async function enqueueEnabledProviderMonitorTask(
  monitorId: number,
  runAfter: Date,
) {
  const result = await db.transaction(async (tx) => {
    await acquireAdminBackgroundJobCoordinationLock(tx);
    const [monitor] = await tx
      .select({
        id: providerMonitors.id,
        enabled: providerMonitors.enabled,
      })
      .from(providerMonitors)
      .where(eq(providerMonitors.id, monitorId))
      .for("update")
      .limit(1);
    if (!monitor?.enabled) return null;
    return enqueueProviderMonitorTaskInTransaction(monitorId, runAfter, tx);
  });
  if (!result) return null;
  wakeProviderMonitorTask(monitorId);
  return result.created;
}

async function safelyEnqueueEnabledProviderMonitorTask(
  monitorId: number,
  runAfter: Date,
) {
  try {
    return await enqueueEnabledProviderMonitorTask(monitorId, runAfter);
  } catch (error) {
    console.error("供应商采集下次调度失败，当前采集结果不受影响:", error);
    return null;
  }
}

export async function retryProviderMonitorRun(runId: number) {
  const [run] = await db
    .select({
      monitorId: providerMonitorRuns.monitorId,
      status: providerMonitorRuns.status,
    })
    .from(providerMonitorRuns)
    .where(eq(providerMonitorRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("供应商采集运行记录不存在");
  if (run.status !== "failed") throw new Error("只有失败的采集运行可以重试");
  const enqueued = await enqueueEnabledProviderMonitorTask(
    run.monitorId,
    new Date(),
  );
  if (enqueued === null) {
    throw new Error("采集源已停用，请先在供应商采集页面启用");
  }
  return {
    runId,
    monitorId: run.monitorId,
    queued: enqueued,
    merged: !enqueued,
  };
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
    await enqueueEnabledProviderMonitorTask(
      monitor.id,
      monitor.nextRunAt ?? now,
    );
  }
}

export async function getProviderMonitorList() {
  const rows = await db
    .select({
      id: providerMonitors.id,
      providerId: providerMonitors.providerId,
      providerName: affServiceProviders.name,
      name: providerMonitors.name,
      adapter: providerMonitors.adapter,
      purpose: providerMonitors.purpose,
      scheduleMode: providerMonitors.scheduleMode,
      discoveredByScanId: providerMonitors.discoveredByScanId,
      affiliateLinkId: providerMonitors.affiliateLinkId,
      endpointUrl: providerMonitors.endpointUrl,
      config: providerMonitors.config,
      enabled: providerMonitors.enabled,
      autoPublish: providerMonitors.autoPublish,
      missingThreshold: providerMonitors.missingThreshold,
      intervalMinutes: providerMonitors.intervalMinutes,
      timeoutSeconds: providerMonitors.timeoutSeconds,
      lastRunAt: providerMonitors.lastRunAt,
      nextRunAt: providerMonitors.nextRunAt,
      lastStatus: providerMonitors.lastStatus,
      lastError: providerMonitors.lastError,
      lastSummary: providerMonitors.lastSummary,
      updatedAt: providerMonitors.updatedAt,
      externalProductId: affiliateLinks.externalProductId,
      affiliateTargetUrl: affiliateLinks.affiliateTargetUrl,
      affiliateSourceUrl: affiliateLinks.sourceUrl,
      affiliateNotes: affiliateLinks.notes,
      outboundSlug: outboundLinks.slug,
      mappedOfferCount: sql<number>`(
        select count(*)::int
        from "server_offers" mapped_offers
        where mapped_offers."sourceMonitorId" = ${providerMonitors.id}
      )`,
      pendingCandidateCount: sql<number>`(
        select count(*)::int
        from "provider_offer_candidates" candidates
        where candidates."monitorId" = ${providerMonitors.id}
          and candidates."status" = 'pending'
      )`,
    })
    .from(providerMonitors)
    .innerJoin(
      affServiceProviders,
      eq(providerMonitors.providerId, affServiceProviders.id),
    )
    .leftJoin(
      affiliateLinks,
      eq(providerMonitors.affiliateLinkId, affiliateLinks.id),
    )
    .leftJoin(
      outboundLinks,
      eq(affiliateLinks.outboundLinkId, outboundLinks.id),
    )
    .orderBy(desc(providerMonitors.enabled), asc(affServiceProviders.name));

  return rows.map((row) => ({
    ...row,
    shortPath: row.outboundSlug ? `/go/${row.outboundSlug}` : null,
    config: maskProviderMonitorSecrets(
      parseProviderMonitorConfig(
        row.config,
        row.adapter as ProviderSourceAdapter,
      ),
    ),
  }));
}

export type ProviderMonitorMutationInput = {
  providerId: number;
  name: string;
  adapter: ProviderSourceAdapter;
  purpose: ProviderSourcePurpose;
  endpointUrl: string;
  config: ProviderMonitorConfig;
  enabled: boolean;
  autoPublish: boolean;
  missingThreshold: number;
  intervalMinutes: number;
  timeoutSeconds: number;
  affiliateLink: {
    externalProductId: string;
    affiliateTargetUrl: string;
    sourceUrl: string | null;
    outboundLinkId: number;
    notes: string | null;
  } | null;
};

export async function createProviderMonitor(
  input: ProviderMonitorMutationInput,
) {
  const now = new Date();
  const created = await db.transaction(async (tx) => {
    if (input.enabled) {
      await acquireAdminBackgroundJobCoordinationLock(tx);
    }
    const { affiliateLink, ...monitorInput } = input;
    let affiliateLinkId: number | null = null;
    if (input.adapter === "affiliate_link") {
      if (!affiliateLink) throw new Error("请填写完整返利链接");
      const [savedLink] = await tx
        .insert(affiliateLinks)
        .values({
          providerId: input.providerId,
          ...affiliateLink,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [affiliateLinks.providerId, affiliateLinks.externalProductId],
          set: {
            affiliateTargetUrl: affiliateLink.affiliateTargetUrl,
            sourceUrl: affiliateLink.sourceUrl,
            outboundLinkId: affiliateLink.outboundLinkId,
            enabled: true,
            notes: affiliateLink.notes,
            updatedAt: now,
          },
        })
        .returning({ id: affiliateLinks.id });
      if (!savedLink) throw new Error("套餐返利链接保存失败");
      affiliateLinkId = savedLink.id;
      const [existingOwner] = await tx
        .select({ id: providerMonitors.id })
        .from(providerMonitors)
        .where(eq(providerMonitors.affiliateLinkId, affiliateLinkId))
        .limit(1);
      if (existingOwner) {
        throw new Error("该返利链接已绑定其他采集源，请编辑原采集源");
      }
    }

    const [createdMonitor] = await tx
      .insert(providerMonitors)
      .values({
        ...monitorInput,
        affiliateLinkId,
        scheduleMode: "scheduled",
        config: prepareProviderMonitorSecrets(monitorInput.config),
        nextRunAt: monitorInput.enabled ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: providerMonitors.id });
    if (!createdMonitor) return null;
    if (monitorInput.enabled) {
      await enqueueProviderMonitorTaskInTransaction(createdMonitor.id, now, tx);
    }
    return createdMonitor;
  });

  if (!created) throw new Error("供应商采集源创建失败");
  if (input.enabled) wakeProviderMonitorTask(created.id);
  return { ...created, schedulingFailed: 0, schedulingSkipped: 0 };
}

export async function updateProviderMonitor(
  id: number,
  input: ProviderMonitorMutationInput,
) {
  const { providerId, affiliateLink, ...mutableInput } = input;
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    await acquireAdminBackgroundJobCoordinationLock(tx);
    const [existing] = await tx
      .select({
        providerId: providerMonitors.providerId,
        adapter: providerMonitors.adapter,
        affiliateLinkId: providerMonitors.affiliateLinkId,
        config: providerMonitors.config,
        discoveredByScanId: providerMonitors.discoveredByScanId,
      })
      .from(providerMonitors)
      .where(eq(providerMonitors.id, id))
      .for("update")
      .limit(1);
    if (!existing) throw new Error("供应商采集源不存在");
    if (existing.providerId !== providerId) {
      throw new Error("已有采集源不能更换厂商，请新建采集源");
    }

    const existingConfig = parseProviderMonitorConfig(
      existing.config,
      existing.adapter as ProviderSourceAdapter,
    );
    const preparedConfig = prepareProviderMonitorSecrets(
      input.config,
      existingConfig,
    );
    let affiliateLinkId: number | null = null;
    if (input.adapter === "affiliate_link") {
      if (!affiliateLink) throw new Error("请填写完整返利链接");
      if (existing.affiliateLinkId) {
        const [savedLink] = await tx
          .update(affiliateLinks)
          .set({
            externalProductId: affiliateLink.externalProductId,
            affiliateTargetUrl: affiliateLink.affiliateTargetUrl,
            sourceUrl: affiliateLink.sourceUrl,
            outboundLinkId: affiliateLink.outboundLinkId,
            enabled: true,
            notes: affiliateLink.notes,
            updatedAt: now,
          })
          .where(
            and(
              eq(affiliateLinks.id, existing.affiliateLinkId),
              eq(affiliateLinks.providerId, providerId),
            ),
          )
          .returning({ id: affiliateLinks.id });
        if (!savedLink) throw new Error("套餐返利链接不存在");
        affiliateLinkId = savedLink.id;
      } else {
        const [savedLink] = await tx
          .insert(affiliateLinks)
          .values({
            providerId,
            ...affiliateLink,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              affiliateLinks.providerId,
              affiliateLinks.externalProductId,
            ],
            set: {
              affiliateTargetUrl: affiliateLink.affiliateTargetUrl,
              sourceUrl: affiliateLink.sourceUrl,
              outboundLinkId: affiliateLink.outboundLinkId,
              enabled: true,
              notes: affiliateLink.notes,
              updatedAt: now,
            },
          })
          .returning({ id: affiliateLinks.id });
        if (!savedLink) throw new Error("套餐返利链接保存失败");
        affiliateLinkId = savedLink.id;
      }
      const [existingOwner] = await tx
        .select({ id: providerMonitors.id })
        .from(providerMonitors)
        .where(
          and(
            eq(providerMonitors.affiliateLinkId, affiliateLinkId),
            ne(providerMonitors.id, id),
          ),
        )
        .limit(1);
      if (existingOwner) {
        throw new Error("该返利链接已绑定其他采集源，请编辑原采集源");
      }
    }
    const [result] = await tx
      .update(providerMonitors)
      .set({
        ...mutableInput,
        affiliateLinkId,
        scheduleMode: "scheduled",
        config: preparedConfig,
        nextRunAt: input.enabled ? now : null,
        lastStatus: input.enabled ? undefined : "idle",
        lastError: input.enabled ? undefined : null,
        runGeneration: sql`${providerMonitors.runGeneration} + 1`,
        updatedAt: now,
      })
      .where(eq(providerMonitors.id, id))
      .returning({ id: providerMonitors.id });
    if (result && existing.discoveredByScanId) {
      await refreshProviderCatalogScanStatus(existing.discoveredByScanId, tx);
    }
    if (!result) return null;
    if (input.enabled) {
      await enqueueProviderMonitorTaskInTransaction(id, now, tx);
    } else {
      await cancelQueuedProviderMonitorJobs([id], tx);
    }
    return result;
  });

  if (!updated) throw new Error("供应商采集源不存在");
  if (input.enabled) wakeProviderMonitorTask(id);
  return { ...updated, schedulingFailed: 0, schedulingSkipped: 0 };
}

function normalizeProviderMonitorIds(ids: number[]) {
  return [...new Set(ids)];
}

async function getExistingProviderMonitorRows(ids: number[]) {
  const rows = await db
    .select({
      id: providerMonitors.id,
      enabled: providerMonitors.enabled,
      adapter: providerMonitors.adapter,
      affiliateLinkId: providerMonitors.affiliateLinkId,
    })
    .from(providerMonitors)
    .where(inArray(providerMonitors.id, ids));

  if (rows.length !== ids.length) {
    throw new Error("部分供应商采集源不存在，请刷新页面后重试");
  }
  return rows;
}

async function enqueueEnabledProviderMonitorTasks(
  monitorIds: number[],
  runAfter: Date,
) {
  const results = await Promise.allSettled(
    monitorIds.map((monitorId) =>
      enqueueEnabledProviderMonitorTask(monitorId, runAfter),
    ),
  );
  let created = 0;
  let merged = 0;
  let skipped = 0;
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failed += 1;
      console.error("供应商采集任务批量入队失败:", {
        monitorId: monitorIds[index],
        error: getErrorMessage(result.reason),
      });
      return;
    }
    if (result.value === null) {
      skipped += 1;
    } else if (result.value) {
      created += 1;
    } else {
      merged += 1;
    }
  });

  return { created, merged, skipped, failed };
}

export async function enqueueProviderMonitorTasks(ids: number[]) {
  const monitorIds = normalizeProviderMonitorIds(ids);
  if (monitorIds.length === 0) throw new Error("请至少选择一个供应商采集源");

  const rows = await getExistingProviderMonitorRows(monitorIds);
  const enabledIds = rows
    .filter((monitor) => monitor.enabled)
    .map((monitor) => monitor.id);
  const incompleteAffiliateLink = rows.find(
    (monitor) =>
      monitor.enabled &&
      monitor.adapter === "affiliate_link" &&
      !monitor.affiliateLinkId,
  );
  if (incompleteAffiliateLink) {
    throw new Error("完整返利链接采集源尚未补录链接，请先编辑后再采集");
  }
  if (enabledIds.length === 0) {
    throw new Error("选中的供应商采集源均已停用，请先启用后再采集");
  }

  const result = await enqueueEnabledProviderMonitorTasks(
    enabledIds,
    new Date(),
  );
  const scheduled = result.created + result.merged;
  if (scheduled === 0 && result.failed > 0) {
    throw new Error("选中的采集任务均未能加入队列，请稍后重试");
  }
  if (scheduled === 0) {
    throw new Error("选中的供应商采集源均已停用，请先启用后再采集");
  }
  return {
    queued: result.created,
    merged: result.merged,
    skipped: monitorIds.length - enabledIds.length + result.skipped,
    failed: result.failed,
  };
}

export async function updateProviderMonitorsEnabled(
  ids: number[],
  enabled: boolean,
) {
  const monitorIds = normalizeProviderMonitorIds(ids);
  if (monitorIds.length === 0) throw new Error("请至少选择一个供应商采集源");

  const now = new Date();
  const changedIds = await db.transaction(async (tx) => {
    await acquireAdminBackgroundJobCoordinationLock(tx);
    const rows = await tx
      .select({
        id: providerMonitors.id,
        enabled: providerMonitors.enabled,
        adapter: providerMonitors.adapter,
        affiliateLinkId: providerMonitors.affiliateLinkId,
      })
      .from(providerMonitors)
      .where(inArray(providerMonitors.id, monitorIds))
      .for("update");
    if (rows.length !== monitorIds.length) {
      throw new Error("部分供应商采集源不存在，请刷新页面后重试");
    }
    if (
      enabled &&
      rows.some(
        (monitor) =>
          monitor.adapter === "affiliate_link" && !monitor.affiliateLinkId,
      )
    ) {
      throw new Error("完整返利链接采集源尚未补录链接，请先编辑后再启用");
    }

    const changed = rows
      .filter((monitor) => monitor.enabled !== enabled)
      .map((monitor) => monitor.id);
    if (changed.length > 0) {
      const updated = await tx
        .update(providerMonitors)
        .set({
          enabled,
          nextRunAt: enabled ? now : null,
          ...(enabled ? {} : { lastStatus: "idle" as const, lastError: null }),
          runGeneration: sql`${providerMonitors.runGeneration} + 1`,
          updatedAt: now,
        })
        .where(inArray(providerMonitors.id, changed))
        .returning({ id: providerMonitors.id });
      if (updated.length !== changed.length) {
        throw new Error("部分供应商采集源状态更新失败，请刷新页面后重试");
      }
    }

    if (enabled) {
      for (const monitorId of changed) {
        await enqueueProviderMonitorTaskInTransaction(monitorId, now, tx);
      }
    } else {
      await cancelQueuedProviderMonitorJobs(monitorIds, tx);
    }
    return changed;
  });
  if (changedIds.length === 0) {
    return {
      updated: 0,
      unchanged: monitorIds.length,
      enabled,
      schedulingFailed: 0,
      schedulingSkipped: 0,
    };
  }

  if (enabled) {
    wakeAdminBackgroundJobWorkerForRegisteredKeys(
      changedIds.map((monitorId) => `provider-monitor:${monitorId}`),
    );
  }

  return {
    updated: changedIds.length,
    unchanged: monitorIds.length - changedIds.length,
    enabled,
    schedulingFailed: 0,
    schedulingSkipped: 0,
  };
}

async function cancelQueuedProviderMonitorJobs(
  monitorIds: number[],
  tx: AdminBackgroundJobTransaction,
) {
  if (monitorIds.length === 0) return;
  const now = new Date();
  const jobKeys = monitorIds.map(
    (monitorId) => `provider-monitor:${monitorId}`,
  );
  await tx
    .update(adminBackgroundJobs)
    .set({
      status: "cancelled",
      lastError: "供应商采集源已停用",
      finishedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(adminBackgroundJobs.jobKey, jobKeys),
        eq(adminBackgroundJobs.status, "queued"),
      ),
    );
}

export async function deleteProviderMonitors(ids: number[]) {
  const monitorIds = normalizeProviderMonitorIds(ids);
  if (monitorIds.length === 0) throw new Error("请至少选择一个供应商采集源");

  return db.transaction(async (tx) => {
    const now = new Date();
    const existing = await tx
      .select({
        id: providerMonitors.id,
        discoveredByScanId: providerMonitors.discoveredByScanId,
      })
      .from(providerMonitors)
      .where(inArray(providerMonitors.id, monitorIds))
      .for("update");
    if (existing.length !== monitorIds.length) {
      throw new Error("部分供应商采集源不存在，请刷新页面后重试");
    }

    const jobKeys = monitorIds.map((id) => `provider-monitor:${id}`);

    await tx
      .update(adminBackgroundJobs)
      .set({
        status: "cancelled",
        lastError: "供应商采集源已删除",
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(adminBackgroundJobs.jobKey, jobKeys),
          eq(adminBackgroundJobs.status, "queued"),
        ),
      );

    const [runningJob] = await tx
      .select({ id: adminBackgroundJobs.id })
      .from(adminBackgroundJobs)
      .where(
        and(
          inArray(adminBackgroundJobs.jobKey, jobKeys),
          eq(adminBackgroundJobs.status, "running"),
        ),
      )
      .limit(1);
    const [runningRun] = await tx
      .select({ id: providerMonitorRuns.id })
      .from(providerMonitorRuns)
      .where(
        and(
          inArray(providerMonitorRuns.monitorId, monitorIds),
          eq(providerMonitorRuns.status, "running"),
        ),
      )
      .limit(1);
    if (runningJob || runningRun) {
      throw new Error("采集正在执行，请等待本次执行结束后再删除");
    }

    const deleted = await tx
      .delete(providerMonitors)
      .where(inArray(providerMonitors.id, monitorIds))
      .returning({ id: providerMonitors.id });
    if (deleted.length !== monitorIds.length) {
      throw new Error("部分供应商采集源删除失败，请刷新页面后重试");
    }
    const scanIds = [
      ...new Set(
        existing.flatMap((monitor) =>
          monitor.discoveredByScanId ? [monitor.discoveredByScanId] : [],
        ),
      ),
    ];
    for (const scanId of scanIds) {
      await refreshProviderCatalogScanStatus(scanId, tx);
    }
    return { deleted: deleted.length, ids: deleted.map((row) => row.id) };
  });
}

export async function deleteProviderMonitor(id: number) {
  const result = await deleteProviderMonitors([id]);
  const deletedId = result.ids[0];
  if (!deletedId) throw new Error("供应商采集源不存在");
  return { id: deletedId };
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
      monitorId && Number.isInteger(monitorId)
        ? eq(serverOfferChecks.monitorId, monitorId)
        : undefined,
    )
    .orderBy(desc(serverOfferChecks.checkedAt), desc(serverOfferChecks.id))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function getProviderOptionsForMonitoring() {
  return db
    .select({
      id: affServiceProviders.id,
      name: affServiceProviders.name,
      slug: affServiceProviders.slug,
      aliases: affServiceProviders.aliases,
      officialUrl: affServiceProviders.officialUrl,
      offerAffUrl: affServiceProviders.offerAffUrl,
    })
    .from(affServiceProviders)
    .orderBy(asc(affServiceProviders.name));
}

export async function getProviderMonitorRunHistory(
  monitorId?: number,
  limit = 80,
) {
  return db
    .select({
      id: providerMonitorRuns.id,
      monitorId: providerMonitorRuns.monitorId,
      monitorName: providerMonitors.name,
      providerName: affServiceProviders.name,
      status: providerMonitorRuns.status,
      scanId: providerMonitorRuns.scanId,
      runMode: providerMonitorRuns.runMode,
      httpStatus: providerMonitorRuns.httpStatus,
      received: providerMonitorRuns.received,
      created: providerMonitorRuns.created,
      pending: providerMonitorRuns.pending,
      updated: providerMonitorRuns.updated,
      unchanged: providerMonitorRuns.unchanged,
      skipped: providerMonitorRuns.skipped,
      missing: providerMonitorRuns.missing,
      errorTitle: providerMonitorRuns.errorTitle,
      errorDetail: providerMonitorRuns.errorDetail,
      startedAt: providerMonitorRuns.startedAt,
      finishedAt: providerMonitorRuns.finishedAt,
    })
    .from(providerMonitorRuns)
    .innerJoin(
      providerMonitors,
      eq(providerMonitorRuns.monitorId, providerMonitors.id),
    )
    .innerJoin(
      affServiceProviders,
      eq(providerMonitors.providerId, affServiceProviders.id),
    )
    .where(
      monitorId && Number.isInteger(monitorId)
        ? eq(providerMonitorRuns.monitorId, monitorId)
        : undefined,
    )
    .orderBy(desc(providerMonitorRuns.startedAt), desc(providerMonitorRuns.id))
    .limit(Math.min(Math.max(limit, 1), 200));
}

type ProviderOfferCandidateStatus =
  "pending" | "accepted" | "rejected" | "superseded" | "all";

type ProviderMonitorQueryExecutor = typeof db | AdminBackgroundJobTransaction;

export async function getProviderOfferCandidateList(
  status: ProviderOfferCandidateStatus = "pending",
  limit = 100,
  offset = 0,
  executor: ProviderMonitorQueryExecutor = db,
) {
  const normalizedLimit = Number.isSafeInteger(limit)
    ? Math.min(Math.max(limit, 1), 200)
    : 100;
  const normalizedOffset =
    Number.isSafeInteger(offset) && offset > 0 ? offset : 0;

  return executor
    .select({
      id: providerOfferCandidates.id,
      monitorId: providerOfferCandidates.monitorId,
      scanId: providerOfferCandidates.scanId,
      monitorName: providerMonitors.name,
      providerName: affServiceProviders.name,
      externalProductId: providerOfferCandidates.externalProductId,
      sourceUrl: providerOfferCandidates.sourceUrl,
      sourceHash: providerOfferCandidates.sourceHash,
      normalizedData: providerOfferCandidates.normalizedData,
      diff: providerOfferCandidates.diff,
      status: providerOfferCandidates.status,
      offerId: providerOfferCandidates.offerId,
      rejectionReason: providerOfferCandidates.rejectionReason,
      reviewedBy: providerOfferCandidates.reviewedBy,
      reviewedAt: providerOfferCandidates.reviewedAt,
      firstSeenAt: providerOfferCandidates.firstSeenAt,
      lastSeenAt: providerOfferCandidates.lastSeenAt,
    })
    .from(providerOfferCandidates)
    .innerJoin(
      providerMonitors,
      eq(providerOfferCandidates.monitorId, providerMonitors.id),
    )
    .innerJoin(
      affServiceProviders,
      eq(providerOfferCandidates.providerId, affServiceProviders.id),
    )
    .where(
      status === "all" ? undefined : eq(providerOfferCandidates.status, status),
    )
    .orderBy(
      desc(providerOfferCandidates.lastSeenAt),
      desc(providerOfferCandidates.id),
    )
    .limit(normalizedLimit)
    .offset(normalizedOffset);
}

export async function getProviderOfferCandidateCount(
  status: ProviderOfferCandidateStatus = "pending",
  executor: ProviderMonitorQueryExecutor = db,
) {
  const [result] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(providerOfferCandidates)
    .innerJoin(
      providerMonitors,
      eq(providerOfferCandidates.monitorId, providerMonitors.id),
    )
    .innerJoin(
      affServiceProviders,
      eq(providerOfferCandidates.providerId, affServiceProviders.id),
    )
    .where(
      status === "all" ? undefined : eq(providerOfferCandidates.status, status),
    );

  return result?.count ?? 0;
}

export async function getProviderOfferCandidatePage(
  status: ProviderOfferCandidateStatus = "pending",
  pageNo = 1,
  pageSize = 50,
) {
  const requestedPagination = normalizeOffsetPagination({
    pageNo,
    pageSize,
    maxPageSize: 200,
  });

  return db.transaction(
    async (tx) => {
      const totalCount = await getProviderOfferCandidateCount(status, tx);
      const pagination = boundOffsetPaginationByTotal(
        requestedPagination,
        totalCount,
      );
      const candidates = await getProviderOfferCandidateList(
        status,
        pagination.pageSize,
        pagination.offset,
        tx,
      );

      return { candidates, pagination };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function previewProviderMonitorSource(input: {
  monitorId?: number;
  providerId: number;
  adapter: ProviderSourceAdapter;
  endpointUrl: string;
  config: ProviderMonitorConfig;
  timeoutSeconds: number;
  affiliateLink?: {
    externalProductId: string;
    affiliateTargetUrl: string;
    sourceUrl: string | null;
  };
}) {
  const [existing] = input.monitorId
    ? await db
        .select({
          adapter: providerMonitors.adapter,
          config: providerMonitors.config,
        })
        .from(providerMonitors)
        .where(eq(providerMonitors.id, input.monitorId))
        .limit(1)
    : [];
  const existingConfig = existing
    ? parseProviderMonitorConfig(
        existing.config,
        existing.adapter as ProviderSourceAdapter,
      )
    : null;
  const mergedConfig = mergeMaskedProviderMonitorSecrets(
    input.config,
    existingConfig,
  );
  const config = resolveProviderMonitorSecrets(mergedConfig).config;
  const affiliateHtmlListing =
    input.adapter === "affiliate_link" && isAffiliateHtmlListingConfig(config);
  let httpStatus: number;
  let parsedCandidates: ProviderOfferCandidate[];
  let prefetchedProductPage: Awaited<
    ReturnType<typeof fetchWhmcsProductPage>
  > | null = null;

  let affiliateCollectionUrl: string | null = null;
  if (input.adapter === "affiliate_link") {
    if (!input.affiliateLink) throw new Error("请填写完整返利链接");
    const affiliateConfig = config as AffiliateLinkMonitorConfig;
    if (affiliateHtmlListing) {
      if (!input.affiliateLink.sourceUrl) {
        throw new Error("HTML 套餐列表模式必须填写独立采集地址");
      }
      affiliateCollectionUrl = input.affiliateLink.sourceUrl;
      const response = await fetchPublicHttpUrl(
        affiliateCollectionUrl,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            ...affiliateConfig.headers,
          },
          maxRedirects: 0,
          signal: AbortSignal.timeout(input.timeoutSeconds * 1_000),
        },
        "供应商公开采集地址",
      );
      if (!response.ok) {
        throw new Error(
          `供应商网站返回 HTTP ${response.status} ${response.statusText}`,
        );
      }
      const body = await readResponseTextWithLimit(
        response,
        MAX_MONITOR_RESPONSE_BYTES,
      );
      if (body === null) throw new Error("供应商响应超过 8 MB 限制");
      httpStatus = response.status;
      parsedCandidates = [
        parseAffiliateLinkListingCandidate({
          body,
          sourceUrl: affiliateCollectionUrl,
          affiliateTargetUrl: input.affiliateLink.affiliateTargetUrl,
          externalProductId: input.affiliateLink.externalProductId,
          purchaseUrl: input.affiliateLink.affiliateTargetUrl,
          config: affiliateConfig,
        }),
      ];
    } else {
      affiliateCollectionUrl =
        input.affiliateLink.sourceUrl ?? input.affiliateLink.affiliateTargetUrl;
      const candidate = buildAffiliateLinkCandidate({
        externalProductId: input.affiliateLink.externalProductId,
        affiliateTargetUrl: input.affiliateLink.affiliateTargetUrl,
        purchaseUrl: input.affiliateLink.affiliateTargetUrl,
        sourceUrl: affiliateCollectionUrl,
        config: affiliateConfig,
      });
      prefetchedProductPage = await fetchWhmcsProductPage({
        url: affiliateCollectionUrl,
        headers: affiliateConfig.headers,
        timeoutMs: input.timeoutSeconds * 1_000,
      });
      httpStatus = 200;
      parsedCandidates = [candidate];
    }
  } else {
    const response = await fetchPublicHttpUrl(
      input.endpointUrl,
      {
        headers: {
          Accept:
            input.adapter === "json"
              ? "application/json"
              : "text/html,application/xhtml+xml",
          ...config.headers,
        },
        maxRedirects: 0,
        signal: AbortSignal.timeout(input.timeoutSeconds * 1_000),
      },
      "供应商采集地址",
    );
    if (!response.ok) {
      throw new Error(
        `供应商网站返回 HTTP ${response.status} ${response.statusText}`,
      );
    }
    const body = await readResponseTextWithLimit(
      response,
      MAX_MONITOR_RESPONSE_BYTES,
    );
    if (body === null) throw new Error("供应商响应超过 8 MB 限制");
    httpStatus = response.status;
    parsedCandidates = parseProviderSourcePayload({
      adapter: input.adapter,
      body,
      config,
      sourceUrl: input.endpointUrl,
    });
  }
  if (parsedCandidates.length > MAX_MONITOR_ITEMS) {
    throw new Error(`供应商网站一次返回超过 ${MAX_MONITOR_ITEMS} 个套餐`);
  }
  let candidates = parsedCandidates.slice(0, 20);
  let detailIssues = 0;
  if (
    input.adapter === "whmcs" ||
    (input.adapter === "affiliate_link" && !affiliateHtmlListing)
  ) {
    const cachedProductPage = prefetchedProductPage;
    const enrichment = await enrichWhmcsProductPrices({
      candidates,
      headers: config.headers,
      timeoutMs: input.timeoutSeconds * 1_000,
      fetchProductPage: cachedProductPage
        ? async () => cachedProductPage
        : undefined,
      detailUrlForCandidate:
        input.adapter === "affiliate_link" && affiliateCollectionUrl
          ? () => affiliateCollectionUrl
          : undefined,
    });
    candidates = enrichment.candidates;
    detailIssues = enrichment.issues.length;
  }
  return {
    httpStatus,
    total: parsedCandidates.length,
    detailIssues,
    items: candidates.map((candidate) => {
      const normalized = Object.fromEntries(
        Object.entries(candidate).filter(([key]) => key !== "raw"),
      ) as Omit<typeof candidate, "raw">;
      return {
        candidate: normalized,
        quality: validateProviderOfferCandidate(
          candidate,
          config.requiredSpecCount,
        ),
      };
    }),
  };
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
