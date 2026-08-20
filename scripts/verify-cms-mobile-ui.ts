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

const cmsFiles = listFiles(join(root, "src/features/cms"))
  .filter((path) => path.endsWith(".tsx"))
  .map((path) => ({
    path: relative(root, path),
    source: readFileSync(path, "utf8"),
  }));

const cmsAppRoutePages = listFiles(join(root, "apps/cms/app")).filter((path) =>
  path.endsWith("page.tsx"),
);
const cmsFeatureRoutePages = listFiles(
  join(root, "src/features/cms/routes"),
).filter((path) => path.endsWith("page.tsx"));
let mappedCmsRouteCount = 0;
for (const routePage of cmsAppRoutePages) {
  const appRelativePath = relative(join(root, "apps/cms/app"), routePage);
  const segments = appRelativePath.split("/");
  const routeGroup = segments.shift();
  assert.ok(routeGroup, `${appRelativePath} must live in a CMS route group`);
  const featureGroup = routeGroup === "(admin)" ? "admin" : routeGroup;
  const featureRelativePath = [featureGroup, ...segments].join("/");
  const featurePath = join(
    root,
    "src/features/cms/routes",
    featureRelativePath,
  );
  const featureImport = `@/features/cms/routes/${featureRelativePath.replace(/\.tsx$/, "")}`;
  const source = readFileSync(routePage, "utf8");

  assert.ok(
    existsSync(featurePath),
    `${appRelativePath} is missing its CMS feature route: ${relative(root, featurePath)}`,
  );
  assert.ok(
    source.includes(featureImport),
    `${appRelativePath} does not delegate to ${featureImport}`,
  );
  mappedCmsRouteCount += 1;
}
assert.equal(
  mappedCmsRouteCount,
  cmsFeatureRoutePages.length,
  "Every CMS feature page must have exactly one app route entry",
);
const delegatedCmsShells = new Set([
  "admin/ai-tasks/[id]/page.tsx",
  "admin/ai-tasks/page.tsx",
  "admin/posts/drafts/page.tsx",
  "admin/servers/page.tsx",
]);
for (const routePage of cmsFeatureRoutePages) {
  const routeRelativePath = relative(
    join(root, "src/features/cms/routes"),
    routePage,
  );
  const source = readFileSync(routePage, "utf8");
  assert.ok(
    source.includes("AdminPageShell") ||
      source.includes("min-h-dvh") ||
      delegatedCmsShells.has(routeRelativePath),
    `${routeRelativePath} has no AdminPageShell, auth viewport shell, or explicit delegate`,
  );
}

const dedicatedResponsiveTables = new Set<string>([
  "src/features/cms/components/posts-tables.tsx",
  "src/features/cms/components/image-asset-manager.tsx",
]);

