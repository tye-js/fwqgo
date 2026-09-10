import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import {
  fetchPinnedHttpUrl,
  type PinnedHttpRequestInit,
} from "@fwqgo/core/pinned-http";

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "::",
  "::1",
]);

const blockedHostnameSuffixes = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
];

const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
const reservedIpv6 = new BlockList();
reservedIpv6.addSubnet("2001::", 23, "ipv6"); // Protocol assignments, including Teredo.
reservedIpv6.addSubnet("2001:db8::", 32, "ipv6");
reservedIpv6.addSubnet("2002::", 16, "ipv6"); // 6to4 can embed a private IPv4 address.
reservedIpv6.addSubnet("3fff::", 20, "ipv6");

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

type SafeFetchInit = PinnedHttpRequestInit & {
  maxRedirects?: number;
};

type ResolvedAddress = { address: string; family: number };

function normalizeHostname(hostname: string) {
  const lower = hostname.trim().toLowerCase().replace(/\.$/, "");
  return lower.startsWith("[") && lower.endsWith("]")
    ? lower.slice(1, -1)
    : lower;
}

function parseIpv4Address(address: string) {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
  });

  if (octets.some((value) => value === null)) return null;
  return octets as [number, number, number, number];
}

function isBlockedIpv4(address: string) {
  const octets = parseIpv4Address(address);
  if (!octets) return false;

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isBlockedIpv6(address: string) {
  // Binary subnet matching covers compressed, expanded and embedded IPv4
  // spellings, and excludes NAT64, local, mapped and other non-global ranges.
  return (
    !globalIpv6.check(address, "ipv6") || reservedIpv6.check(address, "ipv6")
  );
}

export function isBlockedNetworkHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return true;
  if (blockedHostnames.has(normalized)) return true;
  if (blockedHostnameSuffixes.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  if (!normalized.includes(".") && !normalized.includes(":")) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isBlockedIpv4(normalized);
  if (ipVersion === 6) return isBlockedIpv6(normalized);

  return false;
}

export function parsePublicHttpUrl(value: string, baseUrl?: string | URL) {
  let url: URL;
  try {
    url = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  if (isBlockedNetworkHostname(url.hostname)) {
    return null;
  }

  return url;
}

export function isPublicHttpUrl(value: string) {
  return parsePublicHttpUrl(value) !== null;
}

export function requirePublicHttpUrl(
  value: string | URL,
  label = "URL",
  baseUrl?: string | URL,
) {
  const url = parsePublicHttpUrl(value.toString(), baseUrl);
  if (!url) {
    throw new Error(
      `${label} 不安全或格式不正确：只允许公网 http/https 地址，不能使用 localhost、内网 IP 或保留地址`,
    );
  }

  return url;
}

async function resolvePublicAddresses(url: URL, label: string) {
  const hostname = normalizeHostname(url.hostname);
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];

  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(
      `${label} 域名解析失败：${
        error instanceof Error ? error.message : "未知错误"
      }`,
    );
  }

  if (addresses.length === 0) {
    throw new Error(`${label} 域名没有可用解析记录`);
  }

  const blockedAddress = addresses.find((item) =>
    item.family === 4
      ? isBlockedIpv4(item.address)
      : item.family === 6
        ? isBlockedIpv6(item.address)
        : true,
  );

  if (blockedAddress) {
    throw new Error(
      `${label} 解析到了非公网地址 ${blockedAddress.address}，已阻止请求`,
    );
  }

  return addresses;
}

export async function assertPublicHttpUrl(
  value: string | URL,
  label = "URL",
  baseUrl?: string | URL,
) {
  const url = requirePublicHttpUrl(value, label, baseUrl);
  await resolvePublicAddresses(url, label);
  return url;
}

function getRedirectUrl(response: Response, currentUrl: URL, label: string) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`${label} 返回了跳转状态但缺少 Location 响应头`);
  }

  return new URL(location, currentUrl);
}

function getRequestHeadersForUrl(
  headers: HeadersInit | undefined,
  currentUrl: URL,
  initialOrigin: string,
) {
  const result = new Headers(headers);
  if (currentUrl.origin !== initialOrigin) {
    for (const name of [
      "authorization",
      "cookie",
      "proxy-authorization",
      "x-api-key",
    ]) {
      result.delete(name);
    }
  }
  return result;
}

export async function fetchPublicHttpUrlOnce(
  value: string | URL,
  init: PinnedHttpRequestInit = {},
  label = "URL",
  initialOrigin?: string,
) {
  const url = requirePublicHttpUrl(value, label);
  const addresses = await resolvePublicAddresses(url, label);
  return fetchPinnedHttpUrl(url, addresses, {
    ...init,
    headers: getRequestHeadersForUrl(
      init.headers,
      url,
      initialOrigin ?? url.origin,
    ),
    redirect: "manual",
  });
}

export async function fetchPublicHttpUrl(
  value: string | URL,
  init: SafeFetchInit = {},
  label = "URL",
) {
  const { maxRedirects = 5, ...fetchInit } = init;
  let url = requirePublicHttpUrl(value, label);
  const initialOrigin = url.origin;

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const response = await fetchPublicHttpUrlOnce(
      url,
      fetchInit,
      label,
      initialOrigin,
    );

    if (!redirectStatuses.has(response.status)) {
      return response;
    }

    if (redirectCount >= maxRedirects) {
      await response.body?.cancel();
      throw new Error(`${label} 跳转次数过多，已停止请求`);
    }

    try {
      url = requirePublicHttpUrl(
        getRedirectUrl(response, url, label),
        `${label} 跳转地址`,
      );
    } finally {
      await response.body?.cancel();
    }
  }

  throw new Error(`${label} 跳转次数过多，已停止请求`);
}
