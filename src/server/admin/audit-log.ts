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
  const [row] = await db
    .insert(adminAuditLogs)
    .values({
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
    })
    .returning({ id: adminAuditLogs.id });

  return row ?? null;
}

export async function recordAdminAuditLogSafely(event: AdminAuditEvent) {
  try {
    return await writeAdminAuditLog(event);
  } catch (error) {
    structuredLog("error", "admin.audit_log_failed", {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      status: event.status,
      error,
    });
    return null;
  }
}
