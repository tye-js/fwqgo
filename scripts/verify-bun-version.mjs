import path from "node:path";
import { pathToFileURL } from "node:url";
import packageManifest from "../package.json" with { type: "json" };

const version = /^bun@(\d+\.\d+\.\d+)$/.exec(
  packageManifest.packageManager,
)?.[1];
if (!version) throw new Error("packageManager must pin a stable Bun version");
export const requiredBunVersion = version;

/** @param {string | undefined} [actual] */
export function verifyBunRuntime(actual = process.versions.bun) {
  if (actual !== requiredBunVersion) {
    throw new Error(
      `This project requires Bun ${requiredBunVersion}; current runtime: ${actual ?? "not Bun"}. Install the version pinned in package.json before building.`,
    );
  }
  return actual;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    console.log(`Bun runtime verified: ${verifyBunRuntime()}`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Bun version check failed",
    );
    process.exitCode = 1;
  }
}
