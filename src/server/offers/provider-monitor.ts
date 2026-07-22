import {
  and,
  asc,
  desc,
  eq,
  inArray,
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
  type ProviderMonitorConfig,
  type ProviderSourceAdapter,
  type ProviderSourcePurpose,
} from "@fwqgo/core/provider-monitor-config";
import { db } from "@fwqgo/db";
import {
  adminBackgroundJobs,
  affServiceProviders,
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
  hashProviderSourceResponse,
  parseProviderSourcePayload,
  prepareProviderOfferCandidates,
  type ProviderOfferCandidate,
  validateProviderOfferCandidate,
} from "@/server/offers/provider-source-parser";
import { enrichWhmcsProductPrices } from "@/server/offers/whmcs-product-page";
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

async function completeProviderMonitorRun(input: {
  monitorId: number;
  runId: number;
  checkedAt: Date;
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
      configHash: null,
      checkedAt: new Date().toISOString(),
    };
  }

  const adapter = monitor.adapter as ProviderSourceAdapter;
  const parsedConfig = parseProviderMonitorConfig(monitor.config, adapter);
  const resolvedSecrets = resolveProviderMonitorSecrets(parsedConfig);
  const config = resolvedSecrets.config;
  if (resolvedSecrets.needsMigration) {
    await db
      .update(providerMonitors)
      .set({ config: resolvedSecrets.storageConfig, updatedAt: new Date() })
      .where(eq(providerMonitors.id, monitor.id));
  }
  const context: ProviderSyncContext = {
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
  const configHash = hashProviderMonitorSyncConfig({
    adapter,
    config,
    affiliate: {
      affUrl: monitor.affUrl,
      affParam: monitor.affParam,
      affValue: monitor.affValue,
    },
    behavior: {
      purpose: monitor.purpose,
      autoPublish: monitor.autoPublish,
      missingThreshold: monitor.missingThreshold,
      defaultPromoCode: monitor.defaultPromoCode,
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
      configHash: null,
      checkedAt: checkedAt.toISOString(),
    };
  }
  const ownership = { monitorId: monitor.id, checkedAt };

  try {
    const conditionalHeaders: Record<string, string> = {};
    if (adapter !== "whmcs" && configUnchanged && monitor.etag) {
      conditionalHeaders["If-None-Match"] = monitor.etag;
    }
    if (adapter !== "whmcs" && configUnchanged && monitor.lastModified) {
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
    responseStatus = response.status;
    if (response.status === 304 && !configUnchanged) {
      throw new Error("供应商网站在采集配置变化后错误返回 304");
    }
    if (!response.ok && response.status !== 304) {
      throw new Error(
        `供应商网站返回 HTTP ${response.status} ${response.statusText}`,
      );
    }
    const text =
      response.status === 304
        ? ""
        : await readResponseTextWithLimit(response, MAX_MONITOR_RESPONSE_BYTES);
    if (text === null) throw new Error("供应商响应超过 8 MB 限制");
    const responseHash = text
      ? hashProviderSourceResponse(text)
      : monitor.responseHash;
    const notModified =
      adapter !== "whmcs" &&
      (response.status === 304 ||
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
        configHash,
        checkedAt: checkedAt.toISOString(),
      };
      const completed = await completeProviderMonitorRun({
        monitorId: monitor.id,
        runId: run.id,
        checkedAt,
        runValues: {
          status: "succeeded",
          httpStatus: response.status,
          responseHash,
          unchanged: refreshed.length,
          finishedAt: new Date(),
        },
        monitorValues: {
          lastRunAt: checkedAt,
          nextRunAt,
          lastStatus: "succeeded",
          lastError: null,
          etag: response.headers.get("etag") ?? monitor.etag,
          lastModified:
            response.headers.get("last-modified") ?? monitor.lastModified,
          responseHash,
          lastSummary: summary,
          updatedAt: checkedAt,
        },
      });
      if (!completed) {
        await markProviderMonitorRunSuperseded(run.id, new Date());
        return summary;
      }
      await safelyEnqueueEnabledProviderMonitorTask(monitor.id, nextRunAt);
      return summary;
    }

    let candidates = parseProviderSourcePayload({
      adapter,
      body: text,
      config,
      sourceUrl: monitor.endpointUrl,
    });
    if (candidates.length > MAX_MONITOR_ITEMS) {
      throw new Error(`供应商网站一次返回超过 ${MAX_MONITOR_ITEMS} 个套餐`);
    }
    if (adapter === "whmcs") {
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
      const enrichment = await enrichWhmcsProductPrices({
        candidates,
        previousCandidates,
        headers: config.headers,
        timeoutMs: monitor.timeoutSeconds * 1_000,
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
      configHash,
      checkedAt: checkedAt.toISOString(),
    };
    const completed = await completeProviderMonitorRun({
      monitorId: monitor.id,
      runId: run.id,
      checkedAt,
      runValues: {
        status: "succeeded",
        httpStatus: response.status,
        responseHash,
        received: candidates.length,
        ...counters,
        missing,
        finishedAt: new Date(),
      },
      monitorValues: {
        lastRunAt: checkedAt,
        nextRunAt,
        lastStatus: "succeeded",
        lastError: null,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        responseHash,
        lastSummary: summary,
        updatedAt: checkedAt,
      },
    });
    if (!completed) {
      await markProviderMonitorRunSuperseded(run.id, new Date());
      return summary;
    }
    await safelyPruneProviderMonitorCheckHistory(checkedAt);
    if (counters.created > 0 || counters.updated > 0 || missing > 0) {
      scheduleProviderOfferChanges();
    }
    await safelyEnqueueEnabledProviderMonitorTask(monitor.id, nextRunAt);
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

export async function enqueueProviderMonitorTask(
  monitorId: number,
  runAfter = new Date(),
) {
  return enqueueAdminBackgroundJob({
    key: `provider-monitor:${monitorId}`,
    label: `供应商采集 #${monitorId}`,
    payload: { monitorId },
    runAfter,
    maxAttempts: 3,
    run: async ({ job }) => {
      try {
        await runProviderMonitor(monitorId);
      } catch (error) {
        const [monitor] = await db
          .select({ enabled: providerMonitors.enabled })
          .from(providerMonitors)
          .where(eq(providerMonitors.id, monitorId))
          .limit(1);
        if (!monitor?.enabled) return;
        if (job.attempts >= job.maxAttempts) {
          const [current] = await db
            .select({ nextRunAt: providerMonitors.nextRunAt })
            .from(providerMonitors)
            .where(eq(providerMonitors.id, monitorId))
            .limit(1);
          if (current?.nextRunAt) {
            await safelyEnqueueEnabledProviderMonitorTask(
              monitorId,
              current.nextRunAt,
            );
          }
        }
        throw error;
      }
    },
  });
}

async function enqueueEnabledProviderMonitorTask(
  monitorId: number,
  runAfter: Date,
) {
  const [monitor] = await db
    .select({ id: providerMonitors.id })
    .from(providerMonitors)
    .where(
      and(
        eq(providerMonitors.id, monitorId),
        eq(providerMonitors.enabled, true),
      ),
    )
    .limit(1);
  if (!monitor) return null;
  return enqueueProviderMonitorTask(monitorId, runAfter);
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
      enabled: providerMonitors.enabled,
    })
    .from(providerMonitorRuns)
    .innerJoin(
      providerMonitors,
      eq(providerMonitorRuns.monitorId, providerMonitors.id),
    )
    .where(eq(providerMonitorRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("供应商采集运行记录不存在");
  if (run.status !== "failed") throw new Error("只有失败的采集运行可以重试");
  if (!run.enabled) throw new Error("采集源已停用，请先在供应商采集页面启用");
  await enqueueProviderMonitorTask(run.monitorId, new Date());
  return { runId, monitorId: run.monitorId };
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
  const rows = await db
    .select({
      id: providerMonitors.id,
      providerId: providerMonitors.providerId,
      providerName: affServiceProviders.name,
      name: providerMonitors.name,
      adapter: providerMonitors.adapter,
      purpose: providerMonitors.purpose,
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
    .orderBy(desc(providerMonitors.enabled), asc(affServiceProviders.name));

  return rows.map((row) => ({
    ...row,
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
};

export async function createProviderMonitor(
  input: ProviderMonitorMutationInput,
) {
  const now = new Date();
  const [created] = await db
    .insert(providerMonitors)
    .values({
      ...input,
      config: prepareProviderMonitorSecrets(input.config),
      nextRunAt: input.enabled ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: providerMonitors.id });

  if (!created) throw new Error("供应商采集源创建失败");
  if (input.enabled) await enqueueProviderMonitorTask(created.id, now);
  return created;
}

export async function updateProviderMonitor(
  id: number,
  input: ProviderMonitorMutationInput,
) {
  const { providerId, ...mutableInput } = input;
  const [existing] = await db
    .select({
      providerId: providerMonitors.providerId,
      adapter: providerMonitors.adapter,
      config: providerMonitors.config,
    })
    .from(providerMonitors)
    .where(eq(providerMonitors.id, id))
    .limit(1);
  if (!existing) throw new Error("供应商采集源不存在");
  if (existing.providerId !== providerId) {
    throw new Error("已有采集源不能更换厂商，请新建采集源");
  }
  const existingConfig = parseProviderMonitorConfig(
    existing.config,
    existing.adapter as ProviderSourceAdapter,
  );

  const now = new Date();
  const [updated] = await db
    .update(providerMonitors)
    .set({
      ...mutableInput,
      config: prepareProviderMonitorSecrets(input.config, existingConfig),
      nextRunAt: input.enabled ? now : null,
      lastStatus: input.enabled ? undefined : "idle",
      lastError: input.enabled ? undefined : null,
      updatedAt: now,
    })
    .where(eq(providerMonitors.id, id))
    .returning({ id: providerMonitors.id });

  if (!updated) throw new Error("供应商采集源不存在");
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
      lastError: "供应商采集源已停用",
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
  return db.transaction(async (tx) => {
    const now = new Date();
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
          eq(adminBackgroundJobs.jobKey, `provider-monitor:${id}`),
          eq(adminBackgroundJobs.status, "queued"),
        ),
      );

    const [runningJob] = await tx
      .select({ id: adminBackgroundJobs.id })
      .from(adminBackgroundJobs)
      .where(
        and(
          eq(adminBackgroundJobs.jobKey, `provider-monitor:${id}`),
          eq(adminBackgroundJobs.status, "running"),
        ),
      )
      .limit(1);
    const [runningRun] = await tx
      .select({ id: providerMonitorRuns.id })
      .from(providerMonitorRuns)
      .where(
        and(
          eq(providerMonitorRuns.monitorId, id),
          eq(providerMonitorRuns.status, "running"),
        ),
      )
      .limit(1);
    if (runningJob || runningRun) {
      throw new Error("采集正在执行，请等待本次执行结束后再删除");
    }

    const [deleted] = await tx
      .delete(providerMonitors)
      .where(eq(providerMonitors.id, id))
      .returning({ id: providerMonitors.id });
    if (!deleted) throw new Error("供应商采集源不存在");
    return deleted;
  });
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

export async function getProviderOfferCandidateList(
  status:
    | "pending"
    | "accepted"
    | "rejected"
    | "superseded"
    | "all" = "pending",
  limit = 100,
) {
  return db
    .select({
      id: providerOfferCandidates.id,
      monitorId: providerOfferCandidates.monitorId,
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
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function previewProviderMonitorSource(input: {
  monitorId?: number;
  adapter: ProviderSourceAdapter;
  endpointUrl: string;
  config: ProviderMonitorConfig;
  timeoutSeconds: number;
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
  const parsedCandidates = parseProviderSourcePayload({
    adapter: input.adapter,
    body,
    config,
    sourceUrl: input.endpointUrl,
  });
  if (parsedCandidates.length > MAX_MONITOR_ITEMS) {
    throw new Error(`供应商网站一次返回超过 ${MAX_MONITOR_ITEMS} 个套餐`);
  }
  let candidates = parsedCandidates.slice(0, 20);
  let detailIssues = 0;
  if (input.adapter === "whmcs") {
    const enrichment = await enrichWhmcsProductPrices({
      candidates,
      headers: config.headers,
      timeoutMs: input.timeoutSeconds * 1_000,
    });
    candidates = enrichment.candidates;
    detailIssues = enrichment.issues.length;
  }
  return {
    httpStatus: response.status,
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
