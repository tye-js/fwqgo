import "server-only";
import { after } from "next/server";
import { chunkPublicCacheEventPayload } from "@fwqgo/cache/public-cache-event-payload";
import { resolveWebRevalidationUrl } from "@fwqgo/core/web-revalidation-url";

import type {
  PublicCacheEvent,
  PublicCacheEventPayload,
} from "@fwqgo/cache/tags";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 5_000;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function getWebRevalidationUrl() {
  return resolveWebRevalidationUrl(process.env);
}

type DeliveryResult = {
  delivered: boolean;
  attempts: number;
  reason: string | null;
};

async function deliverPublicCacheEvent(
  url: string,
  secret: string,
  event: PublicCacheEvent,
  payload: PublicCacheEventPayload,
): Promise<DeliveryResult> {
  let lastError = "未知错误";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event, payload }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        return { delivered: true, attempts: attempt, reason: null };
      }
      const body = (await response.text()).slice(0, 500);
      lastError = `HTTP ${response.status}${body ? `：${body}` : ""}`;
      if (response.status >= 400 && response.status < 500) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "网络请求失败";
    }
    if (attempt < MAX_ATTEMPTS) await wait(250 * attempt);
  }

  return { delivered: false, attempts: MAX_ATTEMPTS, reason: lastError };
}

export async function notifyPublicWebCache(
  event: PublicCacheEvent,
  payload: PublicCacheEventPayload = {},
): Promise<DeliveryResult> {
  const secret = process.env.WEB_REVALIDATION_SECRET?.trim();
  if (!secret) {
    const reason = "WEB_REVALIDATION_SECRET 未配置，Web 缓存将等待时间策略刷新";
    if (process.env.NODE_ENV === "production") console.warn(reason);
    return { delivered: false, attempts: 0, reason };
  }

  const url = getWebRevalidationUrl();
  // 批量操作很容易超过接收端的字段上限（接收端超限直接 400，而 4xx 不重试），
  // 因此在这里按上限分片，保证任何规模的批量操作都能真正刷新公网缓存。
  const chunks = chunkPublicCacheEventPayload(payload);
  const results = await Promise.all(
    chunks.map((chunk) => deliverPublicCacheEvent(url, secret, event, chunk)),
  );
  const attempts = Math.max(...results.map((result) => result.attempts));

  const failedCount = results.filter((result) => !result.delivered).length;
  if (failedCount === 0) {
    return { delivered: true, attempts, reason: null };
  }

  const reason = results.find((result) => !result.delivered)?.reason ?? "未知错误";
  const chunkNote =
    chunks.length > 1
      ? `（共 ${chunks.length} 个分片，${failedCount} 个失败）`
      : "";
  console.error(`Web 缓存刷新失败（${event}）：${reason}${chunkNote}`);
  return { delivered: false, attempts, reason };
}

export function schedulePublicWebCache(
  event: PublicCacheEvent,
  payload: PublicCacheEventPayload = {},
) {
  try {
    after(() => notifyPublicWebCache(event, payload));
  } catch {
    // Background workers do not have a Next.js request scope for after().
    void notifyPublicWebCache(event, payload).catch((error) => {
      console.error(`Web 缓存异步刷新失败（${event}）：`, error);
    });
  }
}
