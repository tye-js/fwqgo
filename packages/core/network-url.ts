import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

type SafeFetchInit = RequestInit & {
  maxRedirects?: number;
};

function normalizeHostname(hostname: string) {
  const lower = hostname.trim().toLowerCase();
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

function getFirstIpv6Group(address: string) {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  const firstGroup = normalized.split(":").find((part) => part.length > 0);
  if (!firstGroup || !/^[0-9a-f]{1,4}$/.test(firstGroup)) {
    return null;
  }

  return Number.parseInt(firstGroup, 16);
}

function getMappedIpv4Address(address: string) {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  const match = /(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  return match?.[1] ?? null;
}

function isBlockedIpv6(address: string) {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  const mappedIpv4 = getMappedIpv4Address(normalized);
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4);

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:0" ||
    normalized === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

  const firstGroup = getFirstIpv6Group(normalized);
  if (firstGroup === null) return false;

  return (
    (firstGroup & 0xfe00) === 0xfc00 ||
    (firstGroup & 0xffc0) === 0xfe80 ||
    (firstGroup & 0xff00) === 0xff00 ||
    (firstGroup >= 0x2001 &&
      firstGroup <= 0x2001 &&
      normalized.startsWith("2001:db8"))
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

async function assertResolvedToPublicAddress(url: URL, label: string) {
  const hostname = normalizeHostname(url.hostname);
  if (isIP(hostname)) return;

  let addresses: Array<{ address: string; family: number }>;
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
}

export async function assertPublicHttpUrl(
  value: string | URL,
  label = "URL",
  baseUrl?: string | URL,
) {
  const url = requirePublicHttpUrl(value, label, baseUrl);
  await assertResolvedToPublicAddress(url, label);
  return url;
}

function getRedirectUrl(response: Response, currentUrl: URL, label: string) {
  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`${label} 返回了跳转状态但缺少 Location 响应头`);
  }

  return new URL(location, currentUrl);
}

export async function fetchPublicHttpUrl(
  value: string | URL,
  init: SafeFetchInit = {},
  label = "URL",
) {
  const { maxRedirects = 5, ...fetchInit } = init;
  let url = await assertPublicHttpUrl(value, label);

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const response = await fetch(url, {
      ...fetchInit,
      redirect: "manual",
    });

    if (!redirectStatuses.has(response.status)) {
      return response;
    }

    if (redirectCount >= maxRedirects) {
      await response.body?.cancel();
      throw new Error(`${label} 跳转次数过多，已停止请求`);
    }

    const nextUrl = getRedirectUrl(response, url, label);
    await response.body?.cancel();
    url = await assertPublicHttpUrl(nextUrl, `${label} 跳转地址`);
  }

  throw new Error(`${label} 跳转次数过多，已停止请求`);
}
