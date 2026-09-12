/** Cookie-authenticated route handlers need their own CSRF boundary. */
export function isSameOriginRequest(
  request: Pick<Request, "headers" | "url">,
  configuredOrigin?: string,
) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  try {
    const source = new URL(origin);
    const target = new URL(configuredOrigin ?? request.url);
    const requestOrigin = new URL(request.url).origin;
    return (
      ["http:", "https:"].includes(source.protocol) &&
      (source.origin === target.origin || source.origin === requestOrigin) &&
      source.pathname === "/" &&
      !source.search &&
      !source.hash &&
      !source.username &&
      !source.password
    );
  } catch {
    return false;
  }
}
