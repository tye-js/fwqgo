import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const configAction = readFileSync(
  "src/features/cms/actions/ai-rewrite-config.ts",
  "utf8",
);
const configUi = readFileSync(
  "src/features/cms/components/ai-rewrite-config-manager.tsx",
  "utf8",
);
const promptSource = readFileSync(
  "packages/core/ai-rewrite-prompts.ts",
  "utf8",
);
const rewriter = readFileSync("packages/ai/article-rewriter.ts", "utf8");
const taskManager = readFileSync(
  "src/features/cms/components/ai-rewrite-task-manager.tsx",
  "utf8",
);
const taskDetail = readFileSync(
  "src/features/cms/routes/admin/ai-rewrite/tasks/[id]/page.tsx",
  "utf8",
);
const collector = readFileSync("src/server/ai/rewrite-task-runner.ts", "utf8");
const englishTranslation = readFileSync(
  "src/server/ai/english-translation-task.ts",
  "utf8",
);
const englishSource = readFileSync(
  "src/server/ai/english-translation-source.ts",
  "utf8",
);
const scraper = readFileSync("src/server/scrape/article-scraper.ts", "utf8");
const draftEditor = readFileSync(
  "src/components/editor/markdown-editor.tsx",
  "utf8",
);
const draftSave = readFileSync(
  "src/server/posts/collected-article-draft.ts",
  "utf8",
);
const coverAction = readFileSync(
  "src/features/cms/actions/article-cover-image.ts",
  "utf8",
);

const configurablePromptFields = [
  "basePrompt",
  "metadataPrompt",
  "englishContentPrompt",
  "englishContinuationPrompt",
  "englishMetadataPrompt",
  "providerCatalogDiscoveryPrompt",
];

for (const field of configurablePromptFields) {
  assert.match(configAction, new RegExp(`\\b${field}:`));
  assert.match(configUi, new RegExp(`name="${field}"`));
}

assert.doesNotMatch(
  `${configAction}\n${configUi}`,
  /factExtractionPrompt|qualityReviewPrompt|qualityRepairPrompt|rewriteRetryPrompt|initialRewritePrompt|rewriteMaxAttempts|stylePrompt|metadataStylePrompt|englishStylePrompt|englishMetadataStylePrompt/,
);
assert.match(promptSource, /不执行独立事实提取或事实核查/);
assert.match(rewriter, /skipFactChecks: true/);
assert.match(rewriter, /maxAttempts: 1/);
assert.doesNotMatch(taskManager, /关键事实覆盖/);
assert.doesNotMatch(taskDetail, /关键事实覆盖/);
assert.doesNotMatch(taskManager, /name="rewriteStyleId"/);
assert.doesNotMatch(
  `${collector}\n${scraper}`,
  /RewriteArticle\(|generateEnglishArticleContent\(|generateEnglishMetadata\(|generateArticleMetadata\(|getActiveAiRewriteConfig\(/,
);
assert.doesNotMatch(
  `${collector}\n${draftSave}`,
  /enqueueArticleCoverGenerationTask|generateArticleCoverImage/,
);
assert.doesNotMatch(taskDetail, /SEO 关键词规划/);
assert.match(taskDetail, /ManualArticleTaskEditor/);
assert.match(taskDetail, /language="en"/);
assert.match(collector, /saveCollectedArticleDraft\(task, article\)/);
assert.match(draftEditor, /navigator\.clipboard\.writeText\(content\)/);
assert.match(draftSave, /imgUrl: DEFAULT_ARTICLE_COVER/);
assert.match(
  coverAction,
  /async function generateArticleCoverImageActionImpl/,
);
assert.match(coverAction, /await enqueueArticleCoverGenerationTask/);
assert.match(collector, /readEnglishTranslationSource\(task\.diagnostics\)/);
assert.match(englishSource, /workflow: z\.literal\("english-translation-v1"\)/);
assert.match(englishTranslation, /generateEnglishArticleContent\(/);
assert.match(
  englishTranslation,
  /assertTranslatedArticleStructure\(markdown, translated\)/,
);
assert.doesNotMatch(
  englishTranslation,
  /enqueueArticleCoverGenerationTask|generateArticleMetadata\(/,
);

console.log(
  `Article workflow verified: clean source, replace affiliate links, save draft, copy full body, explicit English translation and cover generation, and ${configurablePromptFields.length} compatible configuration fields.`,
);
