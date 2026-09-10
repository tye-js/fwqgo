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

const productionEnv = parseEnvFile(path.join(__dirname, ".env.production"));
const bunInterpreter = process.env.BUN_BIN ?? productionEnv.BUN_BIN ?? "";
const useBun = Boolean(bunInterpreter);
const webAppDir =
  process.env.WEB_APP_DIR ?? process.env.APP_DIR ?? path.join(__dirname, "web");
const cmsAppDir =
  process.env.CMS_APP_DIR ?? process.env.APP_DIR ?? path.join(__dirname, "cms");

/**
 * @param {string | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * @param {{ name: string; appDir: string; port: number; portEnvName: string; instancesEnvName: string; defaultInstances: number; role: "web" | "cms" }} options
 */
function createApp({
  name,
  appDir,
  port,
  portEnvName,
  instancesEnvName,
  defaultInstances,
  role,
}) {
  const resolvedPort =
    process.env[portEnvName] ?? productionEnv[portEnvName] ?? String(port);
  const requestedInstances = parsePositiveInteger(
    process.env[instancesEnvName] ?? productionEnv[instancesEnvName],
    defaultInstances,
  );
  // PM2 cluster mode is implemented through Node's cluster primary process.
  // Bun releases therefore use one forked process so the configured interpreter
  // is the actual runtime and both apps keep their single listening port.
  const instances = useBun ? 1 : requestedInstances;

  const primaryDatabaseUrl =
    process.env.DATABASE_URL ?? productionEnv.DATABASE_URL ?? "";
  const readDatabaseUrl =
    process.env.READ_DATABASE_URL ??
    productionEnv.READ_DATABASE_URL ??
    withCredentials(
      primaryDatabaseUrl,
      process.env.READ_USERNAME ?? productionEnv.READ_USERNAME,
      process.env.READ_PASSWORD ?? productionEnv.READ_PASSWORD,
    );
  const writeDatabaseUrl =
    process.env.CMS_DATABASE_URL ??
    productionEnv.CMS_DATABASE_URL ??
    withCredentials(
      process.env.DATABASE_URL ?? productionEnv.DATABASE_URL ?? "",
      process.env.CMS_USERNAME ?? productionEnv.CMS_USERNAME,
      process.env.CMS_PASSWORD ?? productionEnv.CMS_PASSWORD,
    );
  const analyticsDatabaseUrl =
    process.env.ANALYTICS_DATABASE_URL ??
    productionEnv.ANALYTICS_DATABASE_URL ??
    "";
  if (
    !process.env.READ_DATABASE_URL &&
    !productionEnv.READ_DATABASE_URL &&
    !process.env.READ_USERNAME &&
    !productionEnv.READ_USERNAME
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

  /** @type {Record<string, string | undefined>} */
  const sharedRuntimeEnv = {
    NEXT_PUBLIC_URL:
      process.env.NEXT_PUBLIC_URL ?? productionEnv.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_CMS_URL:
      process.env.NEXT_PUBLIC_CMS_URL ?? productionEnv.NEXT_PUBLIC_CMS_URL,
    WEB_REVALIDATION_SECRET:
      process.env.WEB_REVALIDATION_SECRET ??
      productionEnv.WEB_REVALIDATION_SECRET,
    WEB_REVALIDATION_URL:
      process.env.WEB_REVALIDATION_URL ?? productionEnv.WEB_REVALIDATION_URL,
    // Empty values also override secrets inherited from the PM2 launcher.
    SECRET_ENCRYPTION_KEYS: "",
    SECRET_ENCRYPTION_KEY: "",
    SECRET_ENCRYPTION_ACTIVE_KEY_ID: "",
    CMS_BASIC_AUTH_USERNAME: "",
    CMS_BASIC_AUTH_PASSWORD: "",
    ENABLE_PUBLIC_SIGNUP: "false",
    CLOUDFLARE_ZONE_ID:
      process.env.CLOUDFLARE_ZONE_ID ?? productionEnv.CLOUDFLARE_ZONE_ID,
    CLOUDFLARE_CACHE_PURGE_TOKEN:
      process.env.CLOUDFLARE_CACHE_PURGE_TOKEN ??
      productionEnv.CLOUDFLARE_CACHE_PURGE_TOKEN,
    ENABLE_CMS_BACKGROUND_WORKERS: "false",
    TRUST_PROXY_HEADERS:
      process.env.TRUST_PROXY_HEADERS ??
      productionEnv.TRUST_PROXY_HEADERS ??
      "false",
    ENABLE_BROWSER_SCRAPING: "false",
    WEB_PORT: process.env.WEB_PORT ?? productionEnv.WEB_PORT ?? "3000",
    DB_MAX_CONNECTIONS:
      process.env.DB_MAX_CONNECTIONS ?? productionEnv.DB_MAX_CONNECTIONS,
    PUBLIC_ARTICLE_PRERENDER_LIMIT:
      process.env.PUBLIC_ARTICLE_PRERENDER_LIMIT ??
      productionEnv.PUBLIC_ARTICLE_PRERENDER_LIMIT,
    PUBLIC_ARTICLE_SLOW_LOG_MS:
      process.env.PUBLIC_ARTICLE_SLOW_LOG_MS ??
      productionEnv.PUBLIC_ARTICLE_SLOW_LOG_MS,
    PUBLIC_KNOWLEDGE_SLOW_LOG_MS:
      process.env.PUBLIC_KNOWLEDGE_SLOW_LOG_MS ??
      productionEnv.PUBLIC_KNOWLEDGE_SLOW_LOG_MS,
    UPLOAD_DIR:
      process.env.UPLOAD_DIR ?? productionEnv.UPLOAD_DIR ?? "/var/www/uploads",
    PORT: resolvedPort,
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    TZ: "UTC",
    RELEASE_ID: process.env.RELEASE_ID ?? productionEnv.RELEASE_ID ?? "unknown",
    BUN_BIN: bunInterpreter,
  };
  if (role === "cms") {
    sharedRuntimeEnv.SECRET_ENCRYPTION_KEYS =
      process.env.SECRET_ENCRYPTION_KEYS ??
      productionEnv.SECRET_ENCRYPTION_KEYS;
    sharedRuntimeEnv.SECRET_ENCRYPTION_KEY =
      process.env.SECRET_ENCRYPTION_KEY ?? productionEnv.SECRET_ENCRYPTION_KEY;
    sharedRuntimeEnv.SECRET_ENCRYPTION_ACTIVE_KEY_ID =
      process.env.SECRET_ENCRYPTION_ACTIVE_KEY_ID ??
      productionEnv.SECRET_ENCRYPTION_ACTIVE_KEY_ID;
    sharedRuntimeEnv.ENABLE_CMS_BACKGROUND_WORKERS =
      process.env.ENABLE_CMS_BACKGROUND_WORKERS ??
      productionEnv.ENABLE_CMS_BACKGROUND_WORKERS;
    sharedRuntimeEnv.ENABLE_BROWSER_SCRAPING =
      process.env.ENABLE_BROWSER_SCRAPING ??
      productionEnv.ENABLE_BROWSER_SCRAPING ??
      "false";
    sharedRuntimeEnv.CMS_BASIC_AUTH_USERNAME =
      process.env.CMS_BASIC_AUTH_USERNAME ??
      productionEnv.CMS_BASIC_AUTH_USERNAME;
    sharedRuntimeEnv.CMS_BASIC_AUTH_PASSWORD =
      process.env.CMS_BASIC_AUTH_PASSWORD ??
      productionEnv.CMS_BASIC_AUTH_PASSWORD;
    sharedRuntimeEnv.ENABLE_PUBLIC_SIGNUP =
      process.env.ENABLE_PUBLIC_SIGNUP ??
      productionEnv.ENABLE_PUBLIC_SIGNUP ??
      "false";
  }

  return {
    name,
    cwd: appDir,
    script: path.join(appDir, "server.js"),
    interpreter: bunInterpreter || "node",
    instances,
    exec_mode: useBun ? "fork" : "cluster",
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    filter_env:
      role === "web" ? ["SECRET_ENCRYPTION_", "CMS_", "ENABLE_CMS_"] : [],
    env: {
      ...sharedRuntimeEnv,
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
      instancesEnvName: "WEB_INSTANCES",
      defaultInstances: 1,
      role: "web",
    }),
    createApp({
      name: "fwqgo-cms",
      appDir: cmsAppDir,
      port: 3100,
      portEnvName: "CMS_PORT",
      instancesEnvName: "CMS_INSTANCES",
      defaultInstances: 1,
      role: "cms",
    }),
  ],
};
