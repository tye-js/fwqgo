import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

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
 * **公开组件里每个 `SelectTrigger` / 搜索输入都必须声明名称属性或关联 label**。
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

function attribute(props: ts.JsxAttributes, name: string) {
  return props.properties.find(
    (prop): prop is ts.JsxAttribute =>
      ts.isJsxAttribute(prop) && prop.name.getText() === name,
  );
}

function literalValue(prop: ts.JsxAttribute | undefined) {
  const value = prop?.initializer;
  if (!value) return undefined;
  if (ts.isStringLiteral(value)) return value.text;
  if (
    ts.isJsxExpression(value) &&
    value.expression &&
    ts.isStringLiteral(value.expression)
  ) {
    return value.expression.text;
  }
  return undefined;
}

/** AST 保留箭头函数、嵌套 JSX 和字符串内的 >，只读取当前元素的属性。 */
function parseControls(file: string) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const controls: Array<{ tag: string; props: ts.JsxAttributes }> = [];
  const labelTargets = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (tag === "Label" || tag === "label") {
        const target = literalValue(attribute(node.attributes, "htmlFor"));
        if (target) labelTargets.add(target);
      } else if (
        tag === "Input" ||
        LABELLED_CONTROLS.some((control) => control === tag)
      ) {
        controls.push({ tag, props: node.attributes });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { controls, labelTargets };
}

const files = PUBLIC_COMPONENT_DIRS.flatMap((dir) => walk(dir));
assert.ok(
  files.length > 0,
  "公开组件目录下没有 .tsx —— 路径变了，断言会静默通过，先修守卫",
);

/** 属性串里是否带了可访问名称。 */
function hasAccessibleName(props: ts.JsxAttributes, labelTargets: Set<string>) {
  const named = ["aria-label", "aria-labelledby"].some((name) => {
    const prop = attribute(props, name);
    return Boolean(prop?.initializer) && literalValue(prop)?.trim() !== "";
  });
  const id = literalValue(attribute(props, "id"));
  return named || Boolean(id && labelTargets.has(id));
}

const missing: string[] = [];
const searchInputsMissingLabel: string[] = [];
let parsed = 0;
let searchInputs = 0;
for (const file of files) {
  const { controls, labelTargets } = parseControls(file);
  for (const { tag, props } of controls) {
    if (tag === "Input") {
      if (!attribute(props, "placeholder")) continue;
      searchInputs += 1;
      if (!hasAccessibleName(props, labelTargets)) {
        searchInputsMissingLabel.push(path.relative(process.cwd(), file));
      }
    } else {
      parsed += 1;
      if (!hasAccessibleName(props, labelTargets)) {
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

// placeholder 只是提示；名称来自 ARIA 属性或通过 id/htmlFor 关联的 label。
assert.deepEqual(
  searchInputsMissingLabel,
  [],
  `这些搜索框只有 placeholder，没有可访问名称：\n  ${searchInputsMissingLabel.join("\n  ")}`,
);

console.log(
  `Public a11y verified: ${files.length} public components, ` +
    `${parsed} <${LABELLED_CONTROLS.join("/")}> always labelled, ${searchInputs} placeholder inputs carry an accessible name`,
);
