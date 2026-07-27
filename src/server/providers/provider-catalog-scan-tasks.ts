import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import {
  renderProviderCatalogDiscoveryPrompt,
  type ProviderCatalogSourceMapping,
} from "@fwqgo/core/provider-catalog-discovery";
import { db } from "@fwqgo/db";
import {
  affServiceProviders,
  providerCatalogScans,
  providerMonitors,
} from "@fwqgo/db/schema";
import {
  enqueueAdminBackgroundJob,
  runWithActiveAdminBackgroundJobLease,
  runWithCurrentAdminBackgroundJobTerminalState,
  type BackgroundJobContext,
} from "@/server/admin/background-jobs";
import { enqueueProviderMonitorTask } from "@/server/offers/provider-monitor";
import {
  mapProviderCatalogPagesWithAi,
  ProviderCatalogAiOutputError,
} from "@/server/providers/provider-catalog-ai";
import {
  collectProviderCatalogPages,
  rankProviderCatalogPagesForAi,
  ProviderCatalogFetchError,
  serializeProviderCatalogPagesForAi,
} from "@/server/providers/provider-catalog-discovery";
import {
  buildProviderCatalogMappingRepairPrompt,
  formatProviderCatalogAiAudit,
  formatProviderCatalogPreflightFailure,
  preflightProviderCatalogMappings,
} from "@/server/providers/provider-catalog-mapping-preflight";
import { refreshProviderCatalogScanStatus } from "@/server/providers/provider-catalog-scan-status";

const recoverableStatuses = ["queued", "running"] as const;

function isRecoverableStatus(
  status: string,
): status is (typeof recoverableStatuses)[number] {
  return status === "queued" || status === "running";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "未知错误";
}

function truncate(value: string, maxLength = 5_000) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength).trimEnd()}...`;
}

function uniqueMessages(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mergeProviderCatalogMappings(
  primary: ProviderCatalogSourceMapping[],
  secondary: ProviderCatalogSourceMapping[],
) {
  const merged = new Map<string, ProviderCatalogSourceMapping>();
  for (const mapping of [...primary, ...secondary]) {
    const key = `${mapping.adapter}:${mapping.endpointUrl}`;
    if (!merged.has(key)) merged.set(key, mapping);
  }
  return [...merged.values()].slice(0, 8);
}

function getMonitorName(
  mapping: ProviderCatalogSourceMapping,
  scanId: number,
  index: number,
) {
  const readable = mapping.name.replace(/\s+/g, " ").trim().slice(0, 100);
  const identity = createHash("sha256")
    .update(`${mapping.adapter}:${mapping.endpointUrl}`)
    .digest("hex")
    .slice(0, 6);
  return `${readable || "AI 发现来源"} · 扫描 #${scanId}-${index + 1}-${identity}`;
}

async function finishManualScan(
  scanId: number,
  context: BackgroundJobContext,
  input: {
    discoveredUrls?: string[];
    warnings: string[];
    error: string;
  },
) {
  const finishedAt = new Date();
  const result = await runWithActiveAdminBackgroundJobLease(
    context,
    async (tx) => {
      await tx
        .update(providerCatalogScans)
        .set({
          status: "needs_auth",
          progress: 100,
          currentStep: "manual_follow_up",
          discoveredUrls: input.discoveredUrls ?? [],
          warnings: uniqueMessages(input.warnings),
          error: truncate(input.error),
          capturedAt: finishedAt,
          finishedAt,
          updatedAt: finishedAt,
        })
        .where(
          and(
            eq(providerCatalogScans.id, scanId),
            inArray(providerCatalogScans.status, ["queued", "running"]),
          ),
        );
    },
  );
  return result.active;
}

