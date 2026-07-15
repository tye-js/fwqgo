import "server-only";

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
  const explicit = process.env.WEB_REVALIDATION_URL?.trim();
  if (explicit) return explicit;
  const configuredPort = process.env.WEB_PORT?.trim();
  if (!configuredPort) {
    return "http://127.0.0.1:3000/api/internal/revalidate";
  }
  return `http://127.0.0.1:${configuredPort}/api/internal/revalidate`;
}

export async function notifyPublicWebCache(
  event: PublicCacheEvent,
  payload: PublicCacheEventPayload = {},
) {
  const secret = process.env.WEB_REVALIDATION_SECRET?.trim();
  if (!secret) {
    const reason = "WEB_REVALIDATION_SECRET 未配置，Web 缓存将等待时间策略刷新";
    if (process.env.NODE_ENV === "production") console.warn(reason);
    return { delivered: false, attempts: 0, reason };
  }

  const url = getWebRevalidationUrl();
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

  console.error(`Web 缓存刷新失败（${event}）：${lastError}`);
  return { delivered: false, attempts: MAX_ATTEMPTS, reason: lastError };
}
