import { spawnSync } from "node:child_process";
import fs from "node:fs";

if (!process.versions.bun) throw new Error("Run project tests with Bun");

const files = fs.existsSync("tests")
  ? fs
      .readdirSync("tests")
      .filter((file) => file.endsWith(".test.ts"))
      .sort()
      .map((file) => `./tests/${file}`)
  : [];

if (files.length === 0) {
  console.log("No local tests found; skipping private test suite.");
} else {
  const database = "postgresql://test:test@127.0.0.1:1/fwqgo_test";
  const result = spawnSync(
    process.execPath,
    ["--no-env-file", "test", ...files],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: database,
        CMS_DATABASE_URL: database,
        READ_DATABASE_URL: database,
        ANALYTICS_DATABASE_URL: database,
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
