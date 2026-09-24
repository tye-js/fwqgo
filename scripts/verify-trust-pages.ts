import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  TRUST_PAGE_SLUGS,
  trustPagePath,
  type PublicLanguage,
} from "../src/features/public/lib/site-contact";

/**
 * Trust pages are the E-E-A-T surface of the site, and they fail quietly: a
 * slug without a route 404s, a nav that forgets one leaves an orphan page, and
 * a call-to-action that points at a route which does not exist looks like a
 * broken product rather than a broken link. All three have happened while
 * building the English tree, where `/en/servers` does not exist yet. This guard
 * keeps the slug list, the filesystem, the two navigation surfaces and the
 * in-page links in agreement.
 */
const APP_ROOT = path.join("apps", "web", "app");
const LANGUAGES: PublicLanguage[] = ["zh", "en"];

function pageFiles() {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx" || entry.name === "route.ts") {
        found.push(full);
      }
    }
  };
  walk(APP_ROOT);
  return found;
}

/** `/apps/web/app/(zh)/about/page.tsx` -> `/about`; route groups are erased. */
function toRoute(file: string) {
  const relative = path.relative(APP_ROOT, path.dirname(file));
  const segments = relative
    .split(path.sep)
    .filter((segment) => segment && !/^\(.*\)$/.test(segment));
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

const routeFiles = pageFiles();
const staticRoutes = new Set<string>();
const dynamicRoutes: RegExp[] = [];

for (const file of routeFiles) {
  const route = toRoute(file);
  const segments = route.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("[..."))) continue;
  if (segments.some((segment) => segment.startsWith("["))) {
    dynamicRoutes.push(
      new RegExp(
        `^${route
          .split("/")
          .map((segment) =>
            segment.startsWith("[") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("/")}$`,
      ),
    );
    continue;
  }
  staticRoutes.add(route);
}

function routeExists(href: string) {
  const [withoutQuery = ""] = href.split("?");
  const [pathname = ""] = withoutQuery.split("#");
  const normalised = pathname.replace(/\/$/, "") || "/";
  if (staticRoutes.has(normalised)) return true;
  return dynamicRoutes.some((pattern) => pattern.test(normalised));
}

// 1. Every declared slug has a route in both language trees, and the path
//    helper the sitemap and navigation consume agrees with the filesystem.
for (const slug of TRUST_PAGE_SLUGS) {
  for (const language of LANGUAGES) {
    const route = trustPagePath(slug, language);
    const expected = path.join(
      APP_ROOT,
      language === "en" ? "(en)/en" : "(zh)",
      slug,
      "page.tsx",
    );
    assert.ok(
      existsSync(expected),
      `trust page route missing for ${language}: expected ${expected}`,
    );
    assert.ok(
      routeExists(route),
      `trustPagePath("${slug}", "${language}") = ${route} does not match a route`,
    );
  }
}

// 2. Both navigation surfaces must cover every slug; a dropped entry turns the
//    page into an orphan that only the sitemap can reach.
// 2026-09-23：移动端抽屉从 header.tsx 拆到了 mobile-nav-drawer.tsx
// （为了把它依赖的 Radix Sheet 挪出首屏），信任页链接跟着搬过去了。
for (const file of [
  path.join("src", "features", "public", "components", "footer.tsx"),
  path.join("src", "features", "public", "components", "mobile-nav-drawer.tsx"),
]) {
  const source = readFileSync(file, "utf8");
  for (const slug of TRUST_PAGE_SLUGS) {
    assert.ok(
      source.includes(`"${slug}"`),
      `${file} does not link the "${slug}" trust page`,
    );
  }
}

// 3. In-page calls to action must resolve. The English About page originally
//    sent "Plan comparison" to /en/knowledge because /en/servers does not
//    exist, which is a label that lies about where the reader lands.
const trustRenderers = [
  path.join("src", "features", "public", "components", "about-page.tsx"),
  path.join("src", "features", "public", "components", "trust-document-page.tsx"),
];

for (const file of trustRenderers) {
  const source = readFileSync(file, "utf8");
  // Collect every root-relative string literal, not just `href=` attributes:
  // these components also build hrefs through conditional consts
  // (`english ? "/en/knowledge" : "/servers"`), which a narrow attribute regex
  // would skip — and that is exactly where the bad target hid.
  const hrefs = [...source.matchAll(/["'`](\/[^"'`\n]*)["'`]/g)]
    .map((match) => match[1])
    .filter((href): href is string => Boolean(href));
  assert.ok(hrefs.length > 0, `${file} declares no internal links`);
  for (const href of hrefs) {
    assert.ok(routeExists(href), `${file} links ${href}, which has no route`);
  }
}

// 4. The English About page may only advertise capabilities that the English
//    tree can actually serve; pointing at a Chinese-only table is acceptable
//    only where the shared footer already does the same thing.
assert.ok(
  staticRoutes.has("/servers"),
  "the shared offer comparison route /servers is missing",
);

console.log(
  `Trust pages verified: ${TRUST_PAGE_SLUGS.length} slugs across ${LANGUAGES.length} languages, ${staticRoutes.size} static routes.`,
);
