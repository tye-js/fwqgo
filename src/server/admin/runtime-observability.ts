import { realpathSync } from "node:fs";
import { hostname } from "node:os";

function safeRealPath(value: string) {
  try {
    return realpathSync(value);
  } catch {
    return value;
  }
}

function inferReleaseId(realCwd: string) {
  const match = /\/releases\/([^/]+)(?:\/|$)/.exec(realCwd);
  return match?.[1] ?? null;
}

function enabledEnvFlag(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getAdminRuntimeSnapshot() {
  const bunVersion = (
    process.versions as NodeJS.ProcessVersions & { bun?: string }
  ).bun;
  const cwd = process.cwd();
  const realCwd = safeRealPath(cwd);
  const inferredReleaseId = inferReleaseId(realCwd);
  const releaseCandidates = [
    { value: process.env.RELEASE_ID, source: "env" },
    { value: process.env.GITHUB_RUN_ID, source: "github" },
    { value: process.env.VERCEL_GIT_COMMIT_SHA, source: "vercel" },
    { value: inferredReleaseId, source: "path" },
  ];
  const release = releaseCandidates.find((candidate) =>
    candidate.value?.trim(),
  );

  return {
    releaseId: release?.value ?? "local",
    releaseSource: release?.source ?? "fallback",
    cwd,
    realCwd,
    hostname: hostname(),
    pid: process.pid,
    runtimeEngine: bunVersion ? "Bun" : "Node.js",
    runtimeVersion: bunVersion ?? process.version,
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    generatedAt: new Date().toISOString(),
    publicUrl: process.env.NEXT_PUBLIC_URL ?? null,
    cmsUrl: process.env.NEXT_PUBLIC_CMS_URL ?? null,
    cmsBasicAuthEnabled:
      enabledEnvFlag(process.env.CMS_BASIC_AUTH_USERNAME) &&
      enabledEnvFlag(process.env.CMS_BASIC_AUTH_PASSWORD),
    backgroundJobConcurrency:
      process.env.ADMIN_BACKGROUND_JOB_CONCURRENCY ?? null,
  };
}
