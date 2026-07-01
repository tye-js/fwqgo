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
 * @param {{ name: string; appDir: string; port: number; portEnvName: string; instancesEnvName: string; defaultInstances: number }} options
 */
function createApp({
  name,
  appDir,
  port,
  portEnvName,
  instancesEnvName,
  defaultInstances,
}) {
  const resolvedPort =
    process.env[portEnvName] ?? productionEnv[portEnvName] ?? String(port);
  const instances = parsePositiveInteger(
    process.env[instancesEnvName] ?? productionEnv[instancesEnvName],
    defaultInstances,
  );

  return {
    name,
    cwd: appDir,
    script: path.join(appDir, "server.js"),
    instances,
    exec_mode: "cluster",
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      ...productionEnv,
      PORT: resolvedPort,
      NODE_ENV: "production",
      UPLOAD_DIR:
        process.env.UPLOAD_DIR ?? productionEnv.UPLOAD_DIR ?? "/var/www/uploads",
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
      defaultInstances: 2,
    }),
    createApp({
      name: "fwqgo-cms",
      appDir: cmsAppDir,
      port: 3100,
      portEnvName: "CMS_PORT",
      instancesEnvName: "CMS_INSTANCES",
      defaultInstances: 1,
    }),
  ],
};
