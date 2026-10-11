import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type * as DbModule from "@fwqgo/db";
import type * as SchemaModule from "@fwqgo/db/schema";

/** 目标分类的 slug，与 `drizzle/0075_promo_category.sql` 建出来的分类一致。 */
const PROMO_CATEGORY_SLUG = "promotions";

/**
 * 「节日 + 限时活动」的标题判据。
 *
 * 只认节日词与限时类词，不把日常促销（「年付优惠」「优惠码」这类）卷进来——后者占全站
 * 六成以上，收进来会掏空现有分类。判据改动前先确认影响面：
 * `SELECT count(*) FROM posts WHERE published AND language='zh' AND title ~* '<pattern>'`。
 */
const PROMO_TITLE_PATTERN =
  "(黑五|黑色星期五|双十一|双11|双12|双十二|国庆|中秋|圣诞|元旦|新年|春节|周年|开学季|618|年末|七夕|独立日|世界杯|暑假|暑期|夏季|限时|秒杀|特价|大促|钜惠|狂欢)";

/**
 * 默认排除的文章：`fuwuqi`（国内服务器）当时只有这两篇，移走会让它归零并从导航消失。
 * 用户决定暂留，等该分类有补充内容后再移。
 */
const DEFAULT_EXCLUDED_POST_IDS = [31, 79];

type RuntimeDeps = {
  db: typeof DbModule.db;
  readDb: typeof DbModule.readDb;
  schema: typeof SchemaModule;
};

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readIdList(name: string): number[] | undefined {
  const raw = readArg(name);
  if (!raw) return undefined;

  return raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    return null;
  }

  const index = trimmed.indexOf("=");
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? { key, value } : null;
}

function loadEnvFiles() {
  for (const fileName of [".env.development", ".env.local", ".env"]) {
    if (!existsSync(fileName)) continue;

    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed || process.env[parsed.key]) continue;
      process.env[parsed.key] = parsed.value;
    }
  }
}

let runtimeDeps: RuntimeDeps | null = null;

async function getRuntimeDeps() {
  if (runtimeDeps) return runtimeDeps;

  loadEnvFiles();
  const [{ db, readDb }, schema] = await Promise.all([
    import("@fwqgo/db"),
    import("@fwqgo/db/schema"),
  ]);

  runtimeDeps = { db, readDb, schema };
  return runtimeDeps;
}

async function main() {
  const write = hasFlag("write");
  const slug = readArg("category-slug") ?? PROMO_CATEGORY_SLUG;
  const excludedIds = readIdList("exclude") ?? DEFAULT_EXCLUDED_POST_IDS;
  const { db, readDb, schema } = await getRuntimeDeps();
  const { categories, posts } = schema;

  const [category] = await readDb
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  if (!category) {
    throw new Error(
      `找不到分类 ${slug}。请先执行 drizzle/0075_promo_category.sql（生产用 bun run db:migrate:prod）。`,
    );
  }

  const candidates = await readDb
    .select({
      id: posts.id,
      title: posts.title,
      categoryId: posts.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(
      and(
        eq(posts.published, true),
        eq(posts.language, "zh"),
        sql`${posts.title} ~* ${PROMO_TITLE_PATTERN}`,
      ),
    )
    .orderBy(asc(posts.categoryId), asc(posts.id));

  const excluded = new Set(excludedIds);
  const moving = candidates.filter((row) => !excluded.has(row.id));
  const kept = candidates.filter((row) => excluded.has(row.id));

  const totals = await readDb
    .select({
      slug: categories.slug,
      name: categories.name,
      total: sql<number>`count(${posts.id})::int`,
    })
    .from(categories)
    .leftJoin(
      posts,
      and(
        eq(posts.categoryId, categories.id),
        eq(posts.published, true),
        eq(posts.language, "zh"),
      ),
    )
    .groupBy(categories.id, categories.slug, categories.name)
    .orderBy(asc(categories.id));

  const movingByCategory = new Map<string, number>();
  for (const row of moving) {
    movingByCategory.set(
      row.categorySlug,
      (movingByCategory.get(row.categorySlug) ?? 0) + 1,
    );
  }

  console.log(`目标分类：${category.name} (${category.slug}, id=${category.id})`);
  console.log(`匹配到 ${candidates.length} 篇，排除 ${kept.length} 篇，将移动 ${moving.length} 篇。`);

  if (kept.length > 0) {
    console.log("\n被排除（保留在原分类）：");
    for (const row of kept) {
      console.log(`  #${row.id} [${row.categorySlug}] ${row.title.slice(0, 50)}`);
    }
  }

  console.log("\n各分类变动：");
  let empties = 0;
  for (const row of totals) {
    const moved = movingByCategory.get(row.slug) ?? 0;
    if (row.total === 0 && moved === 0) continue;

    const remaining = row.total - moved;
    if (remaining === 0 && row.total > 0) empties += 1;
    const marker = remaining === 0 && row.total > 0 ? "  <- 将归零" : "";
    console.log(
      `  ${row.slug.padEnd(24)} ${String(row.total).padStart(3)} -> ${String(remaining).padStart(3)}${marker}`,
    );
  }
  if (empties > 0) {
    console.log(`\n警告：有 ${empties} 个分类会归零，会从导航消失且分类页 404。`);
  }

  console.log("\n将移动的文章：");
  for (const row of moving) {
    console.log(`  #${row.id} [${row.categorySlug}] ${row.title.slice(0, 56)}`);
  }

  if (!write) {
    console.log("\n[dry-run] 未写入任何数据。确认无误后加 --write 执行。");
    return;
  }

  const backupPath = `/tmp/fwqgo-promo-category-backup-${Date.now()}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      moving.map((row) => ({ id: row.id, previousCategoryId: row.categoryId })),
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n原值已备份到 ${backupPath}`);

  const updated = await db
    .update(posts)
    .set({ categoryId: category.id, updatedAt: new Date() })
    .where(
      inArray(
        posts.id,
        moving.map((row) => row.id),
      ),
    )
    .returning({ id: posts.id });

  console.log(`已移动 ${updated.length} 篇到 ${category.name}。`);
  console.log(
    "下一步：触发缓存失效。\n" +
      `  curl -sS -X POST http://127.0.0.1:3000/api/internal/revalidate \\\n` +
      `    -H "Authorization: Bearer $WEB_REVALIDATION_SECRET" -H "Content-Type: application/json" \\\n` +
      `    -d '{"event":"taxonomy.changed","payload":{"categoryIds":[${category.id}]}}'`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
