import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_HOSTS = new Set(["fwqgo.com", "www.fwqgo.com"]);
const DEFAULT_PUBLIC_ORIGIN = "https://fwqgo.com";
const DEFAULT_CMS_ORIGIN = "https://cms.fwqgo.com";
const AUTH_PAGES = new Set(["/login", "/signup"]);
const CMS_ROUTE_PREFIXES = [
  "/ai-rewrite",
  "/ai-tasks",
  "/collect",
  "/images",
  "/posts",
  "/seo",
  "/settings",
];
const CMS_HOST_ADMIN_PREFIXES = [...CMS_ROUTE_PREFIXES, "/servers"];
const CMS_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/verify-session",
  "/api/tags/search",
  "/api/upload",
]);

function normalizeHostname(host: string | null) {
  return (host ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function getCmsOrigin() {
  return (process.env.NEXT_PUBLIC_CMS_URL ?? DEFAULT_CMS_ORIGIN).replace(
    /\/+$/,
    "",
  );
}

function getPublicOrigin() {
  return (process.env.NEXT_PUBLIC_URL ?? DEFAULT_PUBLIC_ORIGIN).replace(
    /\/+$/,
    "",
  );
}

function isCmsHost(hostname: string) {
  try {
    return hostname === new URL(getCmsOrigin()).hostname;
  } catch {
    return hostname === "cms.fwqgo.com";
  }
}

function redirectToCms(request: NextRequest) {
  const target = new URL(request.nextUrl.pathname, getCmsOrigin());
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}

function redirectToPublic(request: NextRequest) {
  const target = new URL(request.nextUrl.pathname, getPublicOrigin());
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}

function isPublicContentPath(pathname: string) {
  return ["/fwq", "/en/fwq", "/go"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isCmsApiPath(pathname: string) {
  return (
    CMS_API_PATHS.has(pathname) || pathname.startsWith("/api/cms/")
  );
}

function getCmsBasicAuthConfig() {
  const username = process.env.CMS_BASIC_AUTH_USERNAME;
  const password = process.env.CMS_BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

function decodeBasicAuthCredentials(value: string) {
  try {
    const encoded = value.replace(/^Basic\s+/i, "");
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function unauthorizedBasicAuthResponse() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="fwqgo CMS", charset="UTF-8"',
    },
  });
}

function enforceCmsBasicAuth(request: NextRequest) {
  const config = getCmsBasicAuthConfig();

  if (!config) {
    return null;
  }

  const credentials = decodeBasicAuthCredentials(
    request.headers.get("authorization") ?? "",
  );

  if (
    credentials?.username === config.username &&
    credentials.password === config.password
  ) {
    return null;
  }

  return unauthorizedBasicAuthResponse();
}

function isCmsAdminPath(pathname: string) {
  return (
    pathname === "/" ||
    CMS_HOST_ADMIN_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ||
    pathname.startsWith("/api/cms/") ||
    pathname === "/api/tags/search" ||
    pathname === "/api/upload"
  );
}

function isPublicHostCmsPath(pathname: string) {
  return (
    AUTH_PAGES.has(pathname) ||
    CMS_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

export function proxy(request: NextRequest) {
  const sessionId = request.cookies.get("session_id")?.value;
  const pathname = request.nextUrl.pathname;
  const hostname = normalizeHostname(request.headers.get("host"));

  if (PUBLIC_HOSTS.has(hostname) && isPublicHostCmsPath(pathname)) {
    return redirectToCms(request);
  }

  if (
    PUBLIC_HOSTS.has(hostname) &&
    (CMS_API_PATHS.has(pathname) || pathname.startsWith("/api/cms/"))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isCmsHost(hostname)) {
    const basicAuthResponse = enforceCmsBasicAuth(request);

    if (basicAuthResponse) {
      return basicAuthResponse;
    }
  }

  if (isCmsHost(hostname) && isPublicContentPath(pathname)) {
    return redirectToPublic(request);
  }

  if (isCmsHost(hostname) && isCmsAdminPath(pathname)) {
    if (!sessionId) {
      if (isCmsApiPath(pathname)) {
        return NextResponse.json(
          { error: "未登录或登录已过期" },
          { status: 401 },
        );
      }

      return NextResponse.redirect(new URL("/login", request.url));
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-session-id", sessionId);
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/ai-rewrite/:path*",
    "/ai-tasks/:path*",
    "/collect/:path*",
    "/images/:path*",
    "/posts/:path*",
    "/seo/:path*",
    "/servers/:path*",
    "/settings/:path*",
    "/fwq/:path*",
    "/en/fwq/:path*",
    "/go/:path*",
    "/api/auth/:path*",
    "/api/cms/:path*",
    "/api/tags/search",
    "/api/upload",
  ],
};
