import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import * as cheerio from "cheerio";
import { checkPrerenderedArticleMetadata } from "./prerendered-article-metadata.mjs";

const root = process.cwd();
const runtime = process.env.SMOKE_RUNTIME_BIN?.trim() ?? process.execPath;
const configuredSmokeDatabaseUrl = process.env.SMOKE_DATABASE_URL?.trim();
const smokeDatabaseUrl = configuredSmokeDatabaseUrl?.length
  ? configuredSmokeDatabaseUrl
  : "postgresql://smoke:smoke@127.0.0.1:5432/fwqgo_smoke";
/** @type {import("node:child_process").ChildProcess[]} */
const processes = [];
/** @type {string[]} */
const output = [];

/** @param {string} name @param {string} cwd @param {string} entry @param {number} port */
function startServer(name, cwd, entry, port) {
  const child = spawn(runtime, [entry], {
    cwd,
    env: {
      ...process.env,
      DATABASE_URL: smokeDatabaseUrl,
      CMS_DATABASE_URL: smokeDatabaseUrl,
      READ_DATABASE_URL: smokeDatabaseUrl,
      ANALYTICS_DATABASE_URL: smokeDatabaseUrl,
      ENABLE_CMS_BACKGROUND_WORKERS: "false",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
    },
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

function verifySharpRuntime() {
  const cmsDirectory = path.join(
    root,
    ".next-cms",
    "standalone",
    "apps",
    "cms",
  );
  const script = `
import("sharp")
  .then(async ({ default: sharp }) => {
    const output = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    }).webp().toBuffer();
    if (output.subarray(8, 12).toString("ascii") !== "WEBP") {
      throw new Error("sharp did not produce a WebP image");
    }
    process.stdout.write("sharp-webp-ok");
  })
  .catch((error) => {
    console.error(error?.stack ?? error);
    process.exit(1);
  });
`;
  const result = spawnSync(runtime, ["-e", script], {
    cwd: cmsDirectory,
    env: process.env,
    encoding: "utf8",
  });

  assert(
    result.status === 0 && result.stdout.includes("sharp-webp-ok"),
    `Standalone sharp WebP check failed:\n${result.stderr || result.stdout}`,
  );
}

function verifyRe2Runtime() {
  const result = spawnSync(
    runtime,
    [
      "-e",
      `
const { RE2 } = require("re2-wasm");
if (new RE2("^(a|aa)+$", "iu").exec("a".repeat(32000) + "!") !== null) {
  throw new Error("Unexpected RE2 result");
}
process.stdout.write("re2-runtime-ok");
`,
    ],
    {
      cwd: path.join(root, ".next-cms", "standalone", "apps", "cms"),
      env: process.env,
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert(
    result.status === 0 && result.stdout.includes("re2-runtime-ok"),
    `Standalone RE2 check failed:\n${result.stderr || result.stdout}`,
  );
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

/** @param {string} origin @param {string} service @param {import("node:child_process").ChildProcess} child @param {Record<string, string>} [headers] */
async function checkMetadataImages(origin, service, child, headers = {}) {
  for (const pathname of ["/icon.svg", "/favicon.ico", "/apple-icon.png"]) {
    const response = await waitForServer(
      `${origin}${pathname}`,
      child,
      headers,
    );
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.arrayBuffer();
    assert(
      response.status === 200,
      `${service} ${pathname} returned ${response.status}`,
    );
    assert(
      contentType.toLowerCase().startsWith("image/"),
      `${service} ${pathname} returned ${contentType || "no content type"}`,
    );
    assert(
      body.byteLength > 0,
      `${service} ${pathname} returned an empty body`,
    );
  }
}

/** @param {string} directory @returns {string[]} */
function listHtmlFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return statSync(target).isDirectory()
      ? listHtmlFiles(target)
      : target.endsWith(".html")
        ? [target]
        : [];
  });
}

function checkPrerenderedArticleShells() {
  for (const relativeDirectory of [
    ".next-web/server/app/fwq/posts",
    ".next-web/server/app/en/fwq/posts",
  ]) {
    let realArticleCount = 0;
    const directory = path.join(root, relativeDirectory);
    const htmlFiles = listHtmlFiles(directory).filter(
      (file) => !file.endsWith(`${path.sep}[slug].html`),
    );
    assert(
      htmlFiles.length > 0,
      `${relativeDirectory} contains no prerendered article parameter`,
    );

    for (const file of htmlFiles) {
      const relativePath = path.relative(root, file);
      const html = readFileSync(file, "utf8");
      const segmentIds = [
        ...html.matchAll(/<(?:div|template)[^>]*\bid="(S:\d+)"/g),
      ].map((match) => match[1]);
      assert(
        new Set(segmentIds).size === segmentIds.length,
        `${relativePath} contains duplicate streamed resume segment IDs`,
      );

      const { isPlaceholder } = checkPrerenderedArticleMetadata(
        relativePath,
        html,
      );

      if (!isPlaceholder) {
        realArticleCount += 1;
        const $ = cheerio.load(html);
        const prose = $("article .article-prose").first();
        const proseText = prose.text().replace(/\s+/g, " ").trim();
        assert(
          prose.length === 1 && proseText.length >= 200,
          `${relativePath} omitted article prose from its prerendered HTML`,
        );
        assert(
          prose.parents("[hidden]").length === 0,
          `${relativePath} kept article prose inside a hidden resume segment`,
        );
      }
    }

    if (process.env.ARTICLE_ISR_REQUIRE_REAL_PRERENDER === "1") {
      assert(
        realArticleCount > 0,
        `${relativeDirectory} contains no real prerendered article`,
      );
    }
  }
}

/** @param {string} origin @param {import('node:child_process').ChildProcess} child */
async function checkArticleCacheBoundaries(origin, child) {
  for (const pathname of [
    "/fwq/posts/__fwqgo_article_static_shell__",
    "/en/fwq/posts/__fwqgo_article_static_shell__",
  ]) {
    const response = await waitForServer(`${origin}${pathname}`, child);
    assert(response.status === 404, `${pathname} did not return a real 404`);
    assert(
      response.headers.get("x-robots-tag")?.includes("noindex"),
      `${pathname} omitted its noindex response policy`,
    );
    await response.body?.cancel();
  }

  const rscResponse = await fetch(
    `${origin}/fwq/posts/built-smoke-rsc?_rsc=built-smoke`,
    {
      redirect: "manual",
      headers: {
        RSC: "1",
        "Next-Router-Prefetch": "1",
      },
    },
  );
  assert(
    !rscResponse.headers.get("cache-control")?.includes("s-maxage=900"),
    "Article RSC prefetch inherited the public HTML cache policy",
  );
  await rscResponse.body?.cancel();
}

async function run() {
  verifySharpRuntime();
  verifyRe2Runtime();
  checkPrerenderedArticleShells();

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
  await Promise.all([
    checkMetadataImages(webOrigin, "web", webProcess),
    checkMetadataImages(cmsOrigin, "cms", cmsProcess, authHeaders),
  ]);
  await checkArticleCacheBoundaries(webOrigin, webProcess);

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
    "Built app smoke tests passed: sharp WebP, RE2 WASM, health, metadata images, redirects, auth boundary, route isolation, article ISR and RSC cache isolation",
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