async function claimProviderCatalogScan(
  scanId: number,
  context: BackgroundJobContext,
) {
  const result = await runWithActiveAdminBackgroundJobLease(
    context,
    async (tx) => {
      const [scan] = await tx
        .select({
          id: providerCatalogScans.id,
          providerId: providerCatalogScans.providerId,
          status: providerCatalogScans.status,
          startedAt: providerCatalogScans.startedAt,
        })
        .from(providerCatalogScans)
        .where(eq(providerCatalogScans.id, scanId))
        .for("update")
        .limit(1);
      if (!scan || !isRecoverableStatus(scan.status)) {
        return null;
      }
      const now = new Date();
      await tx
        .update(providerCatalogScans)
        .set({
          status: "running",
          progress: 5,
          currentStep: "discovering_pages",
          error: null,
          startedAt: scan.startedAt ?? now,
          finishedAt: null,
          updatedAt: now,
        })
        .where(eq(providerCatalogScans.id, scan.id));
      return scan;
    },
  );
  return result.active ? result.value : null;
}

async function resumeExistingScanMonitors(
  scanId: number,
  context: BackgroundJobContext,
) {
  const monitors = await db
    .select({
      id: providerMonitors.id,
      enabled: providerMonitors.enabled,
      nextRunAt: providerMonitors.nextRunAt,
    })
    .from(providerMonitors)
    .where(eq(providerMonitors.discoveredByScanId, scanId));
  if (monitors.length === 0) return false;
  const resumed = await runWithActiveAdminBackgroundJobLease(
    context,
    async (tx) => {
      await tx
        .update(providerCatalogScans)
        .set({
          progress: 80,
          currentStep: "source_monitoring",
          monitorCount: monitors.length,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(providerCatalogScans.id, scanId),
            eq(providerCatalogScans.status, "running"),
          ),
        );
    },
  );
  if (!resumed.active) return true;
  for (const monitor of monitors) {
    if (monitor.enabled) {
      await enqueueProviderMonitorTask(
        monitor.id,
        monitor.nextRunAt ?? new Date(),
      );
    }
  }
  await refreshProviderCatalogScanStatus(scanId);
  return true;
}

