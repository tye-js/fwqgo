import { after } from "next/server";

import { db } from "@fwqgo/db";
import { adminAuditLogs } from "@fwqgo/db/schema";
import { structuredLog } from "@fwqgo/core/structured-log";

const SENSITIVE_KEY = /password|secret|token|api.?key|authorization|cookie/i;

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeMetadata(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeMetadata(item, depth + 1),
        ]),
    );
  }
  if (typeof value === "string" && value.length > 2_000) {
    return `${value.slice(0, 2_000)}...`;
  }
  return value;
}

export type AdminAuditEvent = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  status: "success" | "failure";
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  error?: string | null;
};

export async function writeAdminAuditLog(event: AdminAuditEvent) {
  const requestId = event.requestId?.trim().slice(0, 120);
  // 不需要 `.returning()`：调用方从来不用插入结果，白白多回传一行。
  await db.insert(adminAuditLogs).values({
    actorId: event.actorId,
    action: event.action.trim().slice(0, 160),
    entityType: event.entityType.trim().slice(0, 80),
    entityId:
      event.entityId === null || event.entityId === undefined
        ? null
        : String(event.entityId).slice(0, 160),
    status: event.status,
    requestId: requestId ?? null,
    metadata: event.metadata
      ? (sanitizeMetadata(event.metadata) as Record<string, unknown>)
      : null,
    error: event.error?.slice(0, 5_000) ?? null,
  });
}

export async function recordAdminAuditLogSafely(event: AdminAuditEvent) {
  try {
    await writeAdminAuditLog(event);
  } catch (error) {
    structuredLog("error", "admin.audit_log_failed", {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      status: event.status,
      error,
    });
  }
}

/**
 * 把审计写入挪到**响应之后**执行。
 *
 * ## 为什么
 *
 * 原来 `defineAdminAction` / `withAdminAudit` 都是 `await recordAdminAuditLogSafely(...)`
 * 再返回响应，等于每个写操作都被加一跳串行的 `INSERT INTO admin_audit_logs`
 * （实测均值 2.32 ms）。审计本身不参与业务结果，也没人会去看它的返回值 —— 没理由占请求路径。
 *
 * ## 为什么需要 try/catch
 *
 * `after()` **在请求作用域之外会直接抛**
 * （`after was called outside a request scope`），而且回调不会执行。
 * 实测确认过这一点。会走到这条路的场景：单测里直接调 action、脚本 / worker 里调。
 * 这时退化成「不等待的写入」—— 仍然写，只是不阻塞调用方。
 */
export function scheduleAdminAuditLog(event: AdminAuditEvent) {
  try {
    after(() => recordAdminAuditLogSafely(event));
  } catch {
    void recordAdminAuditLogSafely(event);
  }
}
