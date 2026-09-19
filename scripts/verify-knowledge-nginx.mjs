import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const nginx = process.env.NGINX_BIN ?? "nginx";
const root = process.env.NGINX_POLICY_ROOT ?? process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), "fwqgo-nginx-check-"));
mkdirSync(path.join(temp, "logs"));
const policies = [
  { path: "/knowledge", name: "knowledge", ttl: 300, stale: 60 },
  { path: "/fwq/posts/fixture", name: "public", ttl: 900, stale: 86400 },
  { path: "/servers", name: "public-page", ttl: 900, stale: 86400 },
];

/** Each public surface opts in through its own application marker. */
const markers = [
  { prefix: "/fwq/posts/", header: "X-Fwqgo-Cacheable-Article" },
  { prefix: "/servers", header: "X-Fwqgo-Cacheable-Public" },
];

const upstream = createServer((request, response) => {
  const status = Number(request.headers["x-fixture-status"] ?? 200);
  /** @type {Record<string, string>} */
  const headers = {
    "Content-Type": String(request.headers["x-fixture-type"] ?? "text/html; charset=utf-8"),
    "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
  };
  if (request.headers["x-fixture-marker"] !== "0") {
    const matched = markers.find((item) => request.url?.startsWith(item.prefix));
    headers[matched?.header ?? "X-Fwqgo-Cacheable-Knowledge"] = "1";
  }
  if (request.headers["x-fixture-cookie"] === "1") headers["Set-Cookie"] = "fixture=1; HttpOnly";
  response.writeHead(status, headers).end("fixture");
});

/** @param {ReturnType<typeof createServer>} server */
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

/** @type {ReturnType<typeof spawn> | undefined} */
let child;
try {
  const upstreamPort = await listen(upstream);
  const reservation = createServer();
  const proxyPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const configFile = path.join(temp, "nginx.conf");
  writeFileSync(configFile, `
daemon off;
master_process off;
pid "${temp}/nginx.pid";
error_log stderr warn;
events { worker_connections 64; }
http {
  access_log off;
  client_body_temp_path "${temp}/client-body";
  proxy_temp_path "${temp}/proxy";
  include "${root}/deploy/nginx/fwqgo-knowledge-cache-maps.conf";
  include "${root}/deploy/nginx/fwqgo-public-cache-maps.conf";
  server {
    listen 127.0.0.1:${proxyPort};
    ${policies.map((policy) => `location = ${policy.path} {
      proxy_pass http://127.0.0.1:${upstreamPort};
      include "${root}/deploy/nginx/fwqgo-${policy.name}-cache-headers.conf";
      include "${root}/deploy/nginx/fwqgo-security-headers.conf";
    }`).join("\n")}
  }
}
`);
  child = spawn(nginx, ["-p", `${temp}/`, "-c", configFile], { stdio: ["ignore", "pipe", "pipe"] });
  let startupError = "";
  child.on("error", (error) => { startupError = error.message; });
  child.stderr?.on("data", (chunk) => { startupError += String(chunk); });
  const proxyUrl = `http://127.0.0.1:${proxyPort}/knowledge`;
  let ready = false;
  const deadline = Date.now() + 10_000;
  while (!ready && Date.now() < deadline) {
    if (child.exitCode !== null || startupError.includes("ENOENT")) throw new Error(startupError || "nginx exited");
    try { const response = await fetch(proxyUrl); await response.arrayBuffer(); ready = true; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, `nginx did not start: ${startupError}`);

  /** @type {Array<{name: string; shared: boolean; method?: string; query?: string; headers?: Record<string, string>}>} */
  const cases = [
    { name: "anonymous 200 HTML", shared: true },
    { name: "HEAD", method: "HEAD", shared: true },
    { name: "201", headers: { "x-fixture-status": "201" }, shared: false },
    { name: "302", headers: { "x-fixture-status": "302" }, shared: false },
    { name: "206", headers: { "x-fixture-status": "206" }, shared: false },
    { name: "unmarked response", headers: { "x-fixture-marker": "0" }, shared: false },
    { name: "404", headers: { "x-fixture-status": "404" }, shared: false },
    { name: "500", headers: { "x-fixture-status": "500" }, shared: false },
    { name: "503", headers: { "x-fixture-status": "503" }, shared: false },
    { name: "JSON", headers: { "x-fixture-type": "application/json" }, shared: false },
    { name: "Flight content", headers: { "x-fixture-type": "text/x-component" }, shared: false },
    { name: "Set-Cookie", headers: { "x-fixture-cookie": "1" }, shared: false },
    { name: "request Cookie", headers: { Cookie: "session=fixture" }, shared: false },
    { name: "Authorization", headers: { Authorization: "Bearer fixture" }, shared: false },
    { name: "RSC", headers: { RSC: "1" }, shared: false },
    { name: "route prefetch", headers: { "Next-Router-Prefetch": "1" }, shared: false },
    { name: "segment prefetch", headers: { "Next-Router-Segment-Prefetch": "/_tree" }, shared: false },
    { name: "router state", headers: { "Next-Router-State-Tree": "[]" }, shared: false },
    { name: "search", query: "?q=fixture", shared: false },
    { name: "_rsc", query: "?_rsc=fixture", shared: false },
    { name: "POST", method: "POST", shared: false },
  ];
  for (const policy of policies) {
    for (const item of cases) {
      const url = `http://127.0.0.1:${proxyPort}${policy.path}${item.query ?? ""}`;
      const response = await fetch(url, { method: item.method ?? "GET", headers: item.headers, redirect: "manual" });
      await response.arrayBuffer();
      const label = `${policy.name}: ${item.name}`;
      const cacheControl = response.headers.get("cache-control") ?? "";
      if (item.shared) assert.equal(cacheControl, `public, max-age=0, s-maxage=${policy.ttl}, stale-while-revalidate=${policy.stale}`, label);
      else assert.match(cacheControl, /private, no-store/, label);
      for (const header of ["cdn-cache-control", "cloudflare-cdn-cache-control"]) {
        assert.equal(response.headers.get(header), item.shared ? `public, max-age=${policy.ttl}, stale-while-revalidate=${policy.stale}` : "no-store", `${label}: ${header}`);
      }
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", label);
      assert.equal(response.headers.get("x-frame-options"), "DENY", label);
      assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=/, label);
    }
  }
  console.log(`Public HTML Nginx policies verified with a real nginx process: ${cases.length * policies.length} combinations, including security headers`);
} finally {
  if (child?.pid && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  await new Promise((resolve) => upstream.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
