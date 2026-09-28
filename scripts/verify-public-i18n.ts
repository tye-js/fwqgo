import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * 英文树（`/en`）不得回落中文 UI 文案的守卫。
 *
 * ## 为什么需要它
 *
 * 有一类反复出现的缺陷：**共享组件带 `language` 入参、默认 `"zh"`，英文路由忘了传**。
 * 2026-09-27 实测就踩了两次：
 *
 * - `PaginationComponent` —— `/en/fwq/page/N`、`/en/fwq/<cat>/page/N`、
 *   `/en/fwq/tags/<tag>/page/N` 三处的「上一页 / 下一页」和 `aria-label` 都是中文；
 * - 套餐卡片与标签页侧栏直接渲染 `server_offers.region` **抓取原文**，
 *   1197 条里有 231 条是中文（「荷兰」「德国」），于是英文页出现中文地区名。
 *
 * 这类缺陷纯读源码很难发现（组件本身写得好好的），要靠**真实渲染**才发现。
 * 浏览器级的检查进不了 CI（`/tests/` 不入库、CI 无浏览器），所以这里退一步做
 * **源码级契约断言**：它挡不住新写法的变体，但能挡住「把已有的那几处改回去」。
 *
 * 新增「带 `language` 的共享组件」时，把它加进 `LANGUAGE_AWARE_COMPONENTS`。
 */

/**
 * 英文路由里必须显式传 `language="en"` 的共享组件。
 *
 * 清单来源：`src/` 下所有「`language` 入参默认 `"zh"`」的公开组件（用
 * `language\?: "zh" \| "en"` / `language = "zh"` 搜出来的）。新增这类组件时要补进来。
 *
 * **局限**：`jsxProps()` 只解析**自闭合**用法（`<X ... />`）。写成
 * `<X ...>children</X>` 的用法不会被检查 —— 当前清单里的组件在英文路由中都是自闭合用法。
 */
const LANGUAGE_AWARE_COMPONENTS = [
  "PaginationComponent",
  "ArticleCard",
  "ArticleCategoryPosts",
  "ArticlePrevNext",
  "ArticleRelatedKnowledge",
  "ArticleRelatedSidebar",
  "ArticleShareActions",
  "Footer",
  "Header",
  "LatestPostsSidebar",
  "NetworkLineSelector",
  "PageCard",
  "RelatedServerOfferCards",
  "TagContextSidebar",
] as const;

/** 渲染「套餐地区」的组件：必须经过 `publicRegionLabel` 做本地化。 */
const REGION_LABEL_COMPONENTS = [
  "src/features/public/components/related-server-offer-cards.tsx",
  "src/features/public/components/tag-context-sidebar.tsx",
] as const;

const REGION_LABEL_HELPER = "publicRegionLabel";

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** 取出 `<Component ... />` 的完整属性串（自闭合为止，够用且不依赖 AST）。 */
function jsxProps(source: string, component: string): string[] {
  const pattern = new RegExp(`<${component}\\b([\\s\\S]*?)/>`, "g");
  return [...source.matchAll(pattern)].map((match) => match[1] ?? "");
}

const englishRouteFiles = walk(path.join("src", "features", "public", "routes", "en"));
assert.ok(
  englishRouteFiles.length > 0,
  "英文路由目录下没有 .tsx —— 路径变了或断言会静默通过，先修守卫",
);

const missingLanguage: string[] = [];
let parsedUsages = 0;
for (const file of englishRouteFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const component of LANGUAGE_AWARE_COMPONENTS) {
    for (const props of jsxProps(source, component)) {
      parsedUsages += 1;
      // 必须是 `"en"` 字面量：只判 `language=` 会被 `language="zh"` 或
      // 传了个别的值蒙过去。真需要动态值时（当前没有），再放宽并补对照。
      if (!/language\s*=\s*"en"/.test(props)) {
        missingLanguage.push(`${path.relative(process.cwd(), file)} → <${component}`);
      }
    }
  }
}

// 空切片会静默通过：解析到一个用法都没找到，说明正则或目录结构变了，先修守卫。
assert.ok(
  parsedUsages > 0,
  `在 ${englishRouteFiles.length} 个英文路由文件里一个组件用法都没解析到 —— ` +
    "正则或组件名清单已失效，断言会静默通过",
);

assert.deepEqual(
  missingLanguage,
  [],
  `英文路由里这些地方没有显式传 language="en"，会回落成中文文案：\n  ${missingLanguage.join("\n  ")}`,
);

const missingRegionLabel: string[] = [];
for (const file of REGION_LABEL_COMPONENTS) {
  assert.ok(
    fs.existsSync(file),
    `地区标签组件不存在：${file}（改名后要同步更新本守卫）`,
  );
  const source = fs.readFileSync(file, "utf8");
  /**
   * 必须找**调用**（`publicRegionLabel(`）而不是标识符。
   *
   * 这里踩过一次假阴性：一开始写的是 `source.includes("publicRegionLabel")`，
   * 而反向对照把调用换成 `offer.region` 之后，**import 行仍然含有这个名字**，
   * 守卫照样通过 —— 一个永远通过的守卫比没有守卫更危险。
   */
  if (!source.includes(`${REGION_LABEL_HELPER}(`)) {
    missingRegionLabel.push(file);
  }
}

assert.deepEqual(
  missingRegionLabel,
  [],
  `这些组件没有走 ${REGION_LABEL_HELPER}，英文页会显示中文地区名（抓取原文）：\n  ${missingRegionLabel.join("\n  ")}`,
);

console.log(
  `Public i18n verified: ${englishRouteFiles.length} English route files, ` +
    `${LANGUAGE_AWARE_COMPONENTS.length} language-aware component(s) always receive language, ` +
    `${REGION_LABEL_COMPONENTS.length} region-label component(s) go through ${REGION_LABEL_HELPER}`,
);
