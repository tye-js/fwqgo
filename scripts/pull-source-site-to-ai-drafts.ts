import { eq, or } from "drizzle-orm";

import { pullSourceSiteToAiTasks } from "@/server/ai/source-site-puller";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readConfig() {
  const siteUrl = readArg("site") ?? process.env.SOURCE_SITE_URL;
  const feedUrl = readArg("feed") ?? process.env.SOURCE_SITE_FEED_URL;
  const categoryValue =
    readArg("category") ??
    readArg("category-name") ??
    readArg("category-slug") ??
    process.env.SOURCE_SITE_CATEGORY ??
    process.env.SOURCE_SITE_CATEGORY_NAME ??
    process.env.SOURCE_SITE_CATEGORY_SLUG;
  const categoryIdValue =
    readArg("category-id") ?? process.env.SOURCE_SITE_CATEGORY_ID;
  const rewriteStyleIdValue =
    readArg("rewrite-style-id") ?? process.env.SOURCE_SITE_REWRITE_STYLE_ID;
  const limit = Number(readArg("limit") ?? process.env.SOURCE_SITE_LIMIT ?? 10);

  if (!siteUrl) {
    throw new Error("缺少 SOURCE_SITE_URL 或 --site=https://example.com");
  }

  const categoryId = categoryIdValue ? Number(categoryIdValue) : null;

  if (
    (!Number.isInteger(categoryId) || !categoryId || categoryId <= 0) &&
    !categoryValue
  ) {
    throw new Error(
      "缺少 SOURCE_SITE_CATEGORY_ID、SOURCE_SITE_CATEGORY 或 --category=站长推荐",
    );
  }

  return {
    siteUrl: new URL(siteUrl).toString(),
    feedUrl,
    categoryId,
    categoryValue: categoryValue?.trim() ?? null,
    rewriteStyleId:
      rewriteStyleIdValue && Number.isInteger(Number(rewriteStyleIdValue))
        ? Number(rewriteStyleIdValue)
        : null,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10,
  };
}

async function resolveCategory(input: {
  categoryId: number | null;
  categoryValue: string | null;
}) {
  if (input.categoryId) {
    const [category] = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.id, input.categoryId))
      .limit(1);

    if (!category) {
      throw new Error(`分类不存在: ${input.categoryId}`);
    }

    return category;
  }

  if (!input.categoryValue) {
    throw new Error("缺少分类配置");
  }

  const [category] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      or(
        eq(categories.name, input.categoryValue),
        eq(categories.slug, input.categoryValue),
      ),
    )
    .limit(1);

  if (!category) {
    throw new Error(`分类不存在: ${input.categoryValue}`);
  }

  return category;
}

async function main() {
  const config = readConfig();
  const category = await resolveCategory(config);
  const result = await pullSourceSiteToAiTasks({
    siteUrl: config.siteUrl,
    feedUrl: config.feedUrl,
    categoryId: category.id,
    rewriteStyleId: config.rewriteStyleId,
    limit: config.limit,
  });

  if (result.createdCount === 0) {
    console.log(`发现 ${result.discoveredCount} 条，没有新的来源文章`);
    return;
  }

  console.log(
    `发现 ${result.discoveredCount} 条，已加入 ${result.createdCount} 个任务`,
  );
  console.table(result.tasks);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
