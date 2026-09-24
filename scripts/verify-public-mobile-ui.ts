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
    assert.match(
      source,
      /notFound\(\)/,
      `${appRelativePath} must delegate to notFound()`,
    );
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

const publicRoutePages = listFiles(
  join(root, "src/features/public/routes"),
).filter((path) => path.endsWith("page.tsx"));
assert.equal(
  mappedWebRouteCount,
  publicRoutePages.length,
  "Every public feature page must have exactly one app route entry",
);
const delegatedPublicShells = new Set([
  "knowledge/index-render/[variant]/page.tsx",
  "en/knowledge/index-render/[variant]/page.tsx",
  "en/knowledge/[slug]/page.tsx",
  "en/knowledge/page.tsx",
  "en/tools/server-sizing/page.tsx",
  "en/fwq/posts/[slug]/page.tsx",
  // Trust pages delegate their whole shell (including the min-h-dvh column) to
  // `about-route.tsx` / `trust-document-route.tsx`, so the shell literal lives
  // in those factories rather than in each thin route entry.
  "about/page.tsx",
  "contact/page.tsx",
  "privacy/page.tsx",
  "terms/page.tsx",
  "affiliate-disclosure/page.tsx",
  "en/about/page.tsx",
  "en/contact/page.tsx",
  "en/privacy/page.tsx",
  "en/terms/page.tsx",
  "en/affiliate-disclosure/page.tsx",
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

assert.equal(
  webRoutePages.length,
  38,
  // Two guarded ISR render entries preserve the existing public knowledge URLs.
  // Ten trust-page entries (five pages in two languages) were added on top of
  // the original 28.
  "Expected 26 public page entries plus two internal knowledge ISR entries",
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
const homeView = read("src/features/public/components/home-page.tsx");
/**
 * 剥掉源码里的注释再做字面量断言。
 *
 * 这条规矩在 2026-09-23 已经被踩了六次：说明文字里几乎必然会出现被断言的字面量
 * （「不再靠 message.includes() 猜状态码」「不要调 requireAdminSession()」
 * 「原来这里用 @/components/ui/navigation-menu」…）。**正反两个方向都要剥** ——
 * doesNotMatch 会被注释满足，match 也会被注释满足。
 * 行注释和块注释都要剥，只剥 `//` 会漏掉 JSDoc。
 */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const header = read("src/features/public/components/header.tsx");
const desktopNav = read("src/features/public/components/desktop-nav.tsx");
const mobileNavDrawer = read("src/features/public/components/mobile-nav-drawer.tsx");
const inventoryResults = read(
  "src/features/public/components/server-inventory-results.tsx",
);
const offerTable = read(
  "src/features/public/components/server-offer-table.tsx",
);
const postViewCount = read(
  "src/features/public/components/post-view-count.tsx",
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
const zhArticle = read("src/features/public/routes/fwq/posts/[slug]/page.tsx");
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
assert.doesNotMatch(articleDetail, /line-clamp-2/);
assert.match(postViewCount, /flex min-h-11 [^"\n]*items-center/);
assert.match(footer, /grid grid-cols-1 gap-2 min-\[420px\]:grid-cols-3/);
assert.match(footer, /block break-words text-xs leading-5/);
assert.match(knowledgeCard, /flex min-w-0 flex-wrap/);
assert.match(knowledgeCard, /className="break-words"/);
assert.match(fwqLayout, /flex min-h-dvh flex-col/);
assert.doesNotMatch(fwqLayout, /min-h-\[90vh\]/);
// Both language routes share the same responsive presentation; coupon codes
// must still wrap in that component instead of overflowing a narrow screen.
for (const home of [zhHome, enHome]) assert.match(home, /<PublicHomePage/);
assert.match(homeView, /min-w-0 flex-1 break-words text-foreground/);
assert.match(homeView, /max-w-\[45%\] shrink-0 break-all/);
assert.match(
  sizingCalculator,
  /whitespace-normal break-words px-2 text-center/,
);
for (const source of [latestPostsSidebar, serverTopic, serverCollection]) {
  assert.match(source, /min-h-11/);
}
for (const source of [zhArticle, enArticle]) {
  assert.match(source, /min-h-11/);
}
assert.match(tagContext, /inline-flex min-h-11/);
assert.match(scrollToTop, /safe-area-inset-bottom/);
assert.match(offerTable, /min-w-0 flex-1 break-words text-base/);
assert.match(offerTable, /max-w-full whitespace-normal break-all/);
assert.match(inventoryResults, /min-w-0 rounded-lg border/);
assert.match(inventoryResults, /PID \{offer\.externalProductId\}/);
assert.match(inventoryResults, /max-w-full break-all/);
assert.match(inventoryResults, /grid min-w-0 grid-cols-1[^"\n]*sm:grid-cols-2/);
for (const source of [zhArticle, enArticle]) {
  assert.match(source, /flex min-w-0 flex-wrap items-center/);
  assert.match(
    source,
    /inline-flex min-h-11 min-w-0 max-w-full items-center break-words/,
  );
}
/**
 * 详情页版面契约（2026-09-24 重排后）。
 *
 * 这几条都对应实测踩过的坑，不是风格偏好：
 *
 * 1. 右栏是 `sticky` 的。实测 1280×900 下长文（目录长 + 最新文章列表）右栏高
 *    1327px > 视口，被钉住后**底部内容永远滚不出来**。所以右栏必须自带高度上限
 *    和滚动容器；目录卡片在右栏里必须让出滚动（`navClassName="toc"`），
 *    否则两层 overflow 叠出嵌套滚动条。
 * 2. `xl` 起才有右栏。之前只有 `2xl` 才有一列，1280–1535 这一段右侧整片空白。
 * 3. 窄屏没有右栏，目录必须在正文上方有折叠入口，否则手机端长文无法跳转。
 */
for (const source of [zhArticle, enArticle]) {
  assert.match(source, /<ArticleRail>/);
  assert.match(source, /<ArticleMobileToc/);
  assert.match(source, /<ArticleCategoryPosts/);
  assert.match(source, /<ArticlePrevNext/);
  assert.match(source, /xl:grid-cols-\[minmax\(0,820px\)_288px\]/);
}
const articleDetailCode = stripComments(articleDetail);
assert.match(
  articleDetailCode,
  /xl:max-h-\[calc\(100dvh-7rem\)\] xl:overflow-y-auto/,
  "详情页右栏必须限制高度并自带滚动，否则 sticky 元素底部不可达",
);
assert.match(
  articleDetailCode,
  /<TableOfContents items=\{items\} label=\{label\} navClassName="toc"/,
  "右栏目录必须让出滚动，避免与右栏形成嵌套滚动条",
);
assert.match(select, /radix-select-content-available-height/);
assert.match(select, /max-w-\[calc\(100vw-1\.5rem\)\]/);
assert.match(dropdown, /radix-dropdown-menu-content-available-height/);
assert.match(dropdown, /overflow-x-hidden overflow-y-auto overscroll-contain/);
assert.match(
  styles,
  /@media \(max-width: 767px\)[\s\S]*input,[\s\S]*textarea,[\s\S]*select[\s\S]*font-size: 1rem !important/,
);

assert.match(articleCard, /min-h-11/);
// The expanded public navigation uses the drawer through tablet widths so
// article categories, tools and language switching cannot squeeze the header.
//
// 桌面导航从 2026-09-23 起搬到了 desktop-nav.tsx，并且用原生 <details> 取代了
// Radix NavigationMenu（省掉那个每页都加载的 23.4 KB chunk）—— 所以
// 「xl 以上才显示」这条断言改到新文件上。
// 2026-09-23：移动端抽屉整体拆到了 mobile-nav-drawer.tsx（header.tsx 从 269 行回到 110 行），
// 桌面导航拆到了 desktop-nav.tsx。两个断言改到新文件上。
assert.match(mobileNavDrawer, /className="[^"\n]*xl:hidden"/);
assert.match(desktopNav, /<nav className="hidden xl:block"/);
assert.match(mobileNavDrawer, /max-h-dvh w-\[88vw\]/);
assert.match(mobileNavDrawer, /<SheetClose asChild>/);
assert.match(header, /<MobileNavDrawer/);
// 桌面导航不能再把 Radix NavigationMenu 引回来
assert.doesNotMatch(
  stripComments(`${header}\n${desktopNav}`),
  /@\/components\/ui\/navigation-menu/,
  "桌面导航必须保持零客户端依赖（原生 <details>），不要把 Radix NavigationMenu 引回来",
);

for (const source of [inventoryResults, offerTable]) {
  assert.match(source, /grid gap-3 xl:hidden/);
  assert.match(source, /hidden overflow-x-auto[^"\n]*xl:block/);
  assert.doesNotMatch(source, /grid gap-3 (?:md|lg):hidden/);
  assert.doesNotMatch(source, /hidden overflow-x-auto[^"\n]*(?:md|lg):block/);
}
assert.doesNotMatch(
  publicSources.map(({ source }) => source).join("\n"),
  /md:min-h-(?:8|9)/,
  "Public interactive controls must not reintroduce tablet touch-target downgrades",
);
// Region, line and provider cells must stay real links whenever the offer has
// a canonical slug. Only unmapped marketing text renders as plain text, which
// verify:public-seo guards; here we assert the linked case is still wired.
for (const kind of ["regions", "lines", "providers"] as const) {
  const field = {
    regions: "regionSlug",
    lines: "lineSlug",
    providers: "providerSlug",
  }[kind];
  assert.match(
    inventoryResults,
    new RegExp(`kind="${kind}"\\s+slug=\\{offer\\.${field}\\}`),
    `Inventory rows must link ${kind} through their canonical slug`,
  );
}
assert.match(inventoryResults, /套餐标签/);
assert.match(inventoryResults, /有效期至/);

console.log(
  `Public mobile UI verification passed: ${webRoutePages.length} app pages mapped to ${publicRoutePages.length} feature routes, dynamic viewport roots, mobile touch targets, and dedicated server cards present.`,
);
