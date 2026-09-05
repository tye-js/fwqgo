import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const site = new URL(process.env.PERFORMANCE_SITE_URL ?? "https://fwqgo.com");
const requestedRuns = Number(process.env.PERFORMANCE_RUNS ?? 3);
const runs = Number.isSafeInteger(requestedRuns) ? Math.max(1, Math.min(requestedRuns, 5)) : 3;
const paths = (process.env.PERFORMANCE_PATHS ?? "/,/knowledge,/en/knowledge,/search,/servers").split(",");
if (!["http:", "https:"].includes(site.protocol)) throw new Error("PERFORMANCE_SITE_URL must be an HTTP(S) origin");
if (paths.length > 10 || paths.some((value) => !value.startsWith("/") || value.startsWith("//"))) {
  throw new Error("PERFORMANCE_PATHS must contain up to ten paths within the site");
}

/** @typedef {{http_code: number; exitcode: number; errormsg: string | null; time_namelookup: number; time_connect: number; time_appconnect: number; time_starttransfer: number; time_total: number; size_download: number; http_version: string}} CurlTiming */
/** @param {string} pathname */
async function measure(pathname) {
  let stdout = "";
  try {
    ({ stdout } = await execute("curl", [
    "--silent", "--show-error", "--compressed", "--max-time", "30",
    "--user-agent", "Mozilla/5.0 fwqgo-performance-audit/1.0",
    "--header", "Accept: text/html",
    "--dump-header", "-", "--output", "/dev/null", "--write-out", "\n%{json}",
    new URL(pathname, site).href,
    ], { encoding: "utf8", maxBuffer: 1_000_000 }));
  } catch (error) {
    // curl still emits timing JSON on timeout. Preserve the failed sample and
    // never dump execFile's raw response headers (which may include cookies).
    if (error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string") {
      stdout = error.stdout;
    } else {
      throw new Error("Unable to run curl for the HTTP performance audit");
    }
  }
  const marker = stdout.lastIndexOf("\n{");
  if (marker === -1) throw new Error("curl did not return timing JSON; curl 7.70 or newer is required");
  /** @type {unknown} */
  const parsedTiming = JSON.parse(stdout.slice(marker + 1));
  if (typeof parsedTiming !== "object" || parsedTiming === null) throw new Error("curl returned invalid timing data");
  const timing = /** @type {CurlTiming} */ (parsedTiming);
  const headerLines = stdout.slice(0, marker).split(/\r?\n/);
  /** @type {Record<string, string>} */
  const headers = {};
  for (const line of headerLines) {
    const separator = line.indexOf(":");
    if (separator > 0) headers[line.slice(0, separator).toLowerCase()] = line.slice(separator + 1).trim();
  }
  /** @param {number} seconds */
  const ms = (seconds) => Math.round(seconds * 1000);
  return {
    status: timing.http_code,
    error: timing.exitcode ? (timing.errormsg ?? `curl exit ${timing.exitcode}`) : null,
    dnsMs: ms(timing.time_namelookup),
    tcpMs: ms(Math.max(0, timing.time_connect - timing.time_namelookup)),
    tlsMs: ms(Math.max(0, timing.time_appconnect - timing.time_connect)),
    ttfbMs: ms(timing.time_starttransfer),
    responseMs: ms(Math.max(0, timing.time_total - timing.time_starttransfer)),
    totalMs: ms(timing.time_total),
    transferredBytes: timing.size_download,
    httpVersion: timing.http_version,
    cacheControl: headers["cache-control"] ?? null,
    edgeCache: headers["cf-cache-status"] ?? null,
    nextCache: headers["x-nextjs-cache"] ?? null,
    cfRay: headers["cf-ray"] ?? null,
    serverTiming: headers["server-timing"] ?? null,
    location: headers.location ?? null,
  };
}

const report = {
  createdAt: new Date().toISOString(),
  site: site.origin,
  vantage: process.env.PERFORMANCE_VANTAGE ?? "current machine; network/provider unverified",
  interpretation: "Small-sample HTTP diagnostics from one vantage. Not real-user P75, FCP, LCP, INP or CLS.",
  runs,
  /** @type {Array<{path: string; samples: Awaited<ReturnType<typeof measure>>[]; medianTtfbMs: number}>} */
  pages: [],
};
for (const pathname of paths) {
  const samples = [];
  for (let run = 0; run < runs; run++) samples.push(await measure(pathname));
  const ttfbs = samples.map((sample) => sample.ttfbMs).sort((a, b) => a - b);
  const middle = Math.floor(ttfbs.length / 2);
  const upper = ttfbs[middle] ?? 0;
  const medianTtfbMs = ttfbs.length % 2 ? upper : Math.round(((ttfbs[middle - 1] ?? upper) + upper) / 2);
  report.pages.push({ path: pathname, samples, medianTtfbMs });
  console.log(JSON.stringify({ path: pathname, medianTtfbMs, statuses: samples.map((sample) => sample.status), edge: samples.map((sample) => sample.edgeCache) }));
}
const output = path.resolve("output/performance/latest-http-audit.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`HTTP performance audit written to ${output}`);
