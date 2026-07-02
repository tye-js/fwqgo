import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

function getCmsOrigin() {
  return (process.env.NEXT_PUBLIC_CMS_URL ?? DEFAULT_CMS_ORIGIN).replace(
    /\/+$/,
    "",
  );
}

function redirectToCms(request: NextRequest) {
  const target = new URL(request.nextUrl.pathname, getCmsOrigin());
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    AUTH_PAGES.has(pathname) ||
    CMS_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return redirectToCms(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/ai-rewrite/:path*",
    "/ai-tasks/:path*",
    "/collect/:path*",
    "/images/:path*",
    "/posts/:path*",
    "/seo/:path*",
    "/settings/:path*",
  ],
};
