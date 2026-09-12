/* eslint-disable @typescript-eslint/no-require-imports */

/** @type {typeof import("node:fs")} */
const fs = require("node:fs");
/** @type {typeof import("node:path")} */
const path = require("node:path");

/**
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce(
      /**
       * @param {Record<string, string>} env
       * @param {string} line
       */
      (env, line) => {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
          return env;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex === -1) {
          return env;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        env[key] = value;
        return env;
      },
      {},
    );
}

/**
 * Apply role-specific credentials when a deployment still uses the base URL
 * plus username/password fallback variables.
 *
 * @param {string} baseUrl
 * @param {string | undefined} username
 * @param {string | undefined} password
 * @returns {string}
 */
function withCredentials(baseUrl, username, password) {
  if (!baseUrl) return "";

  const url = new URL(baseUrl);
  if (username) url.username = username;
  if (password) url.password = password;
  return url.toString();
}

// Resolve precedence once; each role only receives its declared runtime keys.
const runtimeEnvironment = {
  ...parseEnvFile(path.join(__dirname, ".env.production")),
  ...process.env,
};
const sharedRuntimeKeys = [
  "NEXT_PUBLIC_URL",
  "NEXT_PUBLIC_CMS_URL",
  "WEB_REVALIDATION_SECRET",
  "WEB_REVALIDATION_URL",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_CACHE_PURGE_TOKEN",
  "DB_MAX_CONNECTIONS",
  "PUBLIC_ARTICLE_PRERENDER_LIMIT",
  "PUBLIC_ARTICLE_SLOW_LOG_MS",
  "PUBLIC_KNOWLEDGE_SLOW_LOG_MS",
];
const cmsRuntimeKeys = [
  "SECRET_ENCRYPTION_KEYS",
  "SECRET_ENCRYPTION_KEY",
  "SECRET_ENCRYPTION_ACTIVE_KEY_ID",
  "CMS_BASIC_AUTH_USERNAME",
  "CMS_BASIC_AUTH_PASSWORD",
  "AI_REWRITE_TIMEOUT_MS",
  "ADMIN_BACKGROUND_JOB_CONCURRENCY",
  "ADMIN_BACKGROUND_JOB_RETENTION_DAYS",
];
const configuredBun = runtimeEnvironment.BUN_BIN?.trim();
const bunInterpreter = configuredBun?.length
  ? configuredBun
  : path.join(__dirname, "bin", "bun");
const webAppDir =
  process.env.WEB_APP_DIR ?? path.join(__dirname, "apps", "web");
const cmsAppDir =
  process.env.CMS_APP_DIR ?? path.join(__dirname, "apps", "cms");

/**
 * @param {{ name: string; appDir: string; port: number; portEnvName: string; role: "web" | "cms" }} options
 */
function createApp({ name, appDir, port, portEnvName, role }) {
  const resolvedPort = runtimeEnvironment[portEnvName] ?? String(port);
  // Bun applications use one forked process per listening port.

  const primaryDatabaseUrl = runtimeEnvironment.DATABASE_URL ?? "";
  const readDatabaseUrl =
    runtimeEnvironment.READ_DATABASE_URL ??
    withCredentials(
      primaryDatabaseUrl,
      runtimeEnvironment.READ_USERNAME,
      runtimeEnvironment.READ_PASSWORD,
    );
  const writeDatabaseUrl =
    runtimeEnvironment.CMS_DATABASE_URL ??
    withCredentials(
      primaryDatabaseUrl,
      runtimeEnvironment.CMS_USERNAME,
      runtimeEnvironment.CMS_PASSWORD,
    );
  const analyticsDatabaseUrl = runtimeEnvironment.ANALYTICS_DATABASE_URL ?? "";
  if (
    !runtimeEnvironment.READ_DATABASE_URL &&
    !runtimeEnvironment.READ_USERNAME
  ) {
    throw new Error(
      "Production runtime requires READ_DATABASE_URL or READ_USERNAME",
    );
  }
  if (!analyticsDatabaseUrl) {
    throw new Error("Production runtime requires ANALYTICS_DATABASE_URL");
  }
  const roleDatabaseEnv =
    role === "web"
      ? {
          DATABASE_URL: readDatabaseUrl,
          READ_DATABASE_URL: readDatabaseUrl,
          ANALYTICS_DATABASE_URL: analyticsDatabaseUrl,
          CMS_DATABASE_URL: "",
          CMS_USERNAME: "",
          CMS_PASSWORD: "",
          READ_USERNAME: "",
          READ_PASSWORD: "",
        }
      : {
          DATABASE_URL: writeDatabaseUrl,
          CMS_DATABASE_URL: writeDatabaseUrl,
          READ_DATABASE_URL: readDatabaseUrl,
          ANALYTICS_DATABASE_URL: analyticsDatabaseUrl,
        };

  const runtimeEnv = {
    ...Object.fromEntries(
      sharedRuntimeKeys.map((key) => [key, runtimeEnvironment[key]]),
    ),
    // Explicit empty values also clear CMS secrets inherited from the launcher.
    ...Object.fromEntries(
      cmsRuntimeKeys.map((key) => [
        key,
        role === "cms" ? runtimeEnvironment[key] : "",
      ]),
    ),
    ENABLE_PUBLIC_SIGNUP:
      role === "cms"
        ? (runtimeEnvironment.ENABLE_PUBLIC_SIGNUP ?? "false")
        : "false",
    ENABLE_CMS_BACKGROUND_WORKERS:
      role === "cms"
        ? runtimeEnvironment.ENABLE_CMS_BACKGROUND_WORKERS
        : "false",
    ENABLE_BROWSER_SCRAPING:
      role === "cms"
        ? (runtimeEnvironment.ENABLE_BROWSER_SCRAPING ?? "false")
        : "false",
    TRUST_PROXY_HEADERS: runtimeEnvironment.TRUST_PROXY_HEADERS ?? "false",
    // This build-only escape hatch must never survive a PM2 start/restart.
    SKIP_ENV_VALIDATION: "",
    WEB_PORT: runtimeEnvironment.WEB_PORT ?? "3000",
    UPLOAD_DIR: runtimeEnvironment.UPLOAD_DIR ?? "/var/www/uploads",
    PORT: resolvedPort,
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    TZ: "UTC",
    RELEASE_ID: runtimeEnvironment.RELEASE_ID ?? "unknown",
    BUN_BIN: bunInterpreter,
  };

  return {
    name,
    cwd: appDir,
    script: path.join(appDir, "server.js"),
    interpreter: bunInterpreter,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    filter_env:
      role === "web"
        ? ["SECRET_ENCRYPTION_", "CMS_", "ENABLE_CMS_", ...cmsRuntimeKeys]
        : [],
    env: {
      ...runtimeEnv,
      ...roleDatabaseEnv,
    },
  };
}

module.exports = {
  apps: [
    createApp({
      name: "fwqgo-web",
      appDir: webAppDir,
      port: 3000,
      portEnvName: "WEB_PORT",
      role: "web",
    }),
    createApp({
      name: "fwqgo-cms",
      appDir: cmsAppDir,
      port: 3100,
      portEnvName: "CMS_PORT",
      role: "cms",
    }),
  ],
};
