export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { shouldStartCmsBackgroundWorkers } =
    await import("@/server/admin/cms-background-worker-policy");
  if (!shouldStartCmsBackgroundWorkers()) return;

  const { ensureCmsBackgroundWorkersForRecoverableTasks } =
    await import("@/server/admin/cms-background-workers");

  void ensureCmsBackgroundWorkersForRecoverableTasks().catch((error) => {
    console.error(
      "CMS background worker recovery failed during startup:",
      error,
    );
  });
}
