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

/** 英文路由里必须显式传 `language` 的共享组件。 */
const LANGUAGE_AWARE_COMPONENTS = ["PaginationComponent"] as const;

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
for (const file of englishRouteFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const component of LANGUAGE_AWARE_COMPONENTS) {
    for (const props of jsxProps(source, component)) {
      // 必须是 `"en"` 字面量：只判 `language=` 会被 `language="zh"` 或
      // 传了个别的值蒙过去。真需要动态值时（当前没有），再放宽并补对照。
      if (!/language\s*=\s*"en"/.test(props)) {
        missingLanguage.push(`${path.relative(process.cwd(), file)} → <${component}`);
      }
    }
  }
}

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
