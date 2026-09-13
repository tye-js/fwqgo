/** @param {{ cms?: boolean, production: boolean }} options */
export function getSecurityHeaders({ cms = false, production }) {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  const connectSources = ["'self'"];
  // Cloudflare injects its analytics beacon at the edge on the public site.
  if (production && !cms) {
    scriptSources.push("https://static.cloudflareinsights.com");
    connectSources.push("https://cloudflareinsights.com");
  }
  if (!production) {
    scriptSources.push("'unsafe-eval'");
    connectSources.push("ws:", "wss:");
  }
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `img-src 'self' data: https:${cms ? " blob:" : ""}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`,
    ...(production ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Content-Security-Policy", value: policy },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Referrer-Policy",
      value: cms ? "no-referrer" : "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    ...(production
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
      : []),
  ];
}
