import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const root = process.cwd();
/** @type {import("node:child_process").ChildProcess[]} */
const processes = [];
/** @type {string[]} */
const output = [];

/** @param {string} name @param {string} cwd @param {string} entry @param {number} port */
function startServer(name, cwd, entry, port) {
  const child = spawn(process.execPath, [entry], {
    cwd,
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => output.push(`[${name}] ${chunk}`));
  }
  processes.push(child);
  return child;
}

/** @param {Set<number>} [excluded] */
async function getAvailablePort(excluded = new Set()) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1" }, () => resolve(undefined));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve(undefined))),
  );
  if (!port) throw new Error("Failed to allocate a smoke-test port");
  if (excluded.has(port)) return getAvailablePort(excluded);
  return port;
}

/** @param {string} url @param {import("node:child_process").ChildProcess} child @param {Record<string, string>} [headers] */
async function waitForServer(url, child, headers = {}) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server process exited before becoming ready: ${url}`);
    }
    try {
      return await fetch(url, { headers, redirect: "manual" });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function basicAuthHeaders() {
  const username = process.env.CMS_BASIC_AUTH_USERNAME;
  const password = process.env.CMS_BASIC_AUTH_PASSWORD;
  /** @type {Record<string, string>} */
  const headers = {};
  if (username && password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  return headers;
}

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {string} origin @param {string} service @param {import("node:child_process").ChildProcess} child @param {Record<string, string>} [headers] */
async function checkHealth(origin, service, child, headers = {}) {
  const response = await waitForServer(`${origin}/api/health`, child, headers);
  const body = await response.text();
  assert(
    [200, 503].includes(response.status),
    `${service} health returned ${response.status}`,
  );
  assert(
    body.includes(`\"service\":\"${service}\"`) && body.includes(`\"ok\":`),
    `${service} health returned an invalid body`,
  );
  assert(
    Boolean(response.headers.get("x-request-id")),
    `${service} health omitted X-Request-Id`,
  );
}

async function run() {
  const webPort = await getAvailablePort();
  const cmsPort = await getAvailablePort(new Set([webPort]));
  const webProcess = startServer(
    "web",
    path.join(root, ".next-web", "standalone"),
    path.join("apps", "web", "server.js"),
    webPort,
  );
  const cmsProcess = startServer(
    "cms",
    path.join(root, ".next-cms", "standalone"),
    path.join("apps", "cms", "server.js"),
    cmsPort,
  );

  const webOrigin = `http://127.0.0.1:${webPort}`;
  const cmsOrigin = `http://127.0.0.1:${cmsPort}`;
  const authHeaders = basicAuthHeaders();
  await Promise.all([
    checkHealth(webOrigin, "web", webProcess),
    checkHealth(cmsOrigin, "cms", cmsProcess, authHeaders),
  ]);

  const webAdmin = await fetch(`${webOrigin}/login?from=smoke`, {
    redirect: "manual",
  });
  assert(
    [307, 308].includes(webAdmin.status),
    `web /login did not redirect: ${webAdmin.status}`,
  );
  const expectedCmsOrigin = (
    process.env.NEXT_PUBLIC_CMS_URL ?? "https://cms.fwqgo.com"
  ).replace(/\/+$/, "");
  assert(
    webAdmin.headers.get("location") ===
      `${expectedCmsOrigin}/login?from=smoke`,
    "web /login redirect lost its CMS path or query",
  );

  const cmsHome = await fetch(`${cmsOrigin}/`, {
    headers: authHeaders,
    redirect: "manual",
  });
  assert(
    [307, 308].includes(cmsHome.status),
    `CMS home did not redirect unauthenticated user: ${cmsHome.status}`,
  );
  assert(
    cmsHome.headers.get("location")?.endsWith("/login"),
    "CMS home did not redirect to /login",
  );

  const protectedApi = await fetch(`${cmsOrigin}/api/cms/runtime/release`, {
    headers: authHeaders,
    redirect: "manual",
  });
  assert(
    protectedApi.status === 401,
    `CMS protected API returned ${protectedApi.status}`,
  );

  const leakedCmsApi = await fetch(`${webOrigin}/api/cms/runtime/release`, {
    redirect: "manual",
  });
  assert(
    leakedCmsApi.status === 404,
    `CMS API leaked into web app: ${leakedCmsApi.status}`,
  );

  console.log(
    "Built app smoke tests passed: health, redirects, auth boundary, route isolation",
  );
}

try {
  await run();
} catch (error) {
  console.error(output.join(""));
  throw error;
} finally {
  for (const child of processes) child.kill("SIGTERM");
  await Promise.all(
    processes.map((child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => child.once("exit", resolve)),
    ),
  );
}
