/**
 * 客户端组件体积守卫。
 *
 * ## 背景
 *
 * `output/cms-optimization-2026-09-23.md` 的 P1-2：后台有 7 个客户端单文件在 1383–2776 行，
 * 其中最大的那个有 20+ 个 `useState` 交叉影响。报告对它的判断是分两层的：
 *
 * - **可维护性（真问题）**：任何一次改动都要读完整个文件才能判断影响面。
 *   这类文件是 bug 的高发区，也是新人（含 AI 协作者）最容易改错的地方。
 * - **交互流畅度（次要）**、**首屏性能（当前可接受）**。
 *
 * 报告的结论是：**不要**一次性重写，按「是否近期要改」决定，动手时先 memo 再按功能域拆。
 *
 * ## 这个脚本做什么
 *
 * 不逼任何人现在去拆，只**阻止债务继续增长**：
 *
 * 1. 新增的客户端组件必须 ≤ `MAX_CLIENT_COMPONENT_LINES`；
 * 2. 已经超标的 12 个文件冻结在**当前行数 + 2%** 的额度内 —— 只能变小，不能变大。
 *    确实需要加行数时，得先想清楚是拆分还是显式抬高基线（脚本的报错信息会提示），
 *    而不是悄悄长成 3000 行。
 *
 * 用 2% 而不是精确值：正常的小改动（加一行 import、补一句注释）不该让校验变红，
 * 否则大家会习惯性抬基线，守卫就失去意义。
 *
 * ## 为什么按行数
 *
 * 行数不是好指标，但它是**唯一能自动量、且无法被绕过**的代理指标。
 * 真正的指标（耦合度、state 交叉数）没法自动化，所以这里只当「防增长」用，
 * 不用它来排期重构 —— 那仍然应该按「是否近期要改」判断。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MAX_CLIENT_COMPONENT_LINES = 800;

/**
 * 已超标的客户端组件基线（2026-09-23 实测）。
 *
 * 只能往下走。要加行数的话，先把该拆的部分拆出去，或者在本表里显式改基线并说明理由。
 */
const FROZEN_LARGE_COMPONENTS: Record<string, number> = {
  "src/features/cms/components/provider-monitor-manager.tsx": 2777,
  "src/features/cms/components/knowledge-manager.tsx": 1617,
  "src/features/cms/components/server-offer-admin-table.tsx": 1534,
  "src/features/cms/components/image-asset-manager.tsx": 1478,
  "src/features/cms/components/provider-profile-sheet.tsx": 1414,
  "src/features/cms/components/ai-rewrite-task-manager.tsx": 1390,
  "src/features/cms/components/affman-tables.tsx": 1384,
  "src/features/cms/components/posts-tables.tsx": 1144,
  "src/features/public/components/server-sizing-calculator.tsx": 1058,
  "src/features/cms/components/ai-rewrite-config-manager.tsx": 937,
  "src/features/public/components/server-offer-table.tsx": 865,
  "src/components/endpoint/edit-post/edit-post.tsx": 839,
};

const HEADROOM = 1.02;

function listFiles(directory: string, out: string[] = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isClientComponent(source: string) {
  // 只看文件头部：Next 要求 "use client" 必须出现在任何 import 之前。
  return /^\s*"use client";/m.test(source.slice(0, 200));
}

const failures: string[] = [];
const oversized: string[] = [];
let checked = 0;

for (const file of [...listFiles("src"), ...listFiles("apps")]) {
  const source = readFileSync(file, "utf8");
  if (!isClientComponent(source)) continue;
  checked += 1;

  const lineCount = source.split("\n").length;
  const frozenBaseline = FROZEN_LARGE_COMPONENTS[file];

  if (frozenBaseline !== undefined) {
    const cap = Math.ceil(frozenBaseline * HEADROOM);
    if (lineCount > cap) {
      failures.push(
        `${file} 从 ${frozenBaseline} 行涨到 ${lineCount} 行（上限 ${cap}）。` +
          `\n    这个文件已经在 P1-2 的待拆分名单里，不要再往上堆。` +
          `\n    要么把这块逻辑拆到独立文件，要么在 scripts/verify-client-component-size.ts 里显式抬高基线并说明理由。`,
      );
    } else {
      oversized.push(file);
    }
    continue;
  }

  if (lineCount > MAX_CLIENT_COMPONENT_LINES) {
    failures.push(
      `${file} 是新的超大客户端组件（${lineCount} 行 > ${MAX_CLIENT_COMPONENT_LINES}）。` +
        `\n    请按功能域拆开（列表 / 抽屉表单 / 批量操作），或在本脚本里显式登记基线。`,
    );
  }
}

for (const file of Object.keys(FROZEN_LARGE_COMPONENTS)) {
  if (!oversized.includes(file)) {
    failures.push(
      `FROZEN_LARGE_COMPONENTS 里的 ${file} 已经不在超标名单里（可能被拆小了或删了）。` +
        `\n    请从本脚本的基线表里删掉它。`,
    );
  }
}

if (failures.length > 0) {
  console.error("客户端组件体积校验失败：\n");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("");
  process.exit(1);
}

console.log(
  `Client component size verified: ${checked} client components, ` +
    `${oversized.length} frozen oversized (may only shrink), cap ${MAX_CLIENT_COMPONENT_LINES} lines for new files.`,
);
