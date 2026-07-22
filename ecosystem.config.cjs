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

  const readDatabaseUrl =
    process.env.READ_DATABASE_URL ??
    productionEnv.READ_DATABASE_URL ??
    productionEnv.DATABASE_URL ??
    "";
  const writeDatabaseUrl =
    process.env.CMS_DATABASE_URL ??
    productionEnv.CMS_DATABASE_URL ??
    process.env.DATABASE_URL ??
    productionEnv.DATABASE_URL ??
    "";
  const analyticsDatabaseUrl =
    process.env.ANALYTICS_DATABASE_URL ??
    productionEnv.ANALYTICS_DATABASE_URL ??
    writeDatabaseUrl;
  const roleDatabaseEnv =
    role === "web"
      ? {
          DATABASE_URL: readDatabaseUrl,
          READ_DATABASE_URL: readDatabaseUrl,
          ANALYTICS_DATABASE_URL: analyticsDatabaseUrl,
          CMS_DATABASE_URL: "",
          CMS_USERNAME: "",
          CMS_PASSWORD: "",
        }
      : {
          DATABASE_URL: writeDatabaseUrl,
          CMS_DATABASE_URL: writeDatabaseUrl,
          ANALYTICS_DATABASE_URL: analyticsDatabaseUrl,
        };

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
    env: {
      ...productionEnv,
      ...roleDatabaseEnv,
      PORT: resolvedPort,
      NODE_ENV: "production",
      TZ: "UTC",
      RELEASE_ID:
        process.env.RELEASE_ID ?? productionEnv.RELEASE_ID ?? "unknown",
      BUN_BIN: bunInterpreter,
      UPLOAD_DIR:
        process.env.UPLOAD_DIR ??
        productionEnv.UPLOAD_DIR ??
        "/var/www/uploads",
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