let responsiveTableCount = 0;
let labeledNativeCellCount = 0;
for (const file of cmsFiles) {
  const tableTags = [
    ...(file.source.match(/<Table\b[^>]*>/g) ?? []),
    ...(file.source.match(/<table\b[^>]*>/g) ?? []),
  ];

  for (const tag of tableTags) {
    if (tag.includes("cms-mobile-sticky-actions")) {
      responsiveTableCount += 1;
      continue;
    }

    assert.ok(
      dedicatedResponsiveTables.has(file.path),
      `${file.path} has a CMS table without a mobile card strategy: ${tag}`,
    );
    assert.match(file.source, /grid(?: min-w-0)? gap-3 (?:lg|xl):hidden/);
    assert.match(file.source, /hidden[^"\n]*(?:lg|xl):block/);
  }

  for (const tableBlock of file.source.match(/<table\b[\s\S]*?<\/table>/g) ??
    []) {
    if (!tableBlock.includes("cms-mobile-sticky-actions")) continue;
    for (const cellTag of tableBlock.match(/<td\b[^>]*>/g) ?? []) {
      if (/\bcolSpan=/.test(cellTag)) continue;
      assert.match(
        cellTag,
        /data-mobile-label=/,
        `${file.path} has an unlabeled native mobile table cell: ${cellTag}`,
      );
      labeledNativeCellCount += 1;
    }
  }
}

const mobileHook = read("src/hooks/use-mobile.tsx");
const sidebar = read("src/components/ui/sidebar.tsx");
const table = read("src/components/ui/table.tsx");
const checkbox = read("src/components/ui/checkbox.tsx");
const switchControl = read("src/components/ui/switch.tsx");
const dialog = read("src/components/ui/dialog.tsx");
const sheet = read("src/components/ui/sheet.tsx");
const styles = read("src/styles/globals.css");
const unsavedGuard = read(
  "src/features/cms/hooks/use-unsaved-changes-guard.ts",
);
const postList = read("src/features/cms/components/posts-tables.tsx");
const mobilePostListStart = postList.indexOf(
  'className="grid min-w-0 gap-3 xl:hidden"',
);
const desktopPostListStart = postList.indexOf(
  'className="hidden overflow-x-auto rounded-md border border-border/70 xl:block"',
);
assert.ok(
  mobilePostListStart >= 0 && desktopPostListStart > mobilePostListStart,
  "Article list must keep a distinct mobile card region before the desktop table",
);
const mobilePostList = postList.slice(
  mobilePostListStart,
  desktopPostListStart,
);
const adminLayout = read("src/features/cms/routes/admin/layout.tsx");
const loginPage = read("src/features/cms/routes/(auth)/login/page.tsx");
const signupPage = read("src/features/cms/routes/(auth)/signup/page.tsx");
const select = read("src/components/ui/select.tsx");
const dropdown = read("src/components/ui/dropdown-menu.tsx");

assert.match(mobileHook, /MOBILE_BREAKPOINT = 1024/);
assert.match(sidebar, /text-sidebar-foreground lg:block/);
assert.match(sidebar, /transition-\[left,right,width\][^"\n]*lg:flex/);
assert.doesNotMatch(sidebar, /text-sidebar-foreground md:block/);
assert.equal(
  cmsAppRoutePages.length,
  33,
  "Expected the complete CMS page route set",
);
assert.match(adminLayout, /cms-theme min-h-dvh/);
assert.match(adminLayout, /SidebarInset className="min-w-0"/);
assert.match(adminLayout, /min-w-0 overflow-x-hidden/);
assert.match(adminLayout, /safe-area-inset-top/);
for (const authPage of [loginPage, signupPage]) {
  assert.match(authPage, /min-h-dvh/);
  assert.match(authPage, /px-4 py-10/);
}
assert.match(signupPage, /inline-flex size-11/);
assert.match(select, /radix-select-content-available-height/);
assert.match(dropdown, /radix-dropdown-menu-content-available-height/);
assert.match(
  styles,
  /@media \(max-width: 767px\)[\s\S]*input,[\s\S]*textarea,[\s\S]*select[\s\S]*font-size: 1rem !important/,
);

assert.ok(responsiveTableCount >= 20, "Expected all wide CMS tables to opt in");
assert.match(table, /useLayoutEffect/);
assert.match(table, /data-mobile-label/);
assert.match(styles, /content: attr\(data-mobile-label\)/);
assert.match(styles, /:last-child:not\(\[colspan\]\)/);
const tabletStickyActionsStart = styles.indexOf("@media (max-width: 1279px)");
const mobileCardTableStart = styles.indexOf(
  "@media (max-width: 1023px)",
  tabletStickyActionsStart,
);
assert.ok(tabletStickyActionsStart >= 0);
assert.ok(mobileCardTableStart > tabletStickyActionsStart);
const tabletStickyActionsStyles = styles.slice(
  tabletStickyActionsStart,
  mobileCardTableStart,
);
assert.match(
  tabletStickyActionsStyles,
  /\.cms-mobile-sticky-actions tr > :last-child:not\(\[colspan\]\)/,
);
assert.match(
  tabletStickyActionsStyles,
  /cms-mobile-sticky-actions tbody > tr > td:last-child[\s\S]*:where\(button, a, \[role="button"\]\)[\s\S]*min-height: 2\.75rem/,
);
assert.match(
  styles,
  /@media \(max-width: 1023px\) \{\s+\.cms-mobile-sticky-actions \{/,
);
assert.match(
  styles,
  /cms-mobile-sticky-actions tbody > tr > td[\s\S]*\.truncate[\s\S]*-webkit-line-clamp: unset/,
);
assert.match(
  styles,
  /cms-mobile-sticky-actions tbody > tr > td[\s\S]*\.whitespace-nowrap[\s\S]*white-space: normal !important/,
);

assert.match(checkbox, /size-11/);
assert.match(switchControl, /size-11/);
assert.match(dialog, /w-\[calc\(100%-1\.5rem\)\]/);
assert.match(dialog, /safe-area-inset-bottom/);
assert.match(sheet, /safe-area-inset-top/);
assert.match(styles, /cms-mobile-save-bar/);
assert.match(unsavedGuard, /popstate/);
assert.match(unsavedGuard, /window\.history\.forward\(\)/);

assert.match(postList, /选择本页 \$\{sortedPosts\.length\} 篇文章/);
assert.match(postList, /actionDisclosureId="post-bulk-actions"/);
assert.match(postList, /打开完整编辑/);
assert.match(postList, /className="block break-words text-base/);
assert.match(postList, /break-all font-mono text-foreground/);
assert.match(postList, /批量操作 · \{selectedIds\.length\}/);
assert.match(
  postList,
  /sticky top-\[calc\(3\.5rem\+env\(safe-area-inset-top\)\)\][^\"]*xl:hidden/,
);
assert.match(postList, /grid min-w-0 gap-3 xl:hidden/);
assert.match(postList, /hidden overflow-x-auto[^"\n]*xl:block/);
assert.match(
  postList,
  /grid min-w-0 grid-cols-1[^"\n]*min-\[480px\]:grid-cols-2/,
);
assert.match(
  postList,
  /className="(?=[^"]*min-h-11)(?=[^"]*min-w-0)(?=[^"]*w-full)(?=[^"]*whitespace-normal)(?=[^"]*break-words)[^"]*min-\[480px\]:col-span-2"[\s\S]*打开完整编辑/,
);
assert.match(
  postList,
  /className="(?=[^"]*min-h-11)(?=[^"]*min-w-0)(?=[^"]*w-full)(?=[^"]*whitespace-normal)(?=[^"]*break-words)[^"]*"[\s\S]*快速编辑[\s\S]*className="(?=[^"]*min-h-11)(?=[^"]*min-w-0)(?=[^"]*w-full)(?=[^"]*whitespace-normal)(?=[^"]*break-words)[^"]*"[\s\S]*删除/,
);
assert.doesNotMatch(
  mobilePostList,
  /truncate|line-clamp/,
  "Mobile article cards must expose long values instead of truncating them",
);
assert.match(mobilePostList, /break-all font-mono text-foreground/);
assert.match(mobilePostList, /快速编辑/);
assert.match(mobilePostList, /删除/);
const postListPage = read("src/features/cms/routes/admin/posts/edit/page.tsx");
assert.match(postListPage, /grid grid-cols-3 gap-2 sm:flex sm:flex-wrap/);
assert.match(postListPage, /className="min-h-11 w-full sm:w-auto"/);
const imageManager = read(
  "src/features/cms/components/image-asset-manager.tsx",
);
assert.match(imageManager, /grid gap-3 xl:hidden/);
assert.match(imageManager, /hidden overflow-x-auto[^"\n]*xl:block/);

console.log(
  `CMS mobile UI verification passed: ${cmsAppRoutePages.length} app pages mapped to ${cmsFeatureRoutePages.length} feature routes, ${responsiveTableCount} responsive tables, ${labeledNativeCellCount} native cells labeled, and adaptive navigation guards present.`,
);
