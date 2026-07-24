import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/**
 * @param {string} filePath
 * @param {string} key
 * @returns {string | null}
 */
function readEnvValue(filePath, key) {
  let value = null;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0 || trimmed.slice(0, separator).trim() !== key) continue;

    value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
  }

  return value;
}

/**
 * @param {string} value
 * @param {string} label
 * @returns {string}
 */
function decodeUrlCredential(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(`DATABASE_URL contains an invalid encoded ${label}`);
  }
}

const [envFile, outputFile] = process.argv.slice(2);
if (!envFile || !outputFile) {
  fail("Usage: node secure-pg-dump.mjs <env-file> <output-file>");
}
if (!path.isAbsolute(envFile) || !path.isAbsolute(outputFile)) {
  fail("Database environment and backup output paths must be absolute");
}
if (!fs.existsSync(envFile)) {
  fail("Database environment file does not exist");
}

const databaseUrl = readEnvValue(envFile, "DATABASE_URL");
if (!databaseUrl) {
  fail("DATABASE_URL is missing from the database environment file");
}

let parsedUrl;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  fail("DATABASE_URL is not a valid PostgreSQL URL");
}

if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
  fail("DATABASE_URL must use the postgres or postgresql protocol");
}

const queryUser = parsedUrl.searchParams.get("user");
const queryPassword = parsedUrl.searchParams.get("password");
const username = parsedUrl.username
  ? decodeUrlCredential(parsedUrl.username, "username")
  : (queryUser ?? "");
const password = parsedUrl.password
  ? decodeUrlCredential(parsedUrl.password, "password")
  : (queryPassword ?? "");
const hasHost = Boolean(
  parsedUrl.hostname || parsedUrl.searchParams.get("host"),
);
const hasDatabase =
  parsedUrl.pathname.length > 1 ||
  Boolean(parsedUrl.searchParams.get("dbname"));

if (!username || !hasHost || !hasDatabase) {
  fail("DATABASE_URL must include a username, host, and database name");
}

/** @type {Record<string, string>} */
const credentialEnvironment = {
  PGUSER: username,
};
if (password) credentialEnvironment.PGPASSWORD = password;

/** @type {Array<[string, string]>} */
const credentialParameters = [
  ["passfile", "PGPASSFILE"],
  ["sslpassword", "PGSSLPASSWORD"],
];
for (const [parameter, environmentKey] of credentialParameters) {
  const value = parsedUrl.searchParams.get(parameter);
  if (value) credentialEnvironment[environmentKey] = value;
  parsedUrl.searchParams.delete(parameter);
}

parsedUrl.username = "";
parsedUrl.password = "";
parsedUrl.searchParams.delete("user");
parsedUrl.searchParams.delete("password");

const safeDatabaseUrl = parsedUrl.toString();
const childEnvironment = { ...process.env };
for (const key of Object.keys(childEnvironment)) {
  if (key.endsWith("DATABASE_URL") || /^PG[A-Z0-9_]+$/.test(key)) {
    delete childEnvironment[key];
  }
}
Object.assign(childEnvironment, credentialEnvironment);

const result = spawnSync(
  "pg_dump",
  [
    `--dbname=${safeDatabaseUrl}`,
    "--no-password",
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    `--file=${outputFile}`,
  ],
  {
    env: childEnvironment,
    stdio: "inherit",
  },
);

if (result.error) {
  fail("Unable to start pg_dump");
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
