import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { verifyBunRuntime } from "./verify-bun-version.mjs";

// The CI PostgreSQL fixture already occupies 55432.
const tunnelPort = 55433;

/** @param {Readonly<Record<string, string | undefined>>} environment */
export function getReleaseBuildConfig(environment) {
  if (!environment.READ_DATABASE_URL?.trim()) {
    throw new Error("READ_DATABASE_URL is required for a release build");
  }
  const url = new URL(environment.READ_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("READ_DATABASE_URL must be a PostgreSQL URL with a host");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
    url.hostname.toLowerCase(),
  );
  const forwardTarget = loopback
    ? `${url.hostname}:${url.port || "5432"}`
    : null;
  if (loopback) {
    url.hostname = "127.0.0.1";
    url.port = String(tunnelPort);
  }
  const databaseUrl = url.toString();
  /** @type {NodeJS.ProcessEnv} */
  const buildEnvironment = {
    ...environment,
    NODE_ENV: "production",
    // A build only needs reads. Never give prerender code the CMS writer.
    DATABASE_URL: databaseUrl,
    CMS_DATABASE_URL: databaseUrl,
    READ_DATABASE_URL: databaseUrl,
    ANALYTICS_DATABASE_URL: databaseUrl,
    ENABLE_CMS_BACKGROUND_WORKERS: "false",
  };
  for (const key of [
    "SKIP_ENV_VALIDATION",
    "CMS_USERNAME",
    "CMS_PASSWORD",
    "READ_USERNAME",
    "READ_PASSWORD",
  ]) {
    delete buildEnvironment[key];
  }
  return { buildEnvironment, databaseUrl, forwardTarget };
}

async function buildRelease() {
  verifyBunRuntime();
  const { buildEnvironment, databaseUrl, forwardTarget } =
    getReleaseBuildConfig(process.env);
  if (process.env.GITHUB_ACTIONS === "true") {
    // The forwarded URL differs from the original masked repository secret.
    console.log(`::add-mask::${databaseUrl.replaceAll("%", "%25")}`);
  }
  let controlDirectory = "";
  let controlSocket = "";
  let sshDestination = "";
  let tunnelStarted = false;
  try {
    if (forwardTarget) {
      const host = process.env.DEPLOY_HOST?.trim();
      const user = process.env.DEPLOY_USER?.trim();
      if (!host || !user)
        throw new Error(
          "DEPLOY_HOST and DEPLOY_USER are required for the build database tunnel",
        );
      sshDestination = `${user}@${host}`;
      controlDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "fwqgo-build-db-"),
      );
      controlSocket = path.join(controlDirectory, "control");
      const ssh = spawnSync(
        "ssh",
        [
          "-M",
          "-S",
          controlSocket,
          "-f",
          "-N",
          "-o",
          "BatchMode=yes",
          "-o",
          "StrictHostKeyChecking=yes",
          "-o",
          "ExitOnForwardFailure=yes",
          "-o",
          "ConnectTimeout=15",
          "-o",
          "ServerAliveInterval=30",
          "-o",
          "ServerAliveCountMax=3",
          "-p",
          process.env.DEPLOY_PORT ?? "22",
          "-i",
          path.join(os.homedir(), ".ssh", "fwqgo_deploy_key"),
          "-L",
          `127.0.0.1:${tunnelPort}:${forwardTarget}`,
          sshDestination,
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      if (ssh.status !== 0) {
        // 把 ssh 自己的报错原样带出来。原先这里只抛一句笼统的话，CI 日志里看不出到底是
        // 主机密钥不匹配（Host key verification failed）、认证失败（Permission denied）
        // 还是转发被禁（administratively prohibited）—— 三者的修法完全不同，
        // 2026-09-25 那次部署失败就是因为只看到那句话而无法定位。
        const detail = `${ssh.stderr ?? ""}${ssh.stdout ?? ""}`.trim();
        throw new Error(
          [
            "Build database SSH tunnel failed; verify the pinned host key, SSH access and forwarding policy",
            detail
              ? `ssh said: ${detail}`
              : "(ssh produced no output — check DEPLOY_KNOWN_HOSTS, SSH_PRIVATE_KEY and DEPLOY_HOST)",
          ].join("\n"),
        );
      }
      tunnelStarted = true;
    }

    const sql = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 1,
    });
    try {
      await sql`select 1`;
    } catch {
      // Do not log connection URLs or substitute an empty/default site shell.
      throw new Error(
        "Release build cannot reach its read database; verify READ_DATABASE_URL and server database access",
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
    console.log(
      "Release read database verified; building with environment validation enabled",
    );
    const result = spawnSync(process.execPath, ["run", "build"], {
      env: buildEnvironment,
      stdio: "inherit",
    });
    if (result.status !== 0)
      throw new Error("Release application build failed");
  } finally {
    if (tunnelStarted) {
      spawnSync("ssh", ["-S", controlSocket, "-O", "exit", sshDestination], {
        stdio: "ignore",
        timeout: 5000,
      });
    }
    if (controlDirectory)
      fs.rmSync(controlDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    await buildRelease();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Release build failed",
    );
    process.exitCode = 1;
  }
}
