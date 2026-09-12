import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const nginx = process.env.NGINX_BIN ?? "nginx";
const root = process.env.NGINX_POLICY_ROOT ?? process.cwd();
const snippets = path.join(root, "deploy/nginx");
const directory = mkdtempSync(path.join(tmpdir(), "fwqgo-nginx-transport-"));
const asset = 'console.log("immutable fixture");\n'.repeat(200);
let upstreamRequests = 0;

const upstream = createServer((request, response) => {
  upstreamRequests += 1;
  if (request.url === "/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    });
    response.write("data: first\n\n");
    setTimeout(() => response.end("data: last\n\n"), 1000);
    return;
  }
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Strict-Transport-Security": "max-age=31536000",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(
    JSON.stringify({
      port: request.socket.remotePort,
      version: request.httpVersion,
      host: request.headers.host,
      forwardedHost: request.headers["x-forwarded-host"],
      realIp: request.headers["x-real-ip"],
      forwardedFor: request.headers["x-forwarded-for"],
      cfIp: request.headers["cf-connecting-ip"] ?? null,
      connection: request.headers.connection ?? null,
      encoding: request.headers["accept-encoding"] ?? null,
    }),
  );
});

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

let child: ChildProcess | undefined;
try {
  const upstreamPort = await listen(upstream);
  const reservation = createServer();
  const proxyPort = await listen(reservation);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const transport = readFileSync(
    path.join(snippets, "fwqgo-proxy.conf"),
    "utf8",
  ).replaceAll("/etc/nginx/snippets/", `${snippets}/`);
  const staticHeaders = readFileSync(
    path.join(snippets, "fwqgo-static-headers.conf"),
    "utf8",
  ).replaceAll("/etc/nginx/snippets/", `${snippets}/`);
  writeFileSync(path.join(directory, "fixture-hash.js"), asset);
  writeFileSync(path.join(directory, ".private"), "must not be served");
  const config = path.join(directory, "nginx.conf");
  writeFileSync(
    config,
    `
daemon off;
master_process off;
pid "${directory}/nginx.pid";
error_log stderr warn;
events { worker_connections 128; }
http {
  access_log off;
  gzip on;
  types { application/javascript js; }
  client_body_temp_path "${directory}/body";
  proxy_temp_path "${directory}/proxy";
  include "${snippets}/fwqgo-http-tuning.conf";
  upstream fixture_backend {
    server 127.0.0.1:${upstreamPort};
    keepalive 2;
    keepalive_timeout 4s;
  }
  server {
    listen 127.0.0.1:${proxyPort};
    server_name fixture.test;
    include "${snippets}/fwqgo-security-headers.conf";
    location /_next/static/ {
      alias "${directory}/";
      ${staticHeaders}
    }
    location ~ /\\. { deny all; }
    location / {
      proxy_pass http://fixture_backend;
      ${transport}
    }
  }
}
`,
  );
  child = spawn(nginx, ["-p", `${directory}/`, "-c", config], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let startupError = "";
  child.on("error", (error) => {
    startupError = error.message;
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    startupError += chunk.toString();
  });
  const origin = `http://127.0.0.1:${proxyPort}`;
  let ready = false;
  const deadline = Date.now() + 10_000;
  while (!ready && Date.now() < deadline) {
    if (child.exitCode !== null || startupError.includes("ENOENT")) {
      throw new Error(startupError || "nginx exited");
    }
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(2000),
      });
      await response.arrayBuffer();
      ready = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(ready, `nginx did not start: ${startupError}`);

  const ports = new Set<number>();
  for (let index = 0; index < 3; index += 1) {
    const response = await fetch(origin, {
      headers: {
        Host: "fixture.test",
        Connection: "close",
        "X-Forwarded-Host": "untrusted.example",
        "X-Real-IP": "198.51.100.1",
        "X-Forwarded-For": "198.51.100.2",
        "CF-Connecting-IP": "198.51.100.3",
        "Accept-Encoding": "gzip",
      },
      signal: AbortSignal.timeout(3000),
    });
    const result = (await response.json()) as {
      port: number;
      version: string;
      host: string;
      forwardedHost: string;
      realIp: string;
      forwardedFor: string;
      cfIp: string | null;
      connection: string | null;
      encoding: string | null;
    };
    ports.add(result.port);
    assert.equal(result.version, "1.1");
    assert.equal(result.host, "fixture.test");
    assert.equal(result.forwardedHost, "fixture.test");
    assert.equal(result.realIp, "127.0.0.1");
    assert.equal(result.forwardedFor, "127.0.0.1");
    assert.equal(result.cfIp, null);
    assert.equal(result.connection, null);
    assert.equal(result.encoding, null);
    assert.equal(
      response.headers.get("strict-transport-security"),
      "max-age=31536000",
    );
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(
    ports.size,
    1,
    "ordinary requests must reuse the upstream connection",
  );

  const beforeStatic = upstreamRequests;
  const staticResponse = await fetch(`${origin}/_next/static/fixture-hash.js`, {
    headers: { "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(staticResponse.status, 200);
  assert.equal(staticResponse.headers.get("content-encoding"), "gzip");
  assert.equal(
    staticResponse.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(await staticResponse.text(), asset);
  const missing = await fetch(`${origin}/_next/static/missing.js`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  await missing.arrayBuffer();
  const hidden = await fetch(`${origin}/_next/static/.private`);
  assert.equal(hidden.status, 403);
  await hidden.arrayBuffer();
  assert.equal(
    upstreamRequests,
    beforeStatic,
    "static assets must not reach Bun",
  );

  const startedAt = Date.now();
  const stream = await fetch(`${origin}/events`, {
    headers: { "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(4000),
  });
  assert.equal(stream.headers.get("content-encoding"), null);
  const reader = stream.body!.getReader();
  const first = await reader.read();
  const firstChunkMs = Date.now() - startedAt;
  assert.match(new TextDecoder().decode(first.value), /data: first/);
  assert.ok(
    firstChunkMs < 800,
    `stream buffered the first event for ${firstChunkMs}ms`,
  );
  while (!(await reader.read()).done) {
    /* Drain the delayed second event. */
  }
  assert.ok(Date.now() - startedAt >= 900);
  console.log(
    JSON.stringify({
      verified: [
        "upstream reuse",
        "trusted headers",
        "single security headers",
        "static gzip",
        "immutable assets",
        "404 no-store",
        "dotfile denial",
        "SSE streaming",
      ],
      upstreamConnectionsForThreeRequests: ports.size,
      firstEventMs: firstChunkMs,
    }),
  );
} finally {
  if (child?.pid && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
}
