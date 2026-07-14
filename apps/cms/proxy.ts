import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getCmsSessionId } from "@fwqgo/auth/session-cookie";

const PUBLIC_CONTENT_PREFIXES = ["/fwq", "/en/fwq", "/go"];
const ADMIN_PAGE_PREFIXES = [
  "/ai-rewrite",
  "/ai-tasks",
  "/collect",
  "/images",
  "/posts",
  "/seo",
  "/servers",
  "/settings",
];
const PROTECTED_API_PATHS = new Set(["/api/tags/search", "/api/upload"]);
const DEFAULT_PUBLIC_ORIGIN = "https://fwqgo.com";

function getPublicOrigin() {
  return (process.env.NEXT_PUBLIC_URL ?? DEFAULT_PUBLIC_ORIGIN).replace(
    /\/+$/,
    "",
  );
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
  return withPrivateNoStore(
    new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="fwqgo CMS", charset="UTF-8"',
      },
    }),
  );
}

function withPrivateNoStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function enforceCmsBasicAuth(request: NextRequest) {
  const username = process.env.CMS_BASIC_AUTH_USERNAME;
  const password = process.env.CMS_BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return null;
  }

  const credentials = decodeBasicAuthCredentials(
    request.headers.get("authorization") ?? "",
  );

  if (credentials?.username === username && credentials.password === password) {
    return null;
  }

  return unauthorizedBasicAuthResponse();
}

function redirectToPublic(request: NextRequest) {
  const target = new URL(request.nextUrl.pathname, getPublicOrigin());
  target.search = request.nextUrl.search;
  return withPrivateNoStore(NextResponse.redirect(target));
}

function isPublicContentPath(pathname: string) {
  return PUBLIC_CONTENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedCmsApiPath(pathname: string) {
  return PROTECTED_API_PATHS.has(pathname) || pathname.startsWith("/api/cms/");
}

function isProtectedCmsPath(pathname: string) {
  return (
    pathname === "/" ||
    ADMIN_PAGE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ||
    PROTECTED_API_PATHS.has(pathname) ||
    pathname.startsWith("/api/cms/")
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const basicAuthResponse = enforceCmsBasicAuth(request);

  if (basicAuthResponse) {
    return basicAuthResponse;
  }

  if (isPublicContentPath(pathname)) {
    return redirectToPublic(request);
  }

  if (isProtectedCmsPath(pathname)) {
    const sessionId = getCmsSessionId(request.cookies);

    if (!sessionId) {
      if (isProtectedCmsApiPath(pathname)) {
        return withPrivateNoStore(
          NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 }),
        );
      }

      return withPrivateNoStore(
        NextResponse.redirect(new URL("/login", request.url)),
      );
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-session-id", sessionId);
    return withPrivateNoStore(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
    );
  }

  return withPrivateNoStore(NextResponse.next());
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
