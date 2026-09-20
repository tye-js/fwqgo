/**
 * Database-free verification builds may set SKIP_ENV_VALIDATION=1.
 * Production release builds and runtime starts must validate their environment.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";
import { getSecurityHeaders } from "../../packages/core/security-headers.mjs";

const appDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(/* turbopackIgnore: true */ appDir, "../..");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(
  projectRoot,
  process.env.NODE_ENV !== "production",
  console,
  true,
);
await import("../../src/env.js");

/**
 * Next 16.3.5 reads `experimental.trustHostHeader` at runtime
 * (`next/dist/esm/server/lib/router-utils/resolve-routes.js`) but never
 * declares it in `ExperimentalConfig`, so widen the annotation here instead of
 * casting at the call site.
 *
 * @type {import("next").NextConfig & {
 *   experimental?: import("next").NextConfig["experimental"] & {
 *     trustHostHeader?: boolean;
 *   };
 * }}
 */
const config = {
  // Public article s-maxage=900 is applied only by the verified outer proxy.
  // Cloudflare-CDN-Cache-Control is also set only by that outer proxy.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders({
          production: process.env.NODE_ENV === "production",
        }),
      },
    ];
  },
  output: "standalone",
  serverExternalPackages: ["re2js", "undici"],
  distDir: "../../.next-web",
  // Dynamic article metadata must be present in the initial <head>. This
  // trades a small metadata lookup for reliable crawlers and audit tools.
  htmlLimitedBots: /.*/,
  // Let Next.js set cache policy after resolving the response status.
  // Path-only headers also cache 404/5xx and must not be used for article HTML.
  images: {
    localPatterns: [
      {
        pathname: "/api/images/source",
      },
      {
        pathname: "/_next/static/media/**",
        search: "",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fwqgo.com",
        pathname: "/uploads/**",
        port: "",
        search: "",
      },
    ],
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Next derives the `'use cache'` fill budget used during prerender as
  // `staticPageGenerationTimeout * 0.9`. The default 60s therefore aborts a
  // page whose cached reads take longer than 54s, which is reachable for
  // article routes that read several relations from a remote database before
  // the page cache is filled. Give the fill real headroom; this only bounds
  // how long a single page may take before the worker kills it.
  staticPageGenerationTimeout: 240,
  // Preserve the server's request origin for internal rewrites. NextURL's
  // loopback normalization can otherwise turn them into external self-fetches.
  skipProxyUrlNormalize: true,
  experimental: {
    // Next 16.3's staged Flight responses can omit runtime slug dependencies.
    // Do not generalize page cache keys from that incomplete varyParams set:
    // different article URLs must keep their own client-side cache entries.
    varyParams: false,
    optimizePackageImports: ["lucide-react"],
    // Redirects must keep the public host. Without this, Next builds the
    // request URL from `HOSTNAME:PORT` instead of the `Host` header
    // (`next/dist/esm/server/lib/router-utils/resolve-routes.js`), so every
    // 301 this app issues — canonical page numbers, post/category/tag slug
    // aliases from `public_slug_redirects` — sends `Location:
    // https://localhost:3000/...`, which no visitor can resolve. Nginx already
    // forwards `Host $host` (`fwqgo-proxy-headers.conf`), so trusting the
    // header yields `https://fwqgo.com/...`. Do not remove: the taxonomy slug
    // redirects depend on it.
    trustHostHeader: true,
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default config;
