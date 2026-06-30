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
const appDir = process.env.APP_DIR ?? __dirname;

module.exports = {
  apps: [
    {
      name: "fwqgo",
      cwd: appDir,
      script: path.join(appDir, "server.js"),
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        ...productionEnv,
        PORT: process.env.PORT ?? productionEnv.PORT ?? 3000,
        NODE_ENV: "production",
        UPLOAD_DIR:
          process.env.UPLOAD_DIR ?? productionEnv.UPLOAD_DIR ?? "/var/www/uploads",
      },
    },
  ],
};
