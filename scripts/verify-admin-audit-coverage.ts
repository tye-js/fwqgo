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
 *
 * **2026-09-23 已清空** —— `actions/` 下所有产生业务写入的文件都接入了审计。
 * 以后如果新增文件却忘了包装，会直接落到下面「新增文件请补包装」那条失败上。
 * 这个名单保留着，是为了以后确实需要分批迁移时有个显式入口。
 */
const PENDING_AUDIT_MIGRATION = [] as const;

/** 只读或纯校验文件，不产生业务写入，不需要审计。 */
const READ_ONLY_EXEMPT = ["validate-session.ts"] as const;

/**
 * 自己没有任何写入、只是把调用转给「已经包装过的 action」的文件。
 *
 * `creat-post.ts` 的 `createPost` 只做三件事：`requireAdminSession()`、
 * 调 `post.ts` 的 `createPost`（已包装 → 会记 `post.create`）、把返回形状转一下。
 * 再包一层只会产生**重复的审计行**，所以显式登记在这里。
 *
 * 这个名单不是「免检」：下面会检查这些文件**确实没有**自己的写入语句，
 * 一旦有人往里加 `.insert(` / `.update(` / `.delete(` / `.transaction(`，校验立刻失败。
 */
const DELEGATES_TO_WRAPPED_ACTION = ["creat-post.ts"] as const;

/** 必须已经迁移的文件：改动这些文件时若把包装拆掉，这里会立刻失败。 */
const MUST_BE_MIGRATED = [
  "post.ts",
  "tag.ts",
  "category.ts",
  "images.ts",
  "aff-provider.ts",
  "ai-rewrite-task.ts",
  "article-cover-image.ts",
  "ai-source-site.ts",
  "scrape.ts",
] as const;

