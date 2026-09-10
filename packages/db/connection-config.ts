type Environment = Readonly<Record<string, string | undefined>>;

export function resolveDatabaseUrls(environment: Environment) {
  const buildOnly = environment.SKIP_ENV_VALIDATION === "1";
  const production = environment.NODE_ENV === "production" && !buildOnly;
  const value = (name: string) => {
    const configured = environment[name]?.trim();
    if (configured?.length) return configured;
    return undefined;
  };
  const required = (name: string, fallback?: string) => {
    const result = value(name) ?? fallback;
    if (result) return result;
    if (buildOnly) return "postgresql://build:build@127.0.0.1:5432/fwqgo_build";
    throw new Error(`${name} is required`);
  };
  const primary = required("DATABASE_URL", value("READ_DATABASE_URL"));
  const credentials = (username?: string, password?: string) => {
    const url = new URL(primary);
    if (username) url.username = username;
    if (password) url.password = password;
    return url.toString();
  };
  const write =
    value("CMS_DATABASE_URL") ??
    (value("CMS_USERNAME") || value("CMS_PASSWORD")
      ? credentials(value("CMS_USERNAME"), value("CMS_PASSWORD"))
      : primary);
  // PM2 expands legacy username/password settings into explicit role URLs.
  // Direct production starts must also fail closed instead of using the writer.
  const read = production
    ? required("READ_DATABASE_URL")
    : (value("READ_DATABASE_URL") ??
      (value("READ_USERNAME") || value("READ_PASSWORD")
        ? credentials(
            value("READ_USERNAME") ?? `${new URL(primary).username}_readonly`,
            value("READ_PASSWORD"),
          )
        : write));
  const analytics = production
    ? required("ANALYTICS_DATABASE_URL")
    : (value("ANALYTICS_DATABASE_URL") ?? write);

  return { write, read, analytics };
}
