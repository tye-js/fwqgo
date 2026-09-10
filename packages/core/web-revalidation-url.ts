export function resolveWebRevalidationUrl(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const configuredPort = environment.WEB_PORT?.trim();
  const port = configuredPort?.length ? configuredPort : "3000";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("WEB_PORT 必须是有效端口");
  }
  const localUrl = `http://127.0.0.1:${port}/api/internal/revalidate`;
  const explicit = environment.WEB_REVALIDATION_URL?.trim();
  if (!explicit) return localUrl;
  const parsed = new URL(explicit);
  const configuredOrigin = environment.NEXT_PUBLIC_URL?.trim();
  const publicUrl = new URL(
    configuredOrigin?.length ? configuredOrigin : "https://fwqgo.com",
  );
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(
    parsed.hostname,
  );
  const effectivePort =
    parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const trustedLocal = loopback && Number(effectivePort) === Number(port);
  const trustedPublic =
    parsed.protocol === "https:" && parsed.origin === publicUrl.origin;
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/api/internal/revalidate" ||
    (!trustedLocal && !trustedPublic)
  ) {
    throw new Error(
      "WEB_REVALIDATION_URL 必须指向配置的本机 Web 端口或公开站 HTTPS 缓存刷新接口",
    );
  }
  return parsed.toString();
}
