/** Only explicitly database-free local builds may render a default site shell. */
export function isDatabaseFreeBuild(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    environment.SKIP_ENV_VALIDATION === "1" &&
    (environment.NEXT_PHASE === "phase-production-build" ||
      environment.npm_lifecycle_event?.startsWith("build") === true)
  );
}
