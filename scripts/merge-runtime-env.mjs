import fs from "node:fs";
import path from "node:path";

const [targetPath, overridePath] = process.argv.slice(2);
if (!targetPath || !overridePath) {
  throw new Error("Usage: node merge-runtime-env.mjs <target-env> <override-env>");
}

const allowedKeys = new Set([
  "ANALYTICS_DATABASE_URL",
  "SECRET_ENCRYPTION_ACTIVE_KEY_ID",
  "SECRET_ENCRYPTION_KEY",
  "SECRET_ENCRYPTION_KEYS",
  "WEB_REVALIDATION_SECRET",
  "WEB_REVALIDATION_URL",
]);

/** @param {string} filePath */
function readAssignments(filePath) {
  const values = new Map();
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (allowedKeys.has(key) && value) values.set(key, value);
  }
  return values;
}

if (!fs.existsSync(targetPath)) {
  throw new Error(`Runtime environment file does not exist: ${targetPath}`);
}
if (!fs.existsSync(overridePath)) {
  throw new Error(`Runtime override file does not exist: ${overridePath}`);
}

const overrides = readAssignments(overridePath);
if (overrides.size === 0) {
  throw new Error("Runtime override file contains no supported values");
}

const seen = new Set();
const output = fs
  .readFileSync(targetPath, "utf8")
  .split(/\r?\n/)
  .filter((line, index, lines) => index < lines.length - 1 || line.length > 0)
  .map((line) => {
    const match = /^\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    const key = match?.[1];
    if (!key || !overrides.has(key)) return line;
    if (seen.has(key)) return null;
    seen.add(key);
    return `${key}=${overrides.get(key)}`;
  })
  .filter((line) => line !== null);

for (const [key, value] of overrides) {
  if (!seen.has(key)) output.push(`${key}=${value}`);
}

const temporaryPath = path.join(
  path.dirname(targetPath),
  `.${path.basename(targetPath)}.${process.pid}.tmp`,
);
fs.writeFileSync(temporaryPath, `${output.join("\n")}\n`, { mode: 0o600 });
fs.renameSync(temporaryPath, targetPath);
fs.chmodSync(targetPath, 0o600);
console.log(`Runtime environment updated: keys=${[...overrides.keys()].join(",")}`);
