import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

/** @param {string} message @returns {never} */
function fail(message) {
  throw new Error(`Bilingual knowledge verification failed: ${message}`);
}

/** @param {string} relativePath @returns {string} */
function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) fail(`missing ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

/**
 * @param {string} relativePath
 * @param {string[]} snippets
 * @returns {string}
 */
function requireText(relativePath, snippets) {
  const source = read(relativePath);
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      fail(`${relativePath} is missing ${JSON.stringify(snippet)}`);
    }
  }
  return source;
}

/** @param {string} directory @returns {string[]} */
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

if (fs.existsSync(path.join(root, "apps/web/app/layout.tsx"))) {
  fail(
    "apps/web/app/layout.tsx must not mask the language-specific root layouts",
  );
}

requireText("apps/web/app/(zh)/layout.tsx", [
  '<html lang="zh-CN"',
  "<DocumentBody>",
]);
requireText("apps/web/app/(en)/layout.tsx", [
  '<html lang="en"',
  "<DocumentBody>",
]);
requireText("apps/web/app/(en)/en/knowledge/page.tsx", [
  "@/features/public/routes/en/knowledge/page",
]);
requireText("apps/web/app/(en)/en/knowledge/[slug]/page.tsx", [
  "@/features/public/routes/en/knowledge/[slug]/page",
]);
requireText("apps/web/app/(zh)/[...notFound]/page.tsx", ["notFound()"]);
requireText("apps/web/app/(en)/en/[...notFound]/page.tsx", ["notFound()"]);

const renderedWebRoutes = walk(path.join(root, "apps/web/app"))
  .filter((filePath) => /\/(?:page|layout|not-found)\.tsx$/.test(filePath))
  .map((filePath) => path.relative(root, filePath).split(path.sep).join("/"));
const ungroupedRoutes = renderedWebRoutes.filter(
  (filePath) =>
    !filePath.startsWith("apps/web/app/(zh)/") &&
    !filePath.startsWith("apps/web/app/(en)/"),
);
if (ungroupedRoutes.length > 0) {
  fail(
    `rendered Web routes lack a language root: ${ungroupedRoutes.join(", ")}`,
  );
}

requireText("packages/db/schema.ts", [
  'language: varchar("language", { length: 8 }).default("zh").notNull()',
  'translationSourceArticleId: integer("translationSourceArticleId")',
  'contentRevision: integer("contentRevision").default(1).notNull()',
  'translatedFromRevision: integer("translatedFromRevision")',
  'contentUpdatedAt: timestamp("contentUpdatedAt").defaultNow().notNull()',
  '"knowledge_articles_translation_shape_check"',
  '"knowledge_articles_aiReference_published_check"',
  '.onDelete("restrict")',
]);

const migration = requireText("drizzle/0052_charming_jackal.sql", [
  'ADD COLUMN "language" varchar(8)',
  "SET\n  \"language\" = 'zh'",
  'ALTER COLUMN "language" SET NOT NULL',
  'ADD CONSTRAINT "knowledge_articles_translation_shape_check"',
  'ADD CONSTRAINT "knowledge_articles_aiReference_published_check"',
  "ON DELETE restrict",
  'CREATE UNIQUE INDEX "knowledge_articles_translation_source_lang_uidx"',
]);
const migrationOrder = [
  'ADD COLUMN "language" varchar(8)',
  "SET\n  \"language\" = 'zh'",
  'ALTER COLUMN "language" SET NOT NULL',
  'ADD CONSTRAINT "knowledge_articles_translation_shape_check"',
].map((snippet) => migration.indexOf(snippet));
if (migrationOrder.some((position) => position < 0)) {
  fail("0052 migration phases could not be located");
}
if (
  !migrationOrder.every((position, index) => {
    const previous = migrationOrder[index - 1];
    return index === 0 || (previous !== undefined && position > previous);
  })
) {
  fail("0052 migration must stay in expand -> backfill -> constrain order");
}

requireText("src/server/knowledge/service.ts", [
  "assertExpectedRevision",
  "lockKnowledgePair",
  "slugify(textOrNull(value) ?? fallback, 320)",
  "confirmKnowledgeTranslationSync",
  "setKnowledgePublication",
  "setKnowledgeAiReference",
  "deleteKnowledgeArticleRecord",
]);
requireText("src/features/cms/actions/knowledge.ts", [
  "slugify(textOrNull(value) ?? fallback, 160)",
  "slugify(normalized, 160)",
]);
requireText("src/features/public/data/knowledge.ts", [
  "eq(knowledgeArticles.language, input.language)",
  "eq(knowledgeArticles.language, language)",
  "desc(knowledgeArticles.contentUpdatedAt)",
]);
requireText("packages/ai/knowledge-retrieval.ts", [
  'language: "zh" | "en"',
  "eq(knowledgeArticles.language, input.language)",
  "knowledgeCategories.enName",
]);
const articleRewriter = requireText("packages/ai/article-rewriter.ts", [
  "const sourceOnlyContext =",
  "本次改写只使用清洗后的来源原文和受保护内容；不引用知识库、供应商资料或其他外部信息。",
  "knowledgeReferences: [],",
  "providerReferences: [],",
]);
if (
  articleRewriter.includes("retrieveRewriteKnowledge({") ||
  articleRewriter.includes("retrieveRewriteProviderReferences({")
) {
  fail(
    "article-rewriter.ts must not retrieve knowledge-base or provider context during source-only rewriting",
  );
}
requireText("packages/cache/tags.ts", [
  '"/knowledge"',
  '"/en/knowledge"',
  '"/sitemap-knowledge.xml"',
]);
requireText("src/features/public/routes/sitemaps.ts", [
  "loc: `${baseUrl}/knowledge`",
  "loc: `${baseUrl}/en/knowledge`",
  "contentUpdatedAt: knowledgeArticles.contentUpdatedAt",
  'hreflang: "x-default"',
]);

const publicationWorkflow = requireText(
  ".github/workflows/publish-initial-knowledge.yml",
  [
    "workflow_dispatch:",
    "revise-v2) expected=\"REVISE_KNOWLEDGE_CONTENT_V2\"",
    "bun build scripts/publish-initial-bilingual-knowledge.ts",
    '--env-file="$env_file"',
    "trap 'rm -f \"$remote_publisher\"' EXIT",
    '"--phase=$phase"',
    "knowledge.changed",
  ],
);
if (publicationWorkflow.includes("secrets.CMS_DATABASE_URL")) {
  fail(
    "initial content must run on the production host, not connect to the database from a GitHub runner",
  );
}
requireText("scripts/publish-initial-bilingual-knowledge.ts", [
  '"revise-v2": "REVISE_KNOWLEDGE_CONTENT_V2"',
  "readKnowledgePublicationSnapshot",
  "preflightRevisionUnits(knowledgeUnits, state)",
  "既不匹配 V1，也不匹配",
  "await reviseKnowledgeContent(knowledgeUnits, state, service, counts)",
  "preflightUnits(units, state)",
  "await createChineseDrafts(units, state, service, counts)",
  "await createEnglishDrafts(units, state, service, counts)",
  "await confirmTranslations(units, state, service, counts)",
  'await publishLanguage(units, "zh", state, service, counts)',
  'await publishLanguage(units, "en", state, service, counts)',
  'await authorizeAiLanguage(units, "zh", state, service, counts)',
  'await authorizeAiLanguage(units, "en", state, service, counts)',
]);

console.log(
  `Bilingual knowledge boundaries verified: renderedWebRoutes=${renderedWebRoutes.length}, migrationPhases=4`,
);
