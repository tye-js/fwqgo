/** @param {{ cms?: boolean, production: boolean }} options */
export function getSecurityHeaders({ cms = false, production }) {
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `img-src 'self' data: https:${cms ? " blob:" : ""}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    `connect-src 'self'${production ? "" : " ws: wss:"}`,
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
