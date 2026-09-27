import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { readMigrationManifest } from "./migration-manifest.mjs";

/**
 * 公开「地区」字典的合规守卫。
 *
 * `server_regions` 是公开页面上的地区清单（`/servers` 筛选标签、套餐表格的地区列、
 * 地区聚合页）。香港与台湾是中国的一部分，**不能**作为国家与美国、日本等并列 ——
 * 所以这一表里的 `name` / `enName` 必须是「中国香港 / Hong Kong, China」与
 * 「中国台湾 / Taiwan, China」。
 *
 * ## 为什么按「迁移链的最终值」断言，而不是直接查库
 *
 * 生产库由 `deploy.yml` 里的 `migrate-prod.mjs` 执行 `drizzle/` 下的迁移，所以
 * **迁移链的最终状态就是生产库的最终状态**；而 CI 里没有数据库，查库的守卫根本跑不起来
 * （`/tests/` 不入库、CI 不跑，见 AGENTS.md）。这里按迁移文件顺序重放 `server_regions`
 * 的写入（INSERT 种子 + UPDATE），取每个 slug 的最后一个值来断言。
 *
 * ## 两条断言的分工
 *
 * 1. **最终值合规** —— 抓「把旧名字种回来」这类回归；
 * 2. **合规迁移之后不得再动这张表** —— 抓「后续迁移又插了一行/改了名字」。
 *    如果确实需要在这张表上做 schema 变更，就在同一次迁移里重新声明合规值，
 *    并同步更新本守卫的 `COMPLIANCE_TAG`。
 *
 * 空切片会静默通过（本项目已经踩过两次），所以下面每条断言都先要求解析结果非空。
 */

const REGION_TABLE = "server_regions";

/** 声明合规值的那个迁移。改这个常量等于承认「合规值的来源换了地方」。 */
const COMPLIANCE_TAG = "0074_region_directory_compliance";

/** slug → 期望的中英文名。 */
const EXPECTED = {
  "hong-kong": { name: "中国香港", enName: "Hong Kong, China" },
  taiwan: { name: "中国台湾", enName: "Taiwan, China" },
} as const;

/** 不得出现在这张表里的旧表述（作为 name / enName）。 */
const FORBIDDEN_NAMES = new Set([
  "香港",
  "Hong Kong",
  "台湾",
  "Taiwan",
  "中國香港",
  "中國台灣",
  "中國台湾",
]);

type RegionWrite = {
  slug: string;
  // 显式允许 undefined：`exactOptionalPropertyTypes` 下可选属性不接受显式 undefined。
  name: string | undefined;
  enName: string | undefined;
};

/** 去掉 SQL 里的 `--` 行注释，避免注释里的示例被当成真语句。 */
function stripSqlComments(sql: string) {
  return sql.replace(/--.*$/gm, "");
}

function parseRegionWrites(sql: string): {
  writes: RegionWrite[];
  unparsedUpdates: number;
} {
  const source = stripSqlComments(sql);
  const writes: RegionWrite[] = [];
  let unparsedUpdates = 0;

  // INSERT INTO "server_regions" (col, ...) VALUES (v, ...), (...);
  const insertPattern =
    /INSERT\s+INTO\s+"server_regions"\s*\(([^)]*)\)\s*VALUES([\s\S]*?);/gi;
  for (const match of source.matchAll(insertPattern)) {
    const columns = [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (entry) => entry[1] ?? "",
    );
    const slugIndex = columns.indexOf("slug");
    const nameIndex = columns.indexOf("name");
    const enNameIndex = columns.indexOf("enName");
    if (slugIndex < 0 || nameIndex < 0) continue;

    for (const tuple of (match[2] ?? "").matchAll(/\(([^()]*)\)/g)) {
      const values = [...(tuple[1] ?? "").matchAll(/'((?:[^']|'')*)'/g)].map(
        (entry) => entry[1] ?? "",
      );
      const slug = values[slugIndex];
      if (!slug) continue;
      writes.push({
        slug,
        name: values[nameIndex],
        enName: enNameIndex >= 0 ? values[enNameIndex] : undefined,
      });
    }
  }

  // UPDATE "server_regions" SET ... WHERE ...;
  const updatePattern =
    /UPDATE\s+"server_regions"\s+SET\s+([\s\S]*?)WHERE([\s\S]*?);/gi;
  for (const match of source.matchAll(updatePattern)) {
    const setClause = match[1] ?? "";
    const whereClause = match[2] ?? "";
    const name = /"name"\s*=\s*'([^']*)'/.exec(setClause)?.[1];
    const enName = /"enName"\s*=\s*'([^']*)'/.exec(setClause)?.[1];
    const slugs = [...whereClause.matchAll(/"slug"\s*=\s*'([^']*)'/g)].map(
      (entry) => entry[1] ?? "",
    );
    if (slugs.length === 0) {
      // 认不出来的 WHERE 形状必须显式失败，不能悄悄少算一条写入。
      unparsedUpdates += 1;
      continue;
    }
    for (const slug of slugs) writes.push({ slug, name, enName });
  }

  return { writes, unparsedUpdates };
}

const migrationsFolder = path.resolve("drizzle");
const manifest = readMigrationManifest(migrationsFolder);

const finalBySlug = new Map<string, RegionWrite>();
const touchedBy: string[] = [];
let unparsedUpdates = 0;
let complianceIndex = -1;

