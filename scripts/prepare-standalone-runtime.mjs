import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceNodeModules = path.join(root, "node_modules");
const standaloneTargets = [
  ".next-web/standalone",
  ".next-cms/standalone",
];
const runtimePackages = ["sharp", "@img", "detect-libc", "semver"];

/** @param {string} directory */
function listFiles(directory) {
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true });
}

/** @param {string} targetNodeModules */
function assertSharpNativeRuntime(targetNodeModules) {
  const imagePackages = path.join(targetNodeModules, "@img");
  const files = listFiles(imagePackages);
  const hasNativeAddon = files.some(
    (entry) => entry.isFile() && entry.name.endsWith(".node"),
  );
  const hasLibvips = files.some(
    (entry) =>
      entry.isFile() &&
      entry.name.startsWith("libvips-cpp") &&
      (entry.name.includes(".so") || entry.name.endsWith(".dylib")),
  );

  if (!hasNativeAddon || !hasLibvips) {
    throw new Error(
      `Incomplete sharp native runtime in ${targetNodeModules}: addon=${hasNativeAddon}, libvips=${hasLibvips}`,
    );
  }
}

for (const relativeTarget of standaloneTargets) {
  const target = path.join(root, relativeTarget);
  if (!fs.existsSync(target)) {
    throw new Error(`Standalone output does not exist: ${relativeTarget}`);
  }

  const targetNodeModules = path.join(target, "node_modules");
  fs.mkdirSync(targetNodeModules, { recursive: true });

  for (const packagePath of runtimePackages) {
    const source = path.join(sourceNodeModules, packagePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Required runtime package is missing: ${packagePath}`);
    }

    const destination = path.join(targetNodeModules, packagePath);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, force: true });
  }

  assertSharpNativeRuntime(targetNodeModules);
}

console.log(
  "Standalone native runtime prepared: sharp addon and libvips are complete",
);
