/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
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

/** @type {import("next").NextConfig} */
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
  serverExternalPackages: ["re2-wasm", "undici"],
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
  // Preserve the server's request origin for internal rewrites. NextURL's
  // loopback normalization can otherwise turn them into external self-fetches.
  skipProxyUrlNormalize: true,
  experimental: {
    // Next 16.3's staged Flight responses can omit runtime slug dependencies.
    // Do not generalize page cache keys from that incomplete varyParams set:
    // different article URLs must keep their own client-side cache entries.
    varyParams: false,
    optimizePackageImports: ["lucide-react"],
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default config;
