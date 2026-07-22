import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function parseRouteManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Route manifest must be an object");
  }

  const entries = Object.entries(value);
  const invalidEntry = entries.find(([, route]) => typeof route !== "string");

  if (invalidEntry) {
    throw new Error(`Invalid route manifest entry: ${invalidEntry[0]}`);
  }

  return /** @type {Record<string, string>} */ (value);
}

/**
 * @param {string} distDir
 * @returns {Record<string, string>}
 */
function readManifest(distDir) {
  const manifestCandidates = [
    path.join(root, distDir, "app-path-routes-manifest.json"),
    path.join(root, distDir, "server", "app-path-routes-manifest.json"),
  ];
  const manifestPath = manifestCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );

  if (!manifestPath) {
    throw new Error(
      `Missing route manifest. Checked:\n${manifestCandidates.join("\n")}`,
    );
  }

  return parseRouteManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
}

/**
 * @param {string} distDir
 * @returns {string[]}
 */
function getRoutes(distDir) {
  const manifest = readManifest(distDir);
  return Object.values(manifest).sort();
}

/**
 * @param {{
 *   appName: string;
 *   routes: string[];
 *   blockedPrefixes: string[];
 *   allowedRoutes?: string[];
 * }} options
 */
function assertNoRoutes({
  appName,
  routes,
  blockedPrefixes,
  allowedRoutes = [],
}) {
  const allowed = new Set(allowedRoutes);
  const invalidRoutes = routes.filter(
    (route) =>
      !allowed.has(route) &&
      blockedPrefixes.some(
        (prefix) => route === prefix || route.startsWith(`${prefix}/`),
      ),
  );

  if (invalidRoutes.length > 0) {
    throw new Error(
      `${appName} contains routes outside its boundary:\n${invalidRoutes.join(
        "\n",
      )}`,
    );
  }
}

const webRoutes = getRoutes(".next-web");
const cmsRoutes = getRoutes(".next-cms");

assertNoRoutes({
  appName: "web",
  routes: webRoutes,
  blockedPrefixes: [
    "/login",
    "/signup",
    "/api/auth",
    "/api/upload",
    "/ai-rewrite",
    "/ai-tasks",
    "/collect",
    "/images",
    "/posts",
    "/seo",
    "/settings",
  ],
});

assertNoRoutes({
  appName: "cms",
  routes: cmsRoutes,
  blockedPrefixes: ["/fwq", "/go", "/en/fwq", "/sitemap.xml"],
});

console.log(
  `App route boundaries verified: web=${webRoutes.length} routes, cms=${cmsRoutes.length} routes`,
);
