import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_CMS_ORIGIN = "https://cms.fwqgo.com";
const AUTH_PAGES = new Set(["/login", "/signup"]);

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

  if (pathname.startsWith("/end") || AUTH_PAGES.has(pathname)) {
    return redirectToCms(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/signup", "/end/:path*"],
};
