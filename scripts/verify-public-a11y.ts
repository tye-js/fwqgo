import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * 公开页面的**可访问名称**守卫。
 *
 * ## 为什么
 *
 * 2026-09-28 用无头 Chrome 对 sitemap 里的 506 个 URL 做了 a11y 审计，扫出：
 * `/servers` 一页就有 **50 个 `role="combobox"` 的按钮没有任何可访问名称**
 * （6 个表格筛选器 + 每个套餐一个计费周期下拉），读屏用户听到的是一串
 * 没有名字的「combobox」—— 这是 WCAG 4.1.2（Name, Role, Value）的硬失败。
 * 另有 38 页的搜索框只有 `placeholder`，而 placeholder 不算 label。
 *
 * 修复后这两类都归零。这个守卫盯住它们，防止回退。
 *
 * ## 为什么是源码级
 *
 * 浏览器级的 a11y 审计进不了 CI（`/tests/` 不入库、CI 无浏览器），所以退一步做源码契约：
 * **公开组件里每个 `SelectTrigger` / 搜索输入都必须带 `aria-label`（或 aria-labelledby）**。
 *
 * ## 局限
 *
 * 它只覆盖「无名称」这一类，且只查 `SelectTrigger` 与 `Input`。
 * 对比度、焦点顺序、ARIA 语义正确性都查不了 —— 那需要真实浏览器 + 人工判断。
 * 新增带表单控件的公开组件时，把对应标签加进 `LABELLED_CONTROLS`。
 */

/** 必须带可访问名称的控件（源码里出现这些标签就要求同元素上有 aria-label/labelledby）。 */
const LABELLED_CONTROLS = ["SelectTrigger"] as const;

const PUBLIC_COMPONENT_DIRS = [
  path.join("src", "features", "public", "components"),
  path.join("src", "features", "shared", "components"),
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** 取出 `<Tag ... />` 或 `<Tag ...>` 的属性串（到第一个 `>` 为止，够用且不依赖 AST）。 */
function jsxProps(source: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  return [...source.matchAll(pattern)].map((match) => match[1] ?? "");
}

const files = PUBLIC_COMPONENT_DIRS.flatMap((dir) => walk(dir));
assert.ok(
  files.length > 0,
  "公开组件目录下没有 .tsx —— 路径变了，断言会静默通过，先修守卫",
);

/** 属性串里是否带了可访问名称。 */
function hasAccessibleName(props: string) {
  return (
    props.includes("aria-label") || props.includes("aria-labelledby")
  );
}

const missing: string[] = [];
let parsed = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const tag of LABELLED_CONTROLS) {
    for (const props of jsxProps(source, tag)) {
      parsed += 1;
      if (!hasAccessibleName(props)) {
        missing.push(`${path.relative(process.cwd(), file)} → <${tag}`);
      }
    }
  }
}

// 空切片会静默通过：一个控件都没解析到说明标签名或目录结构变了。
assert.ok(
  parsed > 0,
  `在 ${files.length} 个公开组件里一个 <${LABELLED_CONTROLS.join("/")}> 都没解析到 —— 守卫已失效`,
);

assert.deepEqual(
  missing,
  [],
  `这些控件没有可访问名称（读屏只会播报「combobox」，WCAG 4.1.2）：\n  ${missing.join("\n  ")}`,
);

// 搜索输入：`Input` 必须同时有 placeholder 与 aria-label —— 只有 placeholder 不算 label。
const searchInputsMissingLabel: string[] = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const props of jsxProps(source, "Input")) {
    if (!props.includes("placeholder=")) continue;
    if (!hasAccessibleName(props)) {
      searchInputsMissingLabel.push(path.relative(process.cwd(), file));
    }
  }
}
assert.deepEqual(
  searchInputsMissingLabel,
  [],
  `这些搜索框只有 placeholder，没有可访问名称：\n  ${searchInputsMissingLabel.join("\n  ")}`,
);

console.log(
  `Public a11y verified: ${files.length} public components, ` +
    `${parsed} <${LABELLED_CONTROLS.join("/")}> always labelled, search inputs carry an accessible name`,
);
