import path from "node:path";
import { spawnSync } from "node:child_process";

const gitFiles = spawnSync("git", ["ls-files", "-z"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (gitFiles.error || gitFiles.status !== 0) {
  const reason = gitFiles.error?.message ?? gitFiles.stderr.trim();
  throw new Error(`Unable to inspect tracked files: ${reason}`);
}

const trackedFiles = gitFiles.stdout.split("\0").filter(Boolean);
const localRoots = ["tests/", ".claude/", ".agents/"];

const forbiddenFiles = trackedFiles.filter((filePath) => {
  const normalizedPath = filePath.replaceAll(path.sep, "/");
  const basename = path.posix.basename(normalizedPath);
  const isPrivateEnv =
    basename === ".env" ||
    (basename.startsWith(".env.") && basename !== ".env.example");

  return (
    isPrivateEnv ||
    localRoots.some(
      (root) =>
        normalizedPath === root.slice(0, -1) || normalizedPath.startsWith(root),
    )
  );
});

if (forbiddenFiles.length > 0) {
  throw new Error(
    `Repository hygiene verification failed. Local-only files are tracked:\n${forbiddenFiles.join("\n")}`,
  );
}

console.log(
  `Repository hygiene verified: trackedFiles=${trackedFiles.length}, forbiddenFiles=0`,
);