export async function runProviderCatalogScan(
  scanId: number,
  context: BackgroundJobContext,
) {
  const scan = await claimProviderCatalogScan(scanId, context);
  if (!scan) return;
  if (await resumeExistingScanMonitors(scan.id, context)) return;

  const [provider] = await db
    .select({
      id: affServiceProviders.id,
      name: affServiceProviders.name,
      officialUrl: affServiceProviders.officialUrl,
    })
    .from(affServiceProviders)
    .where(eq(affServiceProviders.id, scan.providerId))
    .limit(1);
  if (!provider) throw new Error("供应商不存在或已被删除");

  let discovery: Awaited<ReturnType<typeof collectProviderCatalogPages>>;
  try {
    discovery = await collectProviderCatalogPages(provider.officialUrl);
  } catch (error) {
    if (
      error instanceof ProviderCatalogFetchError &&
      error.kind === "needs_auth"
    ) {
      await finishManualScan(scan.id, context, {
        warnings: [error.message],
        error: "供应商套餐目录拒绝公开访问或需要登录，本次扫描未尝试绕过限制",
      });
      return;
    }
    throw error;
  }

  const aiPages = rankProviderCatalogPagesForAi(discovery.pages).slice(0, 8);
  const discoveryWarnings = uniqueMessages([
    ...discovery.warnings,
    ...(discovery.pages.length > aiPages.length
      ? [
          `本次读取 ${discovery.pages.length} 个页面，按发现优先级选择前 ${aiPages.length} 个交给 AI 映射`,
        ]
      : []),
  ]);
  const capturedAt = new Date();
  const pagesCaptured = await runWithActiveAdminBackgroundJobLease(
    context,
    async (tx) => {
      await tx
        .update(providerCatalogScans)
        .set({
          progress: 35,
          currentStep: "pages_captured",
          discoveredUrls: discovery.discoveredUrls,
          warnings: discoveryWarnings,
          capturedAt,
          updatedAt: capturedAt,
        })
        .where(
          and(
            eq(providerCatalogScans.id, scan.id),
            eq(providerCatalogScans.status, "running"),
          ),
        );
    },
  );
  if (!pagesCaptured.active) return;

  if (discovery.manualReason) {
    await finishManualScan(scan.id, context, {
      discoveredUrls: discovery.discoveredUrls,
      warnings: discoveryWarnings,
      error:
        discovery.manualReason === "needs_auth"
          ? "套餐目录需要登录或拒绝公开访问"
          : "公开页面只有客户端动态内容，需要人工查找公开接口或配置浏览器采集",
    });
    return;
  }
  if (discovery.pages.length === 0) {
    throw new Error("供应商官网可访问，但没有抓取到可供分析的公开页面");
  }

  const aiConfig = await getActiveAiRewriteConfig();
  if (!aiConfig) throw new Error("没有启用的默认 AI 配置");
  const pagesJson = serializeProviderCatalogPagesForAi(aiPages);
  const prompt = renderProviderCatalogDiscoveryPrompt({
    template: aiConfig.providerCatalogDiscoveryPrompt,
    providerName: provider.name,
    officialUrl: provider.officialUrl,
    pagesJson,
  });
  const promptStoredAt = new Date();
  const promptStored = await runWithActiveAdminBackgroundJobLease(
    context,
    async (tx) => {
      await tx
        .update(providerCatalogScans)
        .set({
          aiConfigId: aiConfig.id,
          prompt,
          progress: 50,
          currentStep: "ai_mapping",
          updatedAt: promptStoredAt,
        })
        .where(
          and(
            eq(providerCatalogScans.id, scan.id),
            eq(providerCatalogScans.status, "running"),
          ),
        );
    },
  );
  if (!promptStored.active) return;

  let aiResult: Awaited<ReturnType<typeof mapProviderCatalogPagesWithAi>>;
  try {
    aiResult = await mapProviderCatalogPagesWithAi({
      config: aiConfig,
      prompt,
      fetchedUrls: aiPages.map((page) => page.url),
    });
  } catch (error) {
    if (error instanceof ProviderCatalogAiOutputError) {
      const rawResponseStored = await runWithActiveAdminBackgroundJobLease(
        context,
        async (tx) => {
          await tx
            .update(providerCatalogScans)
            .set({
              aiResponse: error.rawResponse,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(providerCatalogScans.id, scan.id),
                eq(providerCatalogScans.status, "running"),
              ),
            );
        },
      );
      if (!rawResponseStored.active) return;
    }
    throw error;
  }

  let storedPrompt = prompt;
  let storedAiResponse = aiResult.rawResponse;
  let warnings = uniqueMessages([...discoveryWarnings, ...aiResult.warnings]);
  const initialPreflight = preflightProviderCatalogMappings({
    pages: aiPages,
    mappings: aiResult.mappings,
  });
  let validatedMappings = initialPreflight.acceptedMappings;

  if (initialPreflight.failures.length > 0) {
    warnings = uniqueMessages([
      ...warnings,
      `初次映射有 ${initialPreflight.failures.length} 个来源未通过真实页面预检，已自动纠错一次`,
      ...initialPreflight.failures.map((failure) =>
        formatProviderCatalogPreflightFailure(failure),
      ),
    ]);
    const repairPrompt = buildProviderCatalogMappingRepairPrompt({
      originalPrompt: prompt,
      previousResponse: aiResult.rawResponse,
      failures: initialPreflight.failures,
    });
    storedPrompt = formatProviderCatalogAiAudit({
      initial: prompt,
      repair: repairPrompt,
    });
    const repairStartedAt = new Date();
    const repairStarted = await runWithActiveAdminBackgroundJobLease(
      context,
      async (tx) => {
        await tx
          .update(providerCatalogScans)
          .set({
            prompt: storedPrompt,
            aiResponse: aiResult.rawResponse,
            warnings,
            progress: 58,
            currentStep: "mapping_repair",
            updatedAt: repairStartedAt,
          })
          .where(
            and(
              eq(providerCatalogScans.id, scan.id),
              eq(providerCatalogScans.status, "running"),
            ),
          );
      },
    );
    if (!repairStarted.active) return;

    let repairResult: Awaited<
      ReturnType<typeof mapProviderCatalogPagesWithAi>
    > | null = null;
    try {
      repairResult = await mapProviderCatalogPagesWithAi({
        config: aiConfig,
        prompt: repairPrompt,
        fetchedUrls: aiPages.map((page) => page.url),
      });
    } catch (error) {
      const repairResponse =
        error instanceof ProviderCatalogAiOutputError
          ? error.rawResponse
          : `纠错请求失败：${getErrorMessage(error)}`;
      storedAiResponse = formatProviderCatalogAiAudit({
        initial: aiResult.rawResponse,
        repair: repairResponse,
      });
      warnings = uniqueMessages([
        ...warnings,
        `自动纠错请求失败：${getErrorMessage(error)}`,
      ]);
      const repairFailureStored = await runWithActiveAdminBackgroundJobLease(
        context,
        async (tx) => {
          await tx
            .update(providerCatalogScans)
            .set({
              prompt: storedPrompt,
              aiResponse: storedAiResponse,
              warnings,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(providerCatalogScans.id, scan.id),
                eq(providerCatalogScans.status, "running"),
              ),
            );
        },
      );
      if (!repairFailureStored.active) return;
      if (validatedMappings.length === 0) throw error;
    }

    if (repairResult) {
      const repairPreflight = preflightProviderCatalogMappings({
        pages: aiPages,
        mappings: repairResult.mappings,
      });
      validatedMappings = mergeProviderCatalogMappings(
        validatedMappings,
        repairPreflight.acceptedMappings,
      );
      storedAiResponse = formatProviderCatalogAiAudit({
        initial: aiResult.rawResponse,
        repair: repairResult.rawResponse,
      });
      warnings = uniqueMessages([
        ...warnings,
        ...repairResult.warnings,
        ...(repairResult.mappings.length === 0
          ? ["自动纠错未返回任何可预检的来源映射"]
          : []),
        ...repairPreflight.failures.map(
          (failure) =>
            `自动纠错后仍未通过：${formatProviderCatalogPreflightFailure(failure)}`,
        ),
      ]);
    }
  }

  const mappedAt = new Date();
  const mappingStored = await runWithActiveAdminBackgroundJobLease(
    context,
    async (tx) => {
      await tx
        .update(providerCatalogScans)
        .set({
          prompt: storedPrompt,
          aiResponse: storedAiResponse,
          sourceMappings: validatedMappings,
          warnings,
          sourceCount: validatedMappings.length,
          progress: 65,
          currentStep: "mapping_validated",
          updatedAt: mappedAt,
        })
        .where(
          and(
            eq(providerCatalogScans.id, scan.id),
            eq(providerCatalogScans.status, "running"),
          ),
        );
    },
  );
  if (!mappingStored.active) return;

  if (validatedMappings.length === 0) {
    const finishedAt = new Date();
    await runWithActiveAdminBackgroundJobLease(context, async (tx) => {
      await tx
        .update(providerCatalogScans)
        .set({
          status: "partial",
          progress: 100,
          currentStep: "completed",
          warnings: uniqueMessages([
            ...warnings,
            "AI 未找到能通过真实页面解析预检的 JSON、HTML 或 WHMCS 套餐源",
          ]),
          finishedAt,
          updatedAt: finishedAt,
        })
        .where(
          and(
            eq(providerCatalogScans.id, scan.id),
            eq(providerCatalogScans.status, "running"),
          ),
        );
    });
    return;
  }

  const now = new Date();
  const monitorIds = await runWithActiveAdminBackgroundJobLease(
    context,
    async (tx) => {
      for (const [index, mapping] of validatedMappings.entries()) {
        await tx
          .insert(providerMonitors)
          .values({
            providerId: provider.id,
            name: getMonitorName(mapping, scan.id, index),
            adapter: mapping.adapter,
            purpose: mapping.purpose,
            scheduleMode: "once",
            discoveredByScanId: scan.id,
            endpointUrl: mapping.endpointUrl,
            config: mapping.config as Record<string, unknown>,
            enabled: true,
            autoPublish: false,
            missingThreshold: 3,
            intervalMinutes: 1_440,
            timeoutSeconds: 60,
            nextRunAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }
      const monitors = await tx
        .select({ id: providerMonitors.id })
        .from(providerMonitors)
        .where(eq(providerMonitors.discoveredByScanId, scan.id))
        .orderBy(asc(providerMonitors.id));
      await tx
        .update(providerCatalogScans)
        .set({
          monitorCount: monitors.length,
          progress: 80,
          currentStep: "source_monitoring",
          updatedAt: now,
        })
        .where(
          and(
            eq(providerCatalogScans.id, scan.id),
            eq(providerCatalogScans.status, "running"),
          ),
        );
      return monitors.map((monitor) => monitor.id);
    },
  );
  if (!monitorIds.active) return;
  if (monitorIds.value.length === 0) {
    throw new Error("AI 映射已通过校验，但一次性采集源创建失败");
  }
  for (const monitorId of monitorIds.value) {
    await enqueueProviderMonitorTask(monitorId, now);
  }
}

export async function enqueueProviderCatalogScanTask(
  scanId: number,
  runAfter = new Date(),
) {
  return enqueueAdminBackgroundJob({
    key: `provider-catalog-scan:${scanId}`,
    label: `供应商套餐扫描 #${scanId}`,
    payload: { scanId },
    runAfter,
    maxAttempts: 3,
    run: async (context) => {
      await runProviderCatalogScan(scanId, context);
    },
    onTerminal: async ({ status, job, error }) => {
      if (status !== "failed") return;
      const finishedAt = new Date();
      await runWithCurrentAdminBackgroundJobTerminalState(
        { job, status },
        async (tx) => {
          await tx
            .update(providerCatalogScans)
            .set({
              status: "failed",
              progress: 100,
              currentStep: "failed",
              error: truncate(getErrorMessage(error)),
              finishedAt,
              updatedAt: finishedAt,
            })
            .where(
              and(
                eq(providerCatalogScans.id, scanId),
                inArray(providerCatalogScans.status, ["queued", "running"]),
              ),
            );
        },
      );
    },
  });
}

export async function startProviderCatalogScans(input: {
  providerIds: number[];
  requestedBy: string;
}) {
  const providerIds = [...new Set(input.providerIds)];
  const providers = await db
    .select({
      id: affServiceProviders.id,
      name: affServiceProviders.name,
      officialUrl: affServiceProviders.officialUrl,
    })
    .from(affServiceProviders)
    .where(inArray(affServiceProviders.id, providerIds));
  const providerById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );
  const scans: Array<{ id: number; providerId: number; reused: boolean }> = [];

  for (const providerId of providerIds) {
    const provider = providerById.get(providerId);
    if (!provider) throw new Error(`供应商 #${providerId} 不存在`);
    if (!provider.officialUrl.trim()) {
      throw new Error(`供应商 ${provider.name} 未配置官网`);
    }
  }

  for (const providerId of providerIds) {
    const provider = providerById.get(providerId)!;
    const [existing] = await db
      .select({ id: providerCatalogScans.id })
      .from(providerCatalogScans)
      .where(
        and(
          eq(providerCatalogScans.providerId, providerId),
          inArray(providerCatalogScans.status, ["queued", "running"]),
        ),
      )
      .orderBy(desc(providerCatalogScans.id))
      .limit(1);
    if (existing) {
      scans.push({ id: existing.id, providerId, reused: true });
      continue;
    }
    const [created] = await db
      .insert(providerCatalogScans)
      .values({
        providerId,
        requestedBy: input.requestedBy,
        status: "queued",
        progress: 0,
        currentStep: "queued",
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: providerCatalogScans.id });
    const selected =
      created ??
      (
        await db
          .select({ id: providerCatalogScans.id })
          .from(providerCatalogScans)
          .where(
            and(
              eq(providerCatalogScans.providerId, providerId),
              inArray(providerCatalogScans.status, ["queued", "running"]),
            ),
          )
          .orderBy(desc(providerCatalogScans.id))
          .limit(1)
      )[0];
    if (!selected) throw new Error(`供应商 ${provider.name} 扫描记录创建失败`);
    scans.push({
      id: selected.id,
      providerId,
      reused: !created,
    });
  }

  for (const scan of scans) await enqueueProviderCatalogScanTask(scan.id);
  return scans;
}

export async function ensureProviderCatalogScanWorkers() {
  const scans = await db
    .select({ id: providerCatalogScans.id })
    .from(providerCatalogScans)
    .where(inArray(providerCatalogScans.status, [...recoverableStatuses]))
    .orderBy(asc(providerCatalogScans.createdAt));
  for (const scan of scans) await enqueueProviderCatalogScanTask(scan.id);
}

export async function getProviderCatalogScanList(limit = 100) {
  return db
    .select({
      id: providerCatalogScans.id,
      providerId: providerCatalogScans.providerId,
      providerName: affServiceProviders.name,
      status: providerCatalogScans.status,
      progress: providerCatalogScans.progress,
      currentStep: providerCatalogScans.currentStep,
      sourceCount: providerCatalogScans.sourceCount,
      monitorCount: providerCatalogScans.monitorCount,
      candidateCount: providerCatalogScans.candidateCount,
      startedAt: providerCatalogScans.startedAt,
      finishedAt: providerCatalogScans.finishedAt,
      capturedAt: providerCatalogScans.capturedAt,
      createdAt: providerCatalogScans.createdAt,
      updatedAt: providerCatalogScans.updatedAt,
    })
    .from(providerCatalogScans)
    .innerJoin(
      affServiceProviders,
      eq(providerCatalogScans.providerId, affServiceProviders.id),
    )
    .orderBy(
      desc(providerCatalogScans.createdAt),
      desc(providerCatalogScans.id),
    )
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function getProviderCatalogScanDetail(scanId: number) {
  const [scan] = await db
    .select({
      id: providerCatalogScans.id,
      prompt: providerCatalogScans.prompt,
      aiResponse: providerCatalogScans.aiResponse,
      discoveredUrls: providerCatalogScans.discoveredUrls,
      sourceMappings: providerCatalogScans.sourceMappings,
      warnings: providerCatalogScans.warnings,
      error: providerCatalogScans.error,
      capturedAt: providerCatalogScans.capturedAt,
      startedAt: providerCatalogScans.startedAt,
      finishedAt: providerCatalogScans.finishedAt,
      updatedAt: providerCatalogScans.updatedAt,
    })
    .from(providerCatalogScans)
    .where(eq(providerCatalogScans.id, scanId))
    .limit(1);
  if (!scan) return null;
  const sourceDiagnostics = await db
    .select({
      id: providerMonitors.id,
      name: providerMonitors.name,
      adapter: providerMonitors.adapter,
      endpointUrl: providerMonitors.endpointUrl,
      status: providerMonitors.lastStatus,
      error: providerMonitors.lastError,
      summary: providerMonitors.lastSummary,
    })
    .from(providerMonitors)
    .where(eq(providerMonitors.discoveredByScanId, scanId))
    .orderBy(asc(providerMonitors.id));
  return { ...scan, sourceDiagnostics };
}
