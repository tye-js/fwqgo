import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const webRoutePages = listFiles(join(root, "apps/web/app")).filter((path) =>
  path.endsWith("page.tsx"),
);
const publicSources = listFiles(join(root, "src/features/public"))
  .filter((path) => path.endsWith(".tsx"))
  .map((path) => ({
    path: relative(root, path),
    source: readFileSync(path, "utf8"),
  }));

assert.ok(
  webRoutePages.length >= 26,
  `Expected all public routes to be audited, found ${webRoutePages.length}`,
);

for (const file of publicSources) {
  assert.doesNotMatch(
    file.source,
    /min-h-screen/,
    `${file.path} still uses 100vh instead of the mobile-safe dynamic viewport`,
  );
}

const articleDetail = read("src/features/public/components/article-detail.tsx");
const articleCard = read("src/features/public/components/article-card.tsx");
const header = read("src/features/public/components/header.tsx");
const inventoryResults = read(
  "src/features/public/components/server-inventory-results.tsx",
);
const offerTable = read(
  "src/features/public/components/server-offer-table.tsx",
);
const postViewCount = read(
  "src/features/public/components/post-view-count.tsx",
);

assert.match(articleDetail, /break-words text-2xl/);
assert.match(articleDetail, /flex min-w-0 flex-wrap items-center/);
assert.doesNotMatch(
  articleDetail,
  /flex-nowrap items-center[^"\n]*overflow-hidden/,
);
assert.match(articleDetail, /md:line-clamp-2/);
assert.match(postViewCount, /flex min-h-11 items-center/);

assert.match(articleCard, /min-h-11/);
assert.match(header, /className="lg:hidden"/);
assert.match(header, /max-h-dvh w-\[88vw\]/);
assert.match(header, /<SheetClose asChild>/);

for (const source of [inventoryResults, offerTable]) {
  assert.match(source, /grid gap-3 lg:hidden/);
  assert.match(source, /hidden overflow-x-auto[^"\n]*lg:block/);
  assert.doesNotMatch(source, /grid gap-3 md:hidden/);
  assert.doesNotMatch(source, /hidden overflow-x-auto[^"\n]*md:block/);
}

console.log(
  `Public mobile UI verification passed: ${webRoutePages.length} routes audited, dynamic viewport roots, wrapping article metadata, and dedicated mobile server cards present.`,
);
