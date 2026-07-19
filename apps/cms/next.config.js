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

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  distDir: "../../.next-cms",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
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
  // Keep an explicit Turbopack config while the legacy Webpack dev fallback remains available.
  turbopack: {},
  experimental: {
    optimizePackageImports: ["@next/font"],
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: [
          "**/.deploy/**",
          "**/.git/**",
          "**/.next/**",
          "**/.next-cms/**",
          "**/.next-web/**",
          "**/node_modules/**",
          "**/output/**",
        ],
      };
    }

    return config;
  },
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
};

export default config;
