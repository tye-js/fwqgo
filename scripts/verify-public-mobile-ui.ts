import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
let mappedWebRouteCount = 0;
for (const routePage of webRoutePages) {
  const appRelativePath = relative(join(root, "apps/web/app"), routePage);
  const routePath = appRelativePath
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .join("/");
  const source = readFileSync(routePage, "utf8");

  if (routePath.includes("[...notFound]")) {
    assert.match(source, /notFound\(\)/, `${appRelativePath} must delegate to notFound()`);
    continue;
  }

  const featurePath = join(root, "src/features/public/routes", routePath);
  const featureImport = `@/features/public/routes/${routePath.replace(/\.tsx$/, "")}`;
  assert.ok(
    existsSync(featurePath),
    `${appRelativePath} is missing its public feature route: ${relative(root, featurePath)}`,
  );
  assert.ok(
    source.includes(featureImport),
    `${appRelativePath} does not delegate to ${featureImport}`,
  );
  mappedWebRouteCount += 1;
}

const publicRoutePages = listFiles(join(root, "src/features/public/routes")).filter(
  (path) => path.endsWith("page.tsx"),
);
assert.equal(
  mappedWebRouteCount,
  publicRoutePages.length,
  "Every public feature page must have exactly one app route entry",
);
const delegatedPublicShells = new Set([
  "en/knowledge/[slug]/page.tsx",
  "en/knowledge/page.tsx",
  "en/tools/server-sizing/page.tsx",
]);
for (const routePage of publicRoutePages) {
  const routeRelativePath = relative(
    join(root, "src/features/public/routes"),
    routePage,
  );
  const source = readFileSync(routePage, "utf8");
  const usesChineseFwqLayout = routeRelativePath.startsWith("fwq/");
  assert.ok(
    source.includes("min-h-dvh") ||
      usesChineseFwqLayout ||
      delegatedPublicShells.has(routeRelativePath),
    `${routeRelativePath} has no dynamic viewport shell or explicit layout delegate`,
  );
}
const publicSources = listFiles(join(root, "src/features/public"))
  .filter((path) => path.endsWith(".tsx"))
  .map((path) => ({
    path: relative(root, path),
    source: readFileSync(path, "utf8"),
  }));

assert.equal(webRoutePages.length, 26, "Expected the complete public page route set");

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
const featuredOffers = read(
  "src/features/public/components/featured-offer-list.tsx",
);
const footer = read("src/features/public/components/footer.tsx");
const knowledgeCard = read("src/features/public/components/knowledge-card.tsx");
const fwqLayout = read("src/features/public/routes/fwq/layout.tsx");
const zhHome = read("src/features/public/routes/page.tsx");
const enHome = read("src/features/public/routes/en/page.tsx");
const sizingCalculator = read(
  "src/features/public/components/server-sizing-calculator.tsx",
);
const latestPostsSidebar = read(
  "src/features/public/components/latest-posts-sidebar.tsx",
);
const serverTopic = read("src/features/public/routes/servers/[topic]/page.tsx");
const serverCollection = read(
  "src/features/public/components/server-offer-collection-page.tsx",
);
const zhArticle = read(
  "src/features/public/routes/fwq/posts/[slug]/page.tsx",
);
const enArticle = read(
  "src/features/public/routes/en/fwq/posts/[slug]/page.tsx",
);
const tagContext = read(
  "src/features/public/components/tag-context-sidebar.tsx",
);
const scrollToTop = read("src/features/public/components/scroll-to-top.tsx");
const select = read("src/components/ui/select.tsx");
const dropdown = read("src/components/ui/dropdown-menu.tsx");
const styles = read("src/styles/globals.css");

assert.match(articleDetail, /break-words text-2xl/);
assert.match(articleDetail, /flex min-w-0 flex-wrap items-center/);
assert.doesNotMatch(
  articleDetail,
  /flex-nowrap items-center[^"\n]*overflow-hidden/,
);
assert.match(articleDetail, /md:line-clamp-2/);
assert.match(postViewCount, /flex min-h-11 items-center/);
assert.match(featuredOffers, /basis-52 break-words/);
assert.match(featuredOffers, /mt-1 break-words/);
assert.match(featuredOffers, /flex flex-wrap gap-2/);
assert.match(footer, /grid grid-cols-1 gap-2 min-\[420px\]:grid-cols-3/);
assert.match(footer, /block break-words text-xs leading-5/);
assert.match(knowledgeCard, /flex min-w-0 flex-wrap/);
assert.match(knowledgeCard, /className="break-words"/);
assert.match(fwqLayout, /flex min-h-dvh flex-col/);
assert.doesNotMatch(fwqLayout, /min-h-\[90vh\]/);
for (const home of [zhHome, enHome]) {
  assert.match(home, /min-w-0 flex-1 break-words text-foreground/);
  assert.match(home, /max-w-\[45%\] shrink-0 break-all/);
}
assert.match(sizingCalculator, /whitespace-normal break-words px-2 text-center/);
for (const source of [latestPostsSidebar, serverTopic, serverCollection]) {
  assert.match(source, /min-h-11[^"\n]*md:min-h-9/);
}
for (const source of [zhArticle, enArticle]) {
  assert.match(source, /min-h-11[^"\n]*md:min-h-8/);
}
assert.match(tagContext, /inline-flex min-h-11[^"\n]*xl:min-h-8/);
assert.match(scrollToTop, /safe-area-inset-bottom/);
assert.match(select, /radix-select-content-available-height/);
assert.match(select, /max-w-\[calc\(100vw-1\.5rem\)\]/);
assert.match(dropdown, /radix-dropdown-menu-content-available-height/);
assert.match(dropdown, /overflow-x-hidden overflow-y-auto overscroll-contain/);
assert.match(
  styles,
  /@media \(max-width: 767px\)[\s\S]*input,[\s\S]*textarea,[\s\S]*select[\s\S]*font-size: 1rem !important/,
);

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
  `Public mobile UI verification passed: ${webRoutePages.length} app pages mapped to ${publicRoutePages.length} feature routes, dynamic viewport roots, mobile touch targets, and dedicated server cards present.`,
);
