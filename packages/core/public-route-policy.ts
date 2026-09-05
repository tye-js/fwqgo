import { parsePublicPageNumber } from "./public-content-policy";

export type PublicLanguage = "zh" | "en";
export const PUBLIC_SERVER_TOPIC_SLUGS = [
  "hong-kong",
  "united-states",
  "cheap-vps",
] as const;
export type PublicResourceRoute =
  | { kind: "post" | "knowledge"; language: PublicLanguage; slug: string }
  | { kind: "archive"; language: PublicLanguage; page: number }
  | {
      kind: "category" | "tag";
      language: PublicLanguage;
      slug: string;
      page: number;
    }
  | {
      kind: "provider" | "region" | "line" | "server_topic";
      language: "zh";
      slug: string;
    };

function decodeSegment(segment: string) {
  try {
    const value = decodeURIComponent(segment);
    return value &&
      !/[\u0000-\u001f\u007f/?#\\]/.test(value) &&
      value.trim() === value
      ? value
      : null;
  } catch {
    return null;
  }
}

/** null is an invalid resource URL; undefined is outside the guarded routes. */
export function parsePublicResourceRoute(
  pathname: string,
): PublicResourceRoute | null | undefined {
  const language = pathname.startsWith("/en/") ? "en" : "zh";
  const path = language === "en" ? pathname.slice(3) : pathname;
  let match = /^\/(fwq\/posts|knowledge)\/([^/]+)$/.exec(path);
  if (match) {
    const slug = decodeSegment(match[2]!);
    return slug
      ? {
          kind: match[1] === "knowledge" ? "knowledge" : "post",
          language,
          slug,
        }
      : null;
  }
  match = /^\/fwq\/page\/([^/]+)$/.exec(path);
  if (match) {
    const page = parsePublicPageNumber(match[1]);
    return page ? { kind: "archive", language, page: page.value } : null;
  }
  match = /^\/fwq\/(tags\/)?([^/]+)\/page\/([^/]+)$/.exec(path);
  if (match) {
    const slug = decodeSegment(match[2]!);
    const page = parsePublicPageNumber(match[3]);
    return slug && page
      ? {
          kind: match[1] ? "tag" : "category",
          language,
          slug,
          page: page.value,
        }
      : null;
  }
  match = /^\/servers\/(providers|regions|lines)\/([^/]+)$/.exec(path);
  if (match && language === "zh") {
    const slug = decodeSegment(match[2]!);
    const kind =
      match[1] === "providers"
        ? "provider"
        : match[1] === "regions"
          ? "region"
          : "line";
    return slug ? { kind, language, slug } : null;
  }
  match = /^\/servers\/([^/]+)$/.exec(path);
  if (match && language === "zh") {
    const slug = decodeSegment(match[1]!);
    return slug ? { kind: "server_topic", language, slug } : null;
  }
  return undefined;
}

export function publicResourcePath(route: PublicResourceRoute) {
  const prefix = route.language === "en" ? "/en" : "";
  if (route.kind === "archive") return `${prefix}/fwq/page/${route.page}`;
  const slug = encodeURIComponent(route.slug);
  switch (route.kind) {
    case "post":
      return `${prefix}/fwq/posts/${slug}`;
    case "knowledge":
      return `${prefix}/knowledge/${slug}`;
    case "category":
      return `${prefix}/fwq/${slug}/page/${route.page}`;
    case "tag":
      return `${prefix}/fwq/tags/${slug}/page/${route.page}`;
    case "provider":
      return `/servers/providers/${slug}`;
    case "region":
      return `/servers/regions/${slug}`;
    case "line":
      return `/servers/lines/${slug}`;
    case "server_topic":
      return `/servers/${slug}`;
  }
}

export function isPublicHtmlRequest(request: {
  method: string;
  headers: Headers;
  url: string;
}) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (new URL(request.url).search) return false;
  if (request.headers.has("cookie") || request.headers.has("authorization"))
    return false;
  return ![
    "rsc",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-router-state-tree",
  ].some((name) => request.headers.has(name));
}

/** Reverse proxies may replace the URL host while preserving the original host. */
export function getPrimaryPublicRedirectUrl(request: {
  url: string;
  headers: Headers;
}) {
  const source = new URL(request.url);
  const hosts = [
    source.hostname,
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  ]
    .filter((host): host is string => Boolean(host))
    .map((host) =>
      host.split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, ""),
    );
  if (!hosts.includes("www.fwqgo.com")) return null;
  const target = new URL("https://fwqgo.com");
  target.pathname = source.pathname;
  target.search = source.search;
  return target;
}
