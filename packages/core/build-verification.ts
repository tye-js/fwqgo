export function isBuildProcess(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    environment.NEXT_PHASE === "phase-production-build" ||
    environment.npm_lifecycle_event?.startsWith("build") === true
  );
}

/** Database-free verification builds are never production release artifacts. */
export function isDatabaseFreeBuild(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return environment.SKIP_ENV_VALIDATION === "1" && isBuildProcess(environment);
}
