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

const cmsFiles = listFiles(join(root, "src/features/cms"))
  .filter((path) => path.endsWith(".tsx"))
  .map((path) => ({
    path: relative(root, path),
    source: readFileSync(path, "utf8"),
  }));

const dedicatedResponsiveTables = new Set<string>([
  "src/features/cms/components/posts-tables.tsx",
  "src/features/cms/components/image-asset-manager.tsx",
]);

let responsiveTableCount = 0;
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
    assert.match(file.source, /grid gap-3 lg:hidden/);
    assert.match(file.source, /hidden[^"\n]*lg:block/);
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

assert.match(mobileHook, /MOBILE_BREAKPOINT = 1024/);
assert.match(sidebar, /text-sidebar-foreground lg:block/);
assert.match(sidebar, /transition-\[left,right,width\][^"\n]*lg:flex/);
assert.doesNotMatch(sidebar, /text-sidebar-foreground md:block/);

assert.ok(responsiveTableCount >= 20, "Expected all wide CMS tables to opt in");
assert.match(table, /useLayoutEffect/);
assert.match(table, /data-mobile-label/);
assert.match(styles, /content: attr\(data-mobile-label\)/);
assert.match(styles, /:last-child:not\(\[colspan\]\)/);
assert.match(
  styles,
  /@media \(max-width: 1023px\) \{\s+\.cms-mobile-sticky-actions \{/,
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

console.log(
  `CMS mobile UI verification passed: ${responsiveTableCount} responsive tables, 1024px adaptive navigation, touch and safe-area guards present.`,
);
