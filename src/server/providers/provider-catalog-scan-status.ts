import { and, eq, inArray } from "drizzle-orm";

import { deriveProviderCatalogScanTerminalStatus } from "@fwqgo/core/provider-catalog-discovery";
import { db } from "@fwqgo/db";
import {
  providerCatalogScans,
  providerMonitors,
  providerOfferCandidates,
} from "@fwqgo/db/schema";

type ProviderCatalogStatusTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
type ProviderCatalogStatusDatabase = Pick<
  ProviderCatalogStatusTransaction,
  "select" | "update"
>;

function uniqueMessages(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function summaryCounter(summary: Record<string, unknown> | null, key: string) {
  const value = summary?.[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function summaryRejectionReasons(summary: Record<string, unknown> | null) {
  const raw = summary?.rejectionReasons;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw)
    .filter(
      (entry): entry is [string, number] =>
        Boolean(entry[0].trim()) &&
        typeof entry[1] === "number" &&
        Number.isInteger(entry[1]) &&
        entry[1] > 0,
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 12);
}

function monitorDiagnostic(monitor: {
  name: string;
  lastStatus: string;
  lastSummary: Record<string, unknown> | null;
}) {
  if (monitor.lastStatus !== "succeeded") return null;
  const received = summaryCounter(monitor.lastSummary, "received");
  const skipped = summaryCounter(monitor.lastSummary, "skipped");
  const reasons = summaryRejectionReasons(monitor.lastSummary);
  if (received > 0 && skipped === 0) return null;
  const reasonText = reasons.length
    ? `；拒绝原因：${reasons
        .map(([reason, count]) => `${reason} x${count}`)
        .join("、")}`
    : "";
  return `采集源 ${monitor.name}：接收 ${received}，跳过 ${skipped}${reasonText}`;
}

export async function refreshProviderCatalogScanStatus(
  scanId: number,
  database: ProviderCatalogStatusDatabase = db,
) {
  const [scan] = await database
    .select({
      id: providerCatalogScans.id,
      status: providerCatalogScans.status,
      warnings: providerCatalogScans.warnings,
      sourceCount: providerCatalogScans.sourceCount,
      currentStep: providerCatalogScans.currentStep,
    })
    .from(providerCatalogScans)
    .where(eq(providerCatalogScans.id, scanId))
    .limit(1);
  if (!scan || !["queued", "running"].includes(scan.status)) return null;

  const monitors = await database
    .select({
      name: providerMonitors.name,
      enabled: providerMonitors.enabled,
      scheduleMode: providerMonitors.scheduleMode,
      lastStatus: providerMonitors.lastStatus,
      lastError: providerMonitors.lastError,
      lastSummary: providerMonitors.lastSummary,
    })
    .from(providerMonitors)
    .where(eq(providerMonitors.discoveredByScanId, scanId));
  if (
    monitors.length === 0 &&
    (scan.currentStep !== "source_monitoring" || scan.sourceCount === 0)
  ) {
    return null;
  }
  const onceMonitors = monitors.filter(
    (monitor) => monitor.scheduleMode === "once",
  );
  const convertedMonitorCount = monitors.length - onceMonitors.length;
  if (
    onceMonitors.some(
      (monitor) => monitor.enabled || monitor.lastStatus === "running",
    )
  ) {
    return null;
  }

  const candidates = await database
    .select({ id: providerOfferCandidates.id })
    .from(providerOfferCandidates)
    .where(eq(providerOfferCandidates.scanId, scanId));
  const succeededOnce = onceMonitors.filter(
    (monitor) => monitor.lastStatus === "succeeded",
  ).length;
  const succeeded = succeededOnce + convertedMonitorCount;
  const failed = onceMonitors.length - succeededOnce;
  const acceptedCount = monitors.reduce(
    (total, monitor) =>
      total +
      summaryCounter(monitor.lastSummary, "created") +
      summaryCounter(monitor.lastSummary, "pending") +
      summaryCounter(monitor.lastSummary, "updated") +
      summaryCounter(monitor.lastSummary, "unchanged"),
    0,
  );
  const monitorErrors = uniqueMessages(
    onceMonitors
      .filter((monitor) => monitor.lastStatus === "failed")
      .map((monitor) => monitor.lastError),
  );
  const status =
    monitors.length === 0
      ? "partial"
      : deriveProviderCatalogScanTerminalStatus({
          succeeded,
          failed,
          acceptedCount,
          authFailure: monitorErrors.some((message) =>
            /(?:HTTP\s*(?:401|403)|需要登录|拒绝公开访问)/i.test(message),
          ),
        });
  const finishedAt = new Date();
  const warnings = uniqueMessages([
    ...(Array.isArray(scan.warnings) ? scan.warnings : []),
    ...monitorErrors.map((message) => `一次性采集源失败：${message}`),
    ...monitors.map(monitorDiagnostic),
    convertedMonitorCount > 0
      ? `${convertedMonitorCount} 个一次性采集源已由管理员转为定时采集`
      : null,
    monitors.length === 0
      ? "扫描生成的采集源已被删除，扫描按部分完成收尾"
      : null,
    succeeded > 0 && acceptedCount === 0
      ? "采集源运行成功，但没有生成可审核的套餐候选，请检查字段映射和质量门槛"
      : null,
    acceptedCount > 0 && candidates.length === 0
      ? `已识别 ${acceptedCount} 个有效套餐，但均匹配已有套餐，没有新增待审核候选`
      : null,
  ]);

  const [updated] = await database
    .update(providerCatalogScans)
    .set({
      status,
      progress: 100,
      currentStep: "completed",
      monitorCount: monitors.length,
      candidateCount: candidates.length,
      warnings,
      error:
        status === "failed" || status === "needs_auth"
          ? monitorErrors.join("\n") || "一次性采集源未能生成套餐候选"
          : null,
      finishedAt,
      updatedAt: finishedAt,
    })
    .where(
      and(
        eq(providerCatalogScans.id, scanId),
        inArray(providerCatalogScans.status, ["queued", "running"]),
      ),
    )
    .returning({
      id: providerCatalogScans.id,
      status: providerCatalogScans.status,
    });

  return updated ?? null;
}
