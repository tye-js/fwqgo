/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

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

const publicArticleCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=0, s-maxage=900, stale-while-revalidate=86400",
  },
  {
    key: "CDN-Cache-Control",
    value: "public, max-age=900, stale-while-revalidate=86400",
  },
  {
    key: "Cloudflare-CDN-Cache-Control",
    value: "public, max-age=900, stale-while-revalidate=86400",
  },
];

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  distDir: "../../.next-web",
  // Dynamic article metadata must be present in the initial <head>. This
  // trades a small metadata lookup for reliable crawlers and audit tools.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        source: "/fwq/posts/:slug",
        missing: [
          { type: "header", key: "RSC" },
          { type: "header", key: "Next-Router-Prefetch" },
          { type: "header", key: "Next-Router-Segment-Prefetch" },
          { type: "header", key: "Next-Router-State-Tree" },
          { type: "query", key: "_rsc" },
        ],
        headers: publicArticleCacheHeaders,
      },
      {
        source: "/en/fwq/posts/:slug",
        missing: [
          { type: "header", key: "RSC" },
          { type: "header", key: "Next-Router-Prefetch" },
          { type: "header", key: "Next-Router-Segment-Prefetch" },
          { type: "header", key: "Next-Router-State-Tree" },
          { type: "query", key: "_rsc" },
        ],
        headers: publicArticleCacheHeaders,
      },
    ];
  },
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
  experimental: {
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
