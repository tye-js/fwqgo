type CmsBackgroundWorkerEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "ENABLE_CMS_BACKGROUND_WORKERS" | "NODE_ENV">
>;

export function shouldStartCmsBackgroundWorkers(
  environment: CmsBackgroundWorkerEnvironment = process.env,
) {
  const override =
    environment.ENABLE_CMS_BACKGROUND_WORKERS?.trim().toLowerCase();

  if (override === "true") return true;
  if (override === "false") return false;

  return environment.NODE_ENV === "production";
}
