/**
 * 审计覆盖守卫。
 *
 * ## 背景
 *
 * `admin_audit_logs` 的唯一写入点是 `define-admin-action.ts` 与 `admin-audit.ts`
 * （两者都调 `recordAdminAuditLogSafely`）。**任何不走这两个包装的 server action
 * 都不会留下审计记录。**
 *
 * 2026-09-23 实测：`actions/` 下 28 个文件只有 11 个走包装，生产库运行两个月只有 162 行
 * 审计、18 种 action；文章发布/删除、标签与分类 SEO 批量改、图片删除、联盟链接改写
 * 全部没有记录 —— 出事故只能靠 `git log` 猜。
 *
 * ## 这个脚本做什么
 *
 * 不试图一次性补齐历史欠账（那是一次大重构），只做两件事：
 *
 * 1. **冻结缺口**：还没迁移的文件必须显式写在 `PENDING_AUDIT_MIGRATION` 里。
 *    新增一个 action 文件却忘了包装，会直接失败。
 * 2. **自动清理**：已经迁移的文件如果还留在名单里，也失败并要求删掉，
 *    避免名单慢慢变成僵尸清单、失去信号。
 *
 * 刻意用「文件级」而不是「导出函数级」判定：一个文件里只要出现裸的 `requireAdminSession()`
 * 而没有任何包装，就认为它有未审计的写路径。粒度粗但不会漏，且迁移时可以整文件移除名单。
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ACTIONS_DIR = path.join("src", "features", "cms", "actions");

const WRAPPERS = ["defineAdminAction", "withAdminAudit"] as const;

/**
 * 还没迁移的文件（按 `output/cms-optimization-2026-09-23.md` 的建议顺序）。
 * 迁移完一个就从这里删掉一个 —— 忘了删会被本脚本拦住。
 */
const PENDING_AUDIT_MIGRATION = [
  // 报告里的 P0-1 优先级 2/3：标签、分类、图片、返利商家已迁完，下面是剩余欠账。
  "affiliate-rewrite.ts",
  "ai-rewrite-task.ts",
  "ai-source-site.ts",
  "article-cover-image.ts",
  "creat-post.ts",
  "custom-image-generation.ts",
  "manual-article.ts",
  "post-internal-links.ts",
  "post-tag.ts",
  "scrape.ts",
  "site-seo-config.ts",
] as const;

/** 只读或纯校验文件，不产生业务写入，不需要审计。 */
const READ_ONLY_EXEMPT = ["validate-session.ts"] as const;

/** 必须已经迁移的文件：改动这些文件时若把包装拆掉，这里会立刻失败。 */
const MUST_BE_MIGRATED = ["post.ts", "tag.ts", "category.ts"] as const;

const pending = new Set<string>(PENDING_AUDIT_MIGRATION);
const exempt = new Set<string>(READ_ONLY_EXEMPT);

function detectWrapper(source: string) {
  return WRAPPERS.find((wrapper) => source.includes(wrapper)) ?? null;
}

const failures: string[] = [];
const files = readdirSync(ACTIONS_DIR)
  .filter((file) => file.endsWith(".ts"))
  .sort();

const migrated: string[] = [];

for (const file of files) {
  if (exempt.has(file)) continue;

  const source = readFileSync(path.join(ACTIONS_DIR, file), "utf8");
  const wrapper = detectWrapper(source);
  const callsSessionDirectly = source.includes("requireAdminSession(");

  if (wrapper) {
    migrated.push(file);
    if (pending.has(file)) {
      failures.push(
        `${file} 已经用 ${wrapper} 包装了，但仍留在 PENDING_AUDIT_MIGRATION 里。请从名单中删除。`,
      );
    }
    continue;
  }

  if (pending.has(file)) continue;

  failures.push(
    callsSessionDirectly
      ? `${file} 直接调用 requireAdminSession() 但没有用 ${WRAPPERS.join(" 或 ")} 包装 —— 它的写操作不会进 admin_audit_logs。` +
        `\n    修法：把动作体搬进 ${WRAPPERS[1]}（保留原返回形状）或 ${WRAPPERS[0]}（用信封），` +
        `\n    若确实还没迁移，把它加进本脚本的 PENDING_AUDIT_MIGRATION。`
      : `${file} 既没有审计包装，也不在 PENDING_AUDIT_MIGRATION / READ_ONLY_EXEMPT 名单里。` +
        `\n    新增文件请补包装，或显式登记为只读。`,
  );
}

for (const file of MUST_BE_MIGRATED) {
  if (!files.includes(file)) {
    failures.push(`${file} 不见了 —— 它在 MUST_BE_MIGRATED 名单里，请检查是否被改名或删除。`);
    continue;
  }
  if (!migrated.includes(file)) {
    failures.push(`${file} 的审计包装被拆掉了（它必须在 MUST_BE_MIGRATED 名单里保持已迁移）。`);
  }
}

for (const file of pending) {
  if (!files.includes(file)) {
    failures.push(`PENDING_AUDIT_MIGRATION 里的 ${file} 已不存在，请从名单中删除。`);
  }
}

for (const file of exempt) {
  if (!files.includes(file)) {
    failures.push(`READ_ONLY_EXEMPT 里的 ${file} 已不存在，请从名单中删除。`);
  }
}

if (failures.length > 0) {
  console.error("审计覆盖校验失败：\n");
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n已迁移 ${migrated.length} 个文件，待迁移 ${PENDING_AUDIT_MIGRATION.length} 个。`);
  process.exit(1);
}

console.log(
  `Admin audit coverage verified: ${migrated.length} action files wrapped, ` +
    `${PENDING_AUDIT_MIGRATION.length} pending migration, ${READ_ONLY_EXEMPT.length} read-only exempt.`,
);
