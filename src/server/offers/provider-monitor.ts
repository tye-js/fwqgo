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
import { notifyPublicWebCache } from "@/server/cache/public-revalidation-client";
import {
  markMissingProviderOffers,
  syncProviderOfferCandidate,
  type ProviderSyncContext,
} from "@/server/offers/provider-offer-sync";
import {
  hashProviderMonitorSyncConfig,
  hashProviderOfferSyncState,
  hashProviderSourceResponse,
  parseProviderSourcePayload,
  prepareProviderOfferCandidates,
  validateProviderOfferCandidate,
} from "@/server/offers/provider-source-parser";

const MAX_MONITOR_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_MONITOR_ITEMS = 5_000;

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

async function safelyNotifyProviderOfferChanges() {
  try {
    await notifyPublicWebCache("offer.changed", {
      topicSlugs: ["hong-kong", "united-states", "cheap-vps"],
    });
  } catch (error) {
    console.error("供应商套餐缓存通知失败:", error);
  }
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
  const config = parseProviderMonitorConfig(monitor.config, adapter);
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

  const [claimedMonitor] = await db
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
  if (!claimedMonitor) {
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

  await db
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
  const [run] = await db
    .insert(providerMonitorRuns)
    .values({ monitorId: monitor.id, status: "running", startedAt: checkedAt })
    .returning({ id: providerMonitorRuns.id });
  if (!run) throw new Error("供应商采集运行记录创建失败");

  try {
    const conditionalHeaders: Record<string, string> = {};
    if (configUnchanged && monitor.etag) {
      conditionalHeaders["If-None-Match"] = monitor.etag;
    }
    if (configUnchanged && monitor.lastModified) {
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
      response.status === 304 ||
      Boolean(
        configUnchanged &&
        responseHash &&
        responseHash === monitor.responseHash,
      );

    if (notModified) {
      const refreshed = await db
        .update(serverOffers)
        .set({
          sourceLastSeenAt: checkedAt,
          missingRuns: 0,
          lastCheckedAt: checkedAt,
          checkStatus: "ok",
        })
        .where(eq(serverOffers.sourceMonitorId, monitor.id))
        .returning({ id: serverOffers.id });
      if (refreshed.length === 0) {
        await db
          .update(providerMonitors)
          .set({
            etag: null,
            lastModified: null,
            responseHash: null,
            lastSummary: null,
            updatedAt: checkedAt,
          })
          .where(eq(providerMonitors.id, monitor.id));
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
      await db
        .update(providerMonitorRuns)
        .set({
          status: "succeeded",
          httpStatus: response.status,
          responseHash,
          unchanged: refreshed.length,
          finishedAt: new Date(),
        })
        .where(eq(providerMonitorRuns.id, run.id));
      await db
        .update(providerMonitors)
        .set({
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
        })
        .where(
          and(
            eq(providerMonitors.id, monitor.id),
            eq(providerMonitors.enabled, true),
          ),
        );
      await enqueueEnabledProviderMonitorTask(monitor.id, nextRunAt);
      return summary;
    }

    const candidates = parseProviderSourcePayload({
      adapter,
      body: text,
      config,
      sourceUrl: monitor.endpointUrl,
    });
    if (candidates.length > MAX_MONITOR_ITEMS) {
      throw new Error(`供应商网站一次返回超过 ${MAX_MONITOR_ITEMS} 个套餐`);
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
          currency: primaryPrice?.currency ?? null,
          responseTimeMs: Date.now() - startedAt,
          checkedAt,
        });
      }
    }

    const missing = await markMissingProviderOffers({
      context,
      seenExternalIds: preparedCandidates.seenExternalIds,
      now: checkedAt,
    });
    if (checkRows.length > 0)
      await db.insert(serverOfferChecks).values(checkRows);
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
    await db
      .update(providerMonitorRuns)
      .set({
        status: "succeeded",
        httpStatus: response.status,
        responseHash,
        received: candidates.length,
        ...counters,
        missing,
        finishedAt: new Date(),
      })
      .where(eq(providerMonitorRuns.id, run.id));
    await db
      .update(providerMonitors)
      .set({
        lastRunAt: checkedAt,
        nextRunAt,
        lastStatus: "succeeded",
        lastError: null,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        responseHash,
        lastSummary: summary,
        updatedAt: checkedAt,
      })
      .where(
        and(
          eq(providerMonitors.id, monitor.id),
          eq(providerMonitors.enabled, true),
        ),
      );
    await safelyPruneProviderMonitorCheckHistory(checkedAt);
    if (counters.created > 0 || counters.updated > 0 || missing > 0) {
      await safelyNotifyProviderOfferChanges();
    }
    await enqueueEnabledProviderMonitorTask(monitor.id, nextRunAt);
    return summary;
  } catch (error) {
    const message = truncate(getErrorMessage(error));
    let failedOfferCount = 0;
    try {
      const mappedOffers = await db
        .select({ id: serverOffers.id })
        .from(serverOffers)
        .where(eq(serverOffers.sourceMonitorId, monitor.id))
        .limit(MAX_MONITOR_ITEMS);
      const failedOfferIds = mappedOffers.map((offer) => offer.id);
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
      console.error("记录供应商采集失败状态时发生错误:", recordError);
    }
    await db
      .update(providerMonitorRuns)
      .set({
        status: "failed",
        httpStatus: responseStatus,
        errorTitle: "供应商采集失败",
        errorDetail: message,
        finishedAt: new Date(),
      })
      .where(eq(providerMonitorRuns.id, run.id));
    await db
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
        ),
      );
    await safelyPruneProviderMonitorCheckHistory(checkedAt);
    if (failedOfferCount > 0) {
      await safelyNotifyProviderOfferChanges();
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
            await enqueueEnabledProviderMonitorTask(
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
  return db
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
  const now = new Date();
  const [updated] = await db
    .update(providerMonitors)
    .set({
      ...input,
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
  const [[runningJob], [runningRun]] = await Promise.all([
    db
      .select({ id: adminBackgroundJobs.id })
      .from(adminBackgroundJobs)
      .where(
        and(
          eq(adminBackgroundJobs.jobKey, `provider-monitor:${id}`),
          eq(adminBackgroundJobs.status, "running"),
        ),
      )
      .limit(1),
    db
      .select({ id: providerMonitorRuns.id })
      .from(providerMonitorRuns)
      .where(
        and(
          eq(providerMonitorRuns.monitorId, id),
          eq(providerMonitorRuns.status, "running"),
        ),
      )
      .limit(1),
  ]);
  if (runningJob || runningRun) {
    throw new Error("采集正在执行，请等待本次执行结束后再删除");
  }

  await cancelQueuedProviderMonitorJobs(id);
  const [deleted] = await db
    .delete(providerMonitors)
    .where(eq(providerMonitors.id, id))
    .returning({ id: providerMonitors.id });
  if (!deleted) throw new Error("供应商采集源不存在");
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
  adapter: ProviderSourceAdapter;
  endpointUrl: string;
  config: ProviderMonitorConfig;
  timeoutSeconds: number;
}) {
  const response = await fetchPublicHttpUrl(
    input.endpointUrl,
    {
      headers: {
        Accept:
          input.adapter === "json"
            ? "application/json"
            : "text/html,application/xhtml+xml",
        ...input.config.headers,
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
  const candidates = parseProviderSourcePayload({
    adapter: input.adapter,
    body,
    config: input.config,
    sourceUrl: input.endpointUrl,
  });
  if (candidates.length > MAX_MONITOR_ITEMS) {
    throw new Error(`供应商网站一次返回超过 ${MAX_MONITOR_ITEMS} 个套餐`);
  }
  return {
    httpStatus: response.status,
    total: candidates.length,
    items: candidates.slice(0, 20).map((candidate) => {
      const normalized = Object.fromEntries(
        Object.entries(candidate).filter(([key]) => key !== "raw"),
      ) as Omit<typeof candidate, "raw">;
      return {
        candidate: normalized,
        quality: validateProviderOfferCandidate(
          candidate,
          input.config.requiredSpecCount,
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
