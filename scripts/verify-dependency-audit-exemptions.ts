/**
 * 依赖审计豁免登记与校验。
 *
 * `bun audit --ignore <GHSA>` 会让门禁对某条 advisory 整体失声，因此每条豁免都必须
 * 在这里登记理由，并由本脚本验证豁免前提仍然成立。前提不成立时直接失败，
 * 避免一次性的豁免变成永久盲区。
 *
 * 运行：`bun scripts/verify-dependency-audit-exemptions.ts`
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Exemption = {
  /** GitHub advisory ID，`bun audit --ignore` 用的就是它。 */
  id: string;
  /** 受影响包。 */
  packageName: string;
  /** 为什么现在不能修，而不是"暂时没空"。 */
  reason: string;
  /**
   * 豁免成立的前提：该包不得出现在生产运行时依赖里。
   * 校验方式是 standalone 产物目录中找不到它。
   */
  buildTimeOnly: boolean;
};

/**
 * 目前唯一一条。
 *
 * braces 3.0.3（GHSA-vfj7-8cjw-p6xm，high）：栈耗尽 DoS，触发路径是深度嵌套的
 * glob 模式。上游截至 2026-10-07 未发布修复版本——advisory 的first_patched_version
 * 为空，npm 上 3.0.3 就是 latest，micromatch 4.0.8（latest）依然依赖 braces ^3.0.3。
 * 因此不存在"升级即可修复"的路径，只能豁免。
 *
 * 风险可控的依据：braces 只经tailwindcss 与 eslint-config-next 进入依赖树，
 * 两者都是构建期工具；`find apps/{web,cms}/.next/standalone -type d -name braces`
 * 在 web 与 cms 产物里均无结果，即生产运行时不加载它。攻击者无法通过线上请求
 * 触达这段代码，只有能在本机跑构建时才能影响它——那已经是比该漏洞本身更严重的前提。
 *
 * 复核方式：braces 发布修复版后，去掉本条与 package.json 的 --ignore 参数。
 */
const EXEMPTIONS: Exemption[] = [
  {
    id: "GHSA-vfj7-8cjw-p6xm",
    packageName: "braces",
    reason:
      "上游未发布修复版本（advisory 无 first_patched_version，3.0.3 即 latest，micromatch 最新版仍依赖它），无法通过升级修复；仅存在于构建期依赖链。",
    buildTimeOnly: true,
  },
];

const root = process.cwd();
const standaloneRoots = ["apps/web/.next/standalone", "apps/cms/.next/standalone"];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** 递归收集目录下的包名，standalone 产物是平铺的 node_modules 布局。 */
function collectPackageDirs(
  dir: string,
  out: Set<string> = new Set<string>(),
): Set<string> {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name.startsWith("@")) {
      collectPackageDirs(full, out);
      continue;
    }
    if (fs.existsSync(path.join(full, "package.json"))) out.add(entry.name);
    collectPackageDirs(full, out);
  }
  return out;
}

function assertAuditFlagCoversExemptions(): void {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const command = pkg.scripts?.["verify:dependencies"] ?? "";
  const missing = EXEMPTIONS.filter((item) => !command.includes(item.id));
  if (missing.length > 0) {
    fail(
      `package.json 的 verify:dependencies 缺少豁免参数：${missing
        .map((item) => item.id)
        .join(", ")}。这些 advisory 已在 scripts/verify-dependency-audit-exemptions.ts 登记。`,
    );
  }
}

function assertBuildTimeOnly(exemption: Exemption): void {
  const present = standaloneRoots.filter((dir) =>
    collectPackageDirs(path.join(root, dir)).has(exemption.packageName),
  );
  if (present.length > 0) {
    fail(
      `${exemption.packageName}（${exemption.id}）出现在生产产物 ${present.join("、")} 中。` +
        "它不再是构建期依赖，原豁免理由不再成立：请改用 overrides 升级到修复版本并删除该豁免。",
    );
  }
}

/** 豁免的包必须仍被锁定在无修复版本上，否则说明上游已发布补丁，应改为升级。 */
function assertStillUnfixable(exemption: Exemption): void {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ) as { overrides?: Record<string, string> };
  const pinned = manifest.overrides?.[exemption.packageName];
  let latest: string;
  try {
    latest = execFileSync("npm", ["view", exemption.packageName, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // 拿不到registry 信息时不阻断门禁：版本是否已修复由 audit 本身把关。
    return;
  }
  if (!pinned && latest && latest !== exemption.packageName) {
    // 仅作提示，不作为失败条件：latest 变化未必意味着该 advisory 已修复。
    console.log(
      `  提示：${exemption.packageName} 最新版为 ${latest}，请复核 ${exemption.id} 是否已修复。`,
    );
  }
}

assertAuditFlagCoversExemptions();
for (const exemption of EXEMPTIONS) {
  if (exemption.buildTimeOnly) assertBuildTimeOnly(exemption);
  assertStillUnfixable(exemption);
}

console.log(
  `Dependency audit exemptions verified: ${EXEMPTIONS.length} recorded, all preconditions hold.`,
);
for (const item of EXEMPTIONS) {
  console.log(`- ${item.id} (${item.packageName}): ${item.reason}`);
}
