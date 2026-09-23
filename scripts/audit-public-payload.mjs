#!/usr/bin/env node
/**
 * Audit the HTML, inline RSC payload and JavaScript weight of public pages.
 *
 * The strategy doc carried "563 KB / 781 KB" as if it were a transfer size. It is
 * the uncompressed HTML; the same documents are ~85 KB compressed, so a payload
 * decision has to start from these numbers instead of that figure.
 *
 * Measurement units matter more than the headline here. Every JS row is reported
 * twice: **transfer** is what actually crosses the wire (measured on raw bytes,
 * see measureScripts), **decoded** is what the parser sees afterwards. Reporting
 * the decoded size as "transfer" is how this script once claimed 710 KB for the
 * homepage when the wire cost was 226 KB.
 *
 * Usage:
 *   bun run audit:public-payload
 *   bun run audit:public-payload https://fwqgo.com/ https://fwqgo.com/servers
 */
import http from "node:http";
import https from "node:https";
import { gzipSync } from "node:zlib";

const DEFAULT_URLS = ["https://fwqgo.com/", "https://fwqgo.com/servers"];
const urls = process.argv.slice(2).filter((value) => !value.startsWith("-"));
const targets = urls.length > 0 ? urls : DEFAULT_URLS;

/**
 * @param {string} value
 * @returns {number}
 */
function bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

/**
 * @param {number} value
 * @returns {string}
 */
function format(value) {
  return value.toLocaleString("en-US");
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function flightChunks(html) {
  /** @type {string[]} */
  const chunks = [];
  for (const match of html.matchAll(
    /self\.__next_f\.push\((\[.*?\])\)<\/script>/gs,
  )) {
    const raw = match[1];
    if (typeof raw !== "string") continue;
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        typeof parsed[1] === "string"
      ) {
        chunks.push(parsed[1]);
      }
    } catch {
      // A truncated chunk cannot be measured; skip it rather than abort.
    }
  }
  return chunks;
}

/**
 * Exact duplicate RSC rows: the same server subtree serialised under more than
 * one row. Identical strings compress away, so read this as a hint that segment
 * boundaries repeat work, not as a byte saving.
 *
 * @param {string[]} chunks
 * @returns {number}
 */
function duplicateRowBytes(chunks) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const chunk of chunks) {
    for (const row of chunk.split("\n")) {
      const separator = row.indexOf(":");
      if (separator <= 0) continue;
      const body = row.slice(separator + 1);
      if (bytes(body) < 2000) continue;
      seen.set(body, (seen.get(body) ?? 0) + 1);
    }
  }
  let total = 0;
  for (const [body, count] of seen) {
    if (count > 1) total += bytes(body) * (count - 1);
  }
  return total;
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function scriptSources(html) {
  /** @type {Set<string>} */
  const sources = new Set();
  for (const match of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) {
    const source = match[1];
    if (typeof source === "string") sources.add(source);
  }
  return [...sources];
}

/**
 * Count the raw bytes of a response without letting anything decompress it.
 *
 * `fetch` cannot be used for this: undici honours the accept-encoding it sends,
 * decompresses the body itself and drops the content-encoding header, so
 * `arrayBuffer().byteLength` is the *decoded* size. `node:http(s)` hands over the
 * bytes as they arrived, which is what a transfer claim has to be based on.
 *
 * @param {URL} url
 * @param {Record<string, string>} headers
 * @returns {Promise<{ bytes: number; encoding: string }>}
 */
function requestBytes(url, headers) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, { headers }, (response) => {
      let received = 0;
      response.on("data", (/** @type {Buffer} */ chunk) => {
        received += chunk.length;
      });
      response.on("end", () => {
        resolve({
          bytes: received,
          encoding: String(response.headers["content-encoding"] ?? "(identity)"),
        });
      });
    });
    request.on("error", reject);
    request.setTimeout(20_000, () => {
      request.destroy(new Error(`timed out fetching ${url.href}`));
    });
  });
}

/**
 * The HTML carries the document, but the JavaScript bundle gates LCP. Measure it
 * too, so a payload conversation does not spend effort on the cheaper half.
 *
 * Each file is requested twice: once negotiated (transfer) and once with
 * `identity` (decoded), so the two units cannot be confused in the report.
 *
 * @param {string[]} sources
 * @param {string} baseUrl
 * @returns {Promise<{ files: number; transfer: number; decoded: number; encoding: string }>}
 */
async function measureScripts(sources, baseUrl) {
  let transfer = 0;
  let decoded = 0;
  let files = 0;
  /** @type {Set<string>} */
  const encodings = new Set();
  for (const source of sources) {
    const url = new URL(source, baseUrl);
    try {
      const compressed = await requestBytes(url, {
        "accept-encoding": "br, gzip, zstd",
      });
      const plain = await requestBytes(url, { "accept-encoding": "identity" });
      transfer += compressed.bytes;
      decoded += plain.bytes;
      files += 1;
      encodings.add(compressed.encoding);
    } catch {
      // A chunk that cannot be fetched is reported by omission.
    }
  }
  return {
    files,
    transfer,
    decoded,
    encoding: [...encodings].join(", ") || "(identity)",
  };
}

/**
 * @param {string} html
 * @returns {number}
 */
function inlineScriptCount(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length;
}

/**
 * @param {string} html
 * @returns {{ count: number; bytes: number }}
 */
function inlineSvgStats(html) {
  let count = 0;
  let total = 0;
  for (const match of html.matchAll(/<svg[\s\S]*?<\/svg>/g)) {
    const svg = match[0];
    if (typeof svg !== "string") continue;
    count += 1;
    total += bytes(svg);
  }
  return { count, bytes: total };
}

for (const url of targets) {
  const response = await fetch(url, {
    headers: { "user-agent": "fwqgo-payload-audit" },
  });
  const html = await response.text();
  const total = bytes(html);
  const chunks = flightChunks(html);
  let flight = 0;
  for (const chunk of chunks) flight += bytes(chunk);
  const bodyStart = html.indexOf("<body");
  const svg = inlineSvgStats(html);
  const js = await measureScripts(scriptSources(html), url);

  console.log(`\n${url}`);
  console.log(`  status                  ${response.status}`);
  console.log(
    `  edge cache              ${response.headers.get("cf-cache-status") ?? "-"}`,
  );
  console.log(
    `  html encoding           ${response.headers.get("content-encoding") ?? "(identity)"}`,
  );
  console.log(`  html total (decoded)    ${format(total)} bytes`);
  console.log(
    `  html gzip -9            ${format(gzipSync(html, { level: 9 }).length)} bytes`,
  );
  console.log(
    `  head (before <body>)    ${format(bodyStart > 0 ? bytes(html.slice(0, bodyStart)) : 0)} bytes`,
  );
  console.log(`  inline <script> tags    ${format(inlineScriptCount(html))}`);
  console.log(
    `  inline RSC payload      ${format(flight)} bytes (${Math.round((flight * 100) / total)}% of decoded html)`,
  );
  console.log(`  markup excluding RSC    ${format(total - flight)} bytes`);
  console.log(
    `  inline <svg>            ${format(svg.bytes)} bytes across ${svg.count} tags`,
  );
  console.log(
    `  duplicate RSC rows      ${format(duplicateRowBytes(chunks))} bytes (identical strings, compress away)`,
  );
  console.log(`  external js files       ${format(js.files)}`);
  console.log(
    `  external js transfer    ${format(js.transfer)} bytes (${js.encoding})`,
  );
  console.log(`  external js decoded     ${format(js.decoded)} bytes`);
}
