import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import {
  assertPublicHttpUrl,
  requirePublicHttpUrl,
} from "@fwqgo/core/network-url";
import { normalizeServerOfferBillingCycle } from "@fwqgo/core/server-offer-price";
import type { ProviderOfferCandidate } from "@/server/offers/provider-source-parser";
import { parseWhmcsBillingCyclePrices } from "@/server/offers/provider-source-parser";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const MAX_WHMCS_PRODUCT_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_WHMCS_PRODUCT_PAGE_CONCURRENCY = 8;

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function updateCookieJar(headers: Headers, cookieJar: Map<string, string>) {
  const values =
    (headers as HeadersWithSetCookie).getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);

  for (const value of values) {
    const pair = value.split(";", 1)[0]?.trim();
    const separator = pair?.indexOf("=") ?? -1;
    if (!pair || separator <= 0) continue;
    cookieJar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(cookieJar: Map<string, string>) {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function fetchWhmcsProductPage(input: {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  allowInterceptedDns?: boolean;
}) {
  const validateUrl = (value: string | URL, label: string) =>
    input.allowInterceptedDns
      ? Promise.resolve(requirePublicHttpUrl(value, label))
      : assertPublicHttpUrl(value, label);
  const initialUrl = await validateUrl(input.url, "WHMCS 产品配置地址");
  const initialOrigin = initialUrl.origin;
  const cookieJar = new Map<string, string>();
  const maxRedirects = input.maxRedirects ?? 3;
  const signal = AbortSignal.timeout(input.timeoutMs ?? 30_000);
  let currentUrl = initialUrl;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const headers = new Headers(input.headers);
    headers.set("Accept", "text/html,application/xhtml+xml");
    const cookies = cookieHeader(cookieJar);
    if (cookies) headers.set("Cookie", cookies);

    const response = await fetch(currentUrl, {
      headers,
      redirect: "manual",
      signal,
    });
    updateCookieJar(response.headers, cookieJar);

    if (redirectStatuses.has(response.status)) {
      if (redirectCount >= maxRedirects) {
        await response.body?.cancel();
        throw new Error("WHMCS 产品配置页跳转次数过多");
      }
      const location = response.headers.get("location");
      if (!location) {
        await response.body?.cancel();
        throw new Error("WHMCS 产品配置页跳转缺少 Location");
      }
      const nextUrl = await validateUrl(
        new URL(location, currentUrl),
        "WHMCS 产品配置跳转地址",
      );
      if (nextUrl.origin !== initialOrigin) {
        await response.body?.cancel();
        throw new Error("WHMCS 产品配置页跳转到了不同站点，已停止请求");
      }
      await response.body?.cancel();
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `WHMCS 产品配置页返回 HTTP ${response.status} ${response.statusText}`,
      );
    }

    const body = await readResponseTextWithLimit(
      response,
      MAX_WHMCS_PRODUCT_PAGE_BYTES,
    );
    if (body === null) throw new Error("WHMCS 产品配置页超过 2 MB 限制");
    return { body, finalUrl: currentUrl.toString() };
  }
}

function externalProductIdValue(externalProductId: string) {
  return externalProductId.replace(/^pid:/i, "").trim();
}

export function getWhmcsProductPageUrl(candidate: ProviderOfferCandidate) {
  const sourceUrl = new URL(candidate.sourceUrl);
  const raw = candidate.raw as {
    originalPurchaseUrl?: unknown;
    product?: { originalPurchaseUrl?: unknown };
  };
  const possibleUrls = [
    raw.product?.originalPurchaseUrl,
    raw.originalPurchaseUrl,
    candidate.purchaseUrl,
  ];

  for (const value of possibleUrls) {
    if (typeof value !== "string" || !value.trim()) continue;
    try {
      const url = new URL(value, sourceUrl);
      if (
        url.origin === sourceUrl.origin &&
        (url.searchParams.has("pid") || url.searchParams.get("a") === "add")
      ) {
        return url.toString();
      }
    } catch {
      // Fall back to a product URL derived from the stable product ID.
    }
  }

  const productId = externalProductIdValue(candidate.externalProductId);
  if (!productId) throw new Error("WHMCS 套餐缺少产品 ID");
  sourceUrl.pathname = sourceUrl.pathname.endsWith("cart.php")
    ? sourceUrl.pathname
    : "/cart.php";
  sourceUrl.search = "";
  sourceUrl.searchParams.set("a", "add");
  sourceUrl.searchParams.set("pid", productId);
  return sourceUrl.toString();
}

function mergeFallbackPrices(
  current: ProviderOfferCandidate["prices"],
  previous: ProviderOfferCandidate["prices"] | undefined,
) {
  const merged = new Map<string, ProviderOfferCandidate["prices"][number]>();
  for (const price of [...current, ...(previous ?? [])]) {
    const key = `${normalizeServerOfferBillingCycle(price.billingCycle)}:${price.currency.trim().toUpperCase()}`;
    if (!merged.has(key)) merged.set(key, price);
  }
  return [...merged.values()];
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  work: (item: TItem) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item !== undefined) results[index] = await work(item);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export type WhmcsProductPriceEnrichmentIssue = {
  externalProductId: string;
  detailUrl: string | null;
  kind: "unavailable" | "failed";
  message: string;
};

export async function enrichWhmcsProductPrices(input: {
  candidates: ProviderOfferCandidate[];
  previousCandidates?: ReadonlyMap<string, ProviderOfferCandidate>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  concurrency?: number;
  allowInterceptedDns?: boolean;
  fetchProductPage?: typeof fetchWhmcsProductPage;
}) {
  const fetchProductPage = input.fetchProductPage ?? fetchWhmcsProductPage;
  const concurrency = Math.min(
    Math.max(input.concurrency ?? 3, 1),
    MAX_WHMCS_PRODUCT_PAGE_CONCURRENCY,
  );
  const issues: WhmcsProductPriceEnrichmentIssue[] = [];
  const candidates = await mapWithConcurrency(
    input.candidates,
    concurrency,
    async (candidate) => {
      let detailUrl: string | null = null;
      try {
        detailUrl = getWhmcsProductPageUrl(candidate);
        const page = await fetchProductPage({
          url: detailUrl,
          headers: input.headers,
          timeoutMs: input.timeoutMs,
          allowInterceptedDns: input.allowInterceptedDns,
        });
        const prices = parseWhmcsBillingCyclePrices({
          body: page.body,
          purchaseUrl: candidate.purchaseUrl,
          fallbackCurrency: candidate.prices[0]?.currency ?? "USD",
        });
        if (prices.length === 0) {
          issues.push({
            externalProductId: candidate.externalProductId,
            detailUrl,
            kind: "unavailable",
            message: "产品配置页没有可用付款周期",
          });
          return {
            ...candidate,
            prices: mergeFallbackPrices(
              candidate.prices,
              input.previousCandidates?.get(candidate.externalProductId)
                ?.prices,
            ),
          };
        }
        return {
          ...candidate,
          prices,
          raw: {
            ...candidate.raw,
            pricing: {
              sourceUrl: page.finalUrl,
              collectedAt: new Date().toISOString(),
            },
          },
        };
      } catch (error) {
        issues.push({
          externalProductId: candidate.externalProductId,
          detailUrl,
          kind: "failed",
          message: error instanceof Error ? error.message : "未知错误",
        });
        return {
          ...candidate,
          prices: mergeFallbackPrices(
            candidate.prices,
            input.previousCandidates?.get(candidate.externalProductId)?.prices,
          ),
        };
      }
    },
  );

  return { candidates, issues };
}
