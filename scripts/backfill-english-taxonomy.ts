import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { and, asc, eq } from "drizzle-orm";

import type * as AiModule from "@fwqgo/ai/article-rewriter";
import type * as EnglishTaxonomyModule from "@fwqgo/ai/english-taxonomy";
import type * as DbModule from "@fwqgo/db";
import type * as SchemaModule from "@fwqgo/db/schema";

const DEFAULT_LIMIT = 20;

type RuntimeDeps = {
  db: typeof DbModule.db;
  readDb: typeof DbModule.readDb;
  schema: typeof SchemaModule;
  generateEnglishMetadata: typeof AiModule.generateEnglishMetadata;
  applyEnglishTaxonomyToPost: typeof EnglishTaxonomyModule.applyEnglishTaxonomyToPost;
};

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readPositiveInt(name: string, fallback?: number) {
  const value = readArg(name);
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
  const [{ db, readDb }, schema, ai, taxonomy] = await Promise.all([
    import("@fwqgo/db"),
    import("@fwqgo/db/schema"),
    import("@fwqgo/ai/article-rewriter"),
    import("@fwqgo/ai/english-taxonomy"),
  ]);

  runtimeDeps = {
    db,
    readDb,
    schema,
    generateEnglishMetadata: ai.generateEnglishMetadata,
    applyEnglishTaxonomyToPost: taxonomy.applyEnglishTaxonomyToPost,
  };
  return runtimeDeps;
}

async function getPostTags(postId: number) {
  const { readDb, schema } = await getRuntimeDeps();
  const { postTags, tags } = schema;

  return readDb
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      enName: tags.enName,
      enSlug: tags.enSlug,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, postId))
    .orderBy(asc(tags.id));
}

function hasUsableEnglishTag(tag: {
  name: string;
  slug: string;
  enName: string | null;
  enSlug: string | null;
}) {
  if (tag.enName?.trim() && tag.enSlug?.trim()) return true;
  return !/\p{Script=Han}/u.test(tag.name) && /^[a-z0-9-]+$/i.test(tag.slug);
}

async function main() {
  const write = hasFlag("write");
  const force = hasFlag("force");
  const limit = readPositiveInt("limit", DEFAULT_LIMIT) ?? DEFAULT_LIMIT;
  const postId = readPositiveInt("post-id");
  const styleId = readPositiveInt("style-id");
  const {
    readDb,
    schema,
    generateEnglishMetadata,
    applyEnglishTaxonomyToPost,
  } = await getRuntimeDeps();
  const { categories, posts } = schema;
  const conditions = [eq(posts.language, "en")];
  if (postId) conditions.push(eq(posts.id, postId));

  const rows = await readDb
    .select({
      id: posts.id,
      title: posts.title,
      description: posts.description,
      keywords: posts.keywords,
      content: posts.content,
      recommendedTagId: posts.recommendedTagId,
      recommendedTagName: posts.recommendedTagName,
      categoryId: posts.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
      categoryEnName: categories.enName,
      categoryEnSlug: categories.enSlug,
    })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(posts.id))
    .limit(limit);

  const candidates = [];
  for (const post of rows) {
    const currentTags = await getPostTags(post.id);
    const categoryReady = Boolean(
      post.categoryEnName?.trim() && post.categoryEnSlug?.trim(),
    );
    const tagsReady =
      currentTags.length >= 2 && currentTags.every(hasUsableEnglishTag);

    if (force || !categoryReady || !tagsReady) {
      candidates.push({ post, currentTags, categoryReady, tagsReady });
    }
  }

  console.log(
    `${write ? "WRITE" : "DRY RUN"}: ${candidates.length}/${rows.length} English posts need taxonomy repair`,
  );
  for (const candidate of candidates) {
    console.log(
      `#${candidate.post.id} ${candidate.post.title} | category=${candidate.categoryReady ? "ok" : "missing"} | tags=${candidate.currentTags.length}${candidate.tagsReady ? " ok" : " needs-repair"}`,
    );
  }

  if (!write || candidates.length === 0) return;

  const backupPath = `/tmp/fwqgo-english-taxonomy-${Date.now()}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      candidates.map(({ post, currentTags }) => ({ post, currentTags })),
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Backup written: ${backupPath}`);

  let repaired = 0;
  let failed = 0;
  for (const { post } of candidates) {
    try {
      const metadata = await generateEnglishMetadata(
        {
          title: post.title,
          description: post.description,
          keywords: post.keywords,
          enContent: post.content,
          category: {
            name: post.categoryName,
            slug: post.categorySlug,
            enName: post.categoryEnName,
            enSlug: post.categoryEnSlug,
          },
        },
        { styleId },
      );
      const result = await applyEnglishTaxonomyToPost({
        postId: post.id,
        categoryId: post.categoryId,
        metadata,
      });

      repaired += 1;
      console.log(
        `repaired #${post.id}: ${result.category?.name ?? "category unchanged"}; ${result.tags.map((tag) => tag.name).join(", ")}`,
      );
    } catch (error) {
      failed += 1;
      console.error(
        `failed #${post.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`Finished: repaired=${repaired}, failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