/** 判定「这个文件自己有没有写库」用。 */
const WRITE_PATTERNS = [
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.transaction\(/,
] as const;

const pending = new Set<string>(PENDING_AUDIT_MIGRATION);
const exempt = new Set<string>(READ_ONLY_EXEMPT);
const delegates = new Set<string>(DELEGATES_TO_WRAPPED_ACTION);

function detectWrapper(source: string) {
  return WRAPPERS.find((wrapper) => source.includes(wrapper)) ?? null;
}

type FunctionBody = { name: string; body: string; line: number };

/** 用括号配对扫出文件里每个具名函数体。 */
function functionBodies(source: string) {
  const out = new Map<string, FunctionBody>();
  const pattern =
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\(/g;

  let match = pattern.exec(source);
  while (match) {
    const name = match[1] ?? "";

    // **先跳过参数列表**：参数里可能有 `input: { id: number }` 这样的类型字面量，
    // 直接找第一个 `{` 会把函数体定位到参数内部去 —— 实现这段逻辑的第一版就是这么漏检的，
    // 它一度报出 44 个并不存在的「未鉴权入口」。
    let depth = 0;
    let cursor = source.indexOf("(", match.index);
    for (; cursor < source.length; cursor += 1) {
      if (source[cursor] === "(") depth += 1;
      else if (source[cursor] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    const bodyStart = source.indexOf("{", cursor + 1);
    if (bodyStart !== -1) {
      let bodyDepth = 0;
      let end = bodyStart;
      for (; end < source.length; end += 1) {
        if (source[end] === "{") bodyDepth += 1;
        else if (source[end] === "}") {
          bodyDepth -= 1;
          if (bodyDepth === 0) break;
        }
      }

      out.set(name, {
        name,
        body: source.slice(bodyStart, end + 1),
        line: source.slice(0, match.index).split("\n").length,
      });
    }

    match = pattern.exec(source);
  }

  return out;
}

/** 取出 `withAdminAudit({...}, NAME)` / `defineAdminAction({...}, NAME)` 里的 NAME。 */
function wrappedImplementationNames(source: string) {
  const names: string[] = [];
  const pattern = new RegExp(`(?:${WRAPPERS.join("|")})\\s*\\(`, "g");

  let match = pattern.exec(source);
  while (match) {
    const open = source.indexOf("(", match.index);
    let depth = 0;
    let cursor = open;
    for (; cursor < source.length; cursor += 1) {
      if (source[cursor] === "(") depth += 1;
      else if (source[cursor] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    const inner = source.slice(open + 1, cursor);
    // 取最后一个**顶层**逗号之后的标识符：前面那个参数是定义对象。
    let nested = 0;
    let lastComma = -1;
    for (let i = 0; i < inner.length; i += 1) {
      const char = inner[i] ?? "";
      if ("([{".includes(char)) nested += 1;
      else if (")]}".includes(char)) nested -= 1;
      else if (char === "," && nested === 0) lastComma = i;
    }

    const name = inner.slice(lastComma + 1).trim();
    if (/^[A-Za-z0-9_$]+$/.test(name)) names.push(name);

    match = pattern.exec(source);
  }

  return names;
}

/**
 * 找出**入口实现**里没有调用 `requireAdminSession` 的那些。
 *
 * 为什么必须按实现逐个判、不能按文件判：一个文件里只要出现过一次
 * `requireAdminSession()`，文件级判定就整份通过，同文件里另一个 action 漏鉴权看不出来。
 * 而 `withAdminAudit` 自己**不做鉴权** —— 它只 `getCurrentSession().catch(() => null)`
 * 取 actorId 去记审计日志，取不到也照样执行被包装的函数；`defineAdminAction` 同理。
 * 所以入口的鉴权只能由实现自己提供，**漏了就等于任何人都能调用它**。
 *
 * 判定范围：被包装的实现（`withAdminAudit({...}, NAME)` 的 NAME）与所有 `xxxImpl` ——
 * 它们是真正会被调用的入口。薄包装（`xxxAction` 的函数体只有一行
 * `return xxxMutation(...)`）不在范围内，否则会报出一堆假警报。
 */
function findUnauthenticatedEntries(source: string) {
  const bodies = functionBodies(source);
  const entries = new Set(wrappedImplementationNames(source));

  for (const name of bodies.keys()) {
    if (name.endsWith("Impl")) entries.add(name);
  }

  const missing: FunctionBody[] = [];
  for (const name of entries) {
    const info = bodies.get(name);
    if (!info) continue;
    if (info.body.includes("requireAdminSession")) continue;
    missing.push(info);
  }

  return missing;
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

  // 鉴权判定要按**入口实现**逐个做，不能按文件 —— 见 findUnauthenticatedEntries。
  for (const unauthenticated of findUnauthenticatedEntries(source)) {
    failures.push(
      `${file} 的 ${unauthenticated.name}()（第 ${unauthenticated.line} 行）没有调用 requireAdminSession。` +
        `\n    ${WRAPPERS[1]} 只负责写审计日志、**不做鉴权**（取不到 session 也会继续执行），` +
        `\n    所以入口的鉴权只能由实现自己提供；漏了就等于任何人都能调用它。`,
    );
  }

  if (delegates.has(file)) {
    const ownWrite = WRITE_PATTERNS.find((pattern) => pattern.test(source));
    if (ownWrite) {
      failures.push(
        `${file} 登记为「只转调已包装的 action」，但源码里出现了自己的写库语句（${ownWrite.source}）。` +
          `\n    它现在需要真的接入审计：用 ${WRAPPERS[1]} 包装，并从 DELEGATES_TO_WRAPPED_ACTION 删除。`,
      );
    }
    continue;
  }

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

for (const file of delegates) {
  if (!files.includes(file)) {
    failures.push(`DELEGATES_TO_WRAPPED_ACTION 里的 ${file} 已不存在，请从名单中删除。`);
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
    `${PENDING_AUDIT_MIGRATION.length} pending migration, ` +
    `${DELEGATES_TO_WRAPPED_ACTION.length} delegating, ${READ_ONLY_EXEMPT.length} read-only exempt.`,
);
