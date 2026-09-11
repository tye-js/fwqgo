import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getPrimaryPublicRedirectUrl,
  isPublicHtmlRequest,
  parsePublicResourceRoute,
} from "@fwqgo/core/public-route-policy";
import {
  getKnowledgeIndexRewritePath,
  isKnowledgeIndexRenderPath,
} from "@fwqgo/core/knowledge-index";
import { resolvePublicResourcePath } from "@/server/seo/public-route-guard";

const DEFAULT_CMS_ORIGIN = "https://cms.fwqgo.com";
const CACHED_HOMEPAGE_PATHS = new Set(["/", "/en"]);
const ARTICLE_STATIC_SHELL_PATHS = new Set([
  "/fwq/posts/__fwqgo_article_static_shell__",
  "/en/fwq/posts/__fwqgo_article_static_shell__",
]);
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

function publicErrorResponse(request: NextRequest, status: 404 | 503) {
  const english = request.nextUrl.pathname.startsWith("/en/");
  const title =
    status === 404
      ? english
        ? "Page not found"
        : "页面不存在"
      : english
        ? "Temporarily unavailable"
        : "暂时无法访问";
  const description =
    status === 404
      ? english
        ? "This page is unavailable or has been removed."
        : "这个页面不存在，或内容已移除。"
      : english
        ? "Please try again shortly."
        : "请稍后重试。";
  return new NextResponse(
    request.method === "HEAD"
      ? null
      : `<!doctype html><html lang="${english ? "en" : "zh-CN"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} - fwqgo</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#fafafa;color:#18181b"><main style="max-width:44rem;margin:auto;padding:12vh 1.5rem;overflow-wrap:anywhere"><p>${status}</p><h1>${title}</h1><p>${description}</p><a style="display:inline-flex;align-items:center;min-height:44px;color:#4338ca" href="${english ? "/en" : "/"}">${english ? "Back to home" : "返回首页"}</a></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Cloudflare-CDN-Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        ...(status === 503 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}

export async function proxy(request: NextRequest) {
  const primaryRedirect = getPrimaryPublicRedirectUrl(request);
  if (primaryRedirect) return NextResponse.redirect(primaryRedirect, 301);

  if (isKnowledgeIndexRenderPath(request.nextUrl.pathname)) {
    return publicErrorResponse(request, 404);
  }

  if (ARTICLE_STATIC_SHELL_PATHS.has(request.nextUrl.pathname)) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Cloudflare-CDN-Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const pathname = request.nextUrl.pathname;

  if (
    AUTH_PAGES.has(pathname) ||
    CMS_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return redirectToCms(request);
  }

  if (request.method === "GET" || request.method === "HEAD") {
    if (
      CACHED_HOMEPAGE_PATHS.has(pathname) &&
      !isPublicHtmlRequest(request)
    ) {
      // Static homepage documents must not share their policy with Flight,
      // prefetches, queries, or requests carrying authentication state.
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("CDN-Cache-Control", "no-store");
      response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
      return response;
    }

    const knowledgeRenderPath = getKnowledgeIndexRewritePath(request.nextUrl);
    if (knowledgeRenderPath) {
      // NextURL normalizes loopback hostnames to localhost. Keep the original
      // origin so this stays an internal rewrite and does not re-enter proxy.
      const target = new URL(request.url);
      target.pathname = knowledgeRenderPath;
      const response = NextResponse.rewrite(target);
      // Next.js determines the final successful HTML policy. Never attach a
      // positive CDN policy before the downstream response status is known.
      if (!isPublicHtmlRequest(request)) {
        response.headers.set("Cache-Control", "private, no-store, max-age=0");
        response.headers.set("CDN-Cache-Control", "no-store");
        response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
      } else {
        // The outer proxy must still validate the final status, content type
        // and absence of Set-Cookie before applying a shared HTML policy.
        response.headers.set("X-Fwqgo-Cacheable-Knowledge", "1");
      }
      return response;
    }

    const route = parsePublicResourceRoute(pathname);
    if (route === null) return publicErrorResponse(request, 404);
    if (route) {
      const startedAt = performance.now();
      try {
        const canonicalPath = await resolvePublicResourcePath(route);
        if (!canonicalPath) return publicErrorResponse(request, 404);
        if (canonicalPath !== pathname) {
          const target = request.nextUrl.clone();
          target.pathname = canonicalPath;
          return NextResponse.redirect(target, 301);
        }
        const response = NextResponse.next();
        if (!isPublicHtmlRequest(request)) {
          response.headers.set("Cache-Control", "private, no-store, max-age=0");
          response.headers.set("CDN-Cache-Control", "no-store");
          response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
        } else if (route.kind === "post") {
          // This is eligibility, not a cache policy. The outer proxy must also
          // verify final status 200, HTML content type and no Set-Cookie.
          response.headers.set("X-Fwqgo-Cacheable-Article", "1");
        }
        response.headers.set(
          "Server-Timing",
          `resource;dur=${Math.round(performance.now() - startedAt)}`,
        );
        return response;
      } catch (error) {
        console.error("Public resource validation failed", {
          kind: route.kind,
          pathname,
          error,
        });
        return publicErrorResponse(request, 503);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/:path*",
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