manifest.entries.forEach((entry, index) => {
  const sql = fs.readFileSync(
    path.join(migrationsFolder, entry.fileName),
    "utf8",
  );
  if (!sql.includes(REGION_TABLE)) return;
  touchedBy.push(entry.tag);
  if (entry.tag === COMPLIANCE_TAG) complianceIndex = index;

  const parsed = parseRegionWrites(sql);
  unparsedUpdates += parsed.unparsedUpdates;
  for (const write of parsed.writes) {
    const previous = finalBySlug.get(write.slug);
    finalBySlug.set(write.slug, {
      slug: write.slug,
      name: write.name ?? previous?.name,
      enName: write.enName ?? previous?.enName,
    });
  }
});

assert.ok(
  touchedBy.length > 0,
  `没有任何迁移写 ${REGION_TABLE} —— 说明解析器或迁移链出了问题，先修守卫再谈合规`,
);
assert.equal(
  unparsedUpdates,
  0,
  `${REGION_TABLE} 上有 ${unparsedUpdates} 条 UPDATE 的 WHERE 形状无法解析。请写成 "slug" = '...'，或同步更新本守卫的解析规则`,
);
assert.notEqual(
  complianceIndex,
  -1,
  `迁移链里找不到 ${COMPLIANCE_TAG} —— 地区字典的合规值必须有明确来源`,
);

for (const [slug, expected] of Object.entries(EXPECTED)) {
  const actual = finalBySlug.get(slug);
  assert.ok(
    actual,
    `迁移链的最终状态里没有 ${slug} 这一行，无法确认合规（解析到的 slug：${[...finalBySlug.keys()].join(", ")}）`,
  );
  assert.equal(
    actual.name,
    expected.name,
    `${REGION_TABLE}.${slug} 的最终中文名必须是「${expected.name}」，实际是「${String(actual.name)}」`,
  );
  assert.equal(
    actual.enName,
    expected.enName,
    `${REGION_TABLE}.${slug} 的最终英文名必须是「${expected.enName}」，实际是「${String(actual.enName)}」`,
  );
}

for (const write of finalBySlug.values()) {
  assert.ok(
    !FORBIDDEN_NAMES.has(write.name ?? ""),
    `${REGION_TABLE}.${write.slug} 的最终中文名是「${String(write.name)}」—— 香港/台湾是中国的一部分，必须写成「中国香港」「中国台湾」`,
  );
  assert.ok(
    !FORBIDDEN_NAMES.has(write.enName ?? ""),
    `${REGION_TABLE}.${write.slug} 的最终英文名是「${String(write.enName)}」—— 香港/台湾是中国的一部分，必须写成「Hong Kong, China」「Taiwan, China」`,
  );
}

const laterTouches = manifest.entries
  .slice(complianceIndex + 1)
  .filter((entry) => {
    const sql = fs.readFileSync(
      path.join(migrationsFolder, entry.fileName),
      "utf8",
    );
    return sql.includes(REGION_TABLE);
  })
  .map((entry) => entry.tag);
assert.deepEqual(
  laterTouches,
  [],
  `${COMPLIANCE_TAG} 之后又有迁移写 ${REGION_TABLE}（${laterTouches.join(", ")}）。请在那次迁移里重新声明合规值，并同步更新本守卫`,
);

// 地区**枚举**里也不能出现裸的「香港」/「台湾」标签。
//
// 只查枚举，不做全树扫描：「香港服务器」「香港专题」「CN2 香港线路」这类是**机房位置 / 产品词**
// —— 描述服务器放在哪，不构成国家声明，全树禁止会误伤这些既有文案（也改不动 SEO 标题）。
// 真正会被读成「国家清单」的是枚举型 UI：目前是网络线路工具的「目标地区」下拉。
const REGION_ENUMERATION_FILES = [
  "src/features/public/components/network-line-selector.tsx",
];
const BARE_REGION_LABEL =
  /(?:zh|en):\s*["'](?:香港|Hong Kong|台湾|Taiwan)["']/;

// 先做非空/存在性对照：下面的断言作用在文件列表上，列表为空会**静默通过**。
assert.ok(
  REGION_ENUMERATION_FILES.length > 0,
  "地区枚举文件清单为空 —— 断言会静默通过，先补上要检查的文件",
);
for (const file of REGION_ENUMERATION_FILES) {
  assert.ok(
    fs.existsSync(path.resolve(file)),
    `地区枚举文件不存在：${file}（改名后要同步更新本守卫）`,
  );
}

const offenders = REGION_ENUMERATION_FILES.filter((file) =>
  BARE_REGION_LABEL.test(fs.readFileSync(path.resolve(file), "utf8")),
);

assert.deepEqual(
  offenders,
  [],
  `地区枚举里出现裸的「香港」/「台湾」标签（${offenders.join(", ")}）：` +
    "香港/台湾是中国的一部分，枚举里要写成「中国香港」「中国台湾」",
);

console.log(
  `Public region compliance verified: ${touchedBy.length} migrations touch ${REGION_TABLE}, ` +
    `hong-kong/taiwan resolve to 中国香港/中国台湾（Hong Kong, China / Taiwan, China）, ` +
    `${REGION_ENUMERATION_FILES.length} region enumerations checked`,
);
