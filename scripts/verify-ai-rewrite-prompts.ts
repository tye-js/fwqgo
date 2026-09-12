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
const scraper = readFileSync("src/server/scrape/article-scraper.ts", "utf8");
const manualEditor = readFileSync(
  "src/features/cms/components/manual-article-task-editor.tsx",
  "utf8",
);
const manualSave = readFileSync(
  "src/server/posts/manual-article-task.ts",
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
  `${collector}\n${manualSave}`,
  /enqueueArticleCoverGenerationTask|generateArticleCoverImage/,
);
assert.match(taskDetail, /ManualArticleTaskEditor/);
assert.match(manualEditor, /人工填写正文与 SEO/);
for (const field of ["title", "slug", "description", "keywords", "tagNames"]) {
  assert.match(manualEditor, new RegExp(`name="${field}"`));
}
assert.match(manualSave, /imgUrl: DEFAULT_ARTICLE_COVER/);
assert.match(
  coverAction,
  /export async function generateArticleCoverImageAction/,
);
assert.match(coverAction, /await enqueueArticleCoverGenerationTask/);

console.log(
  `Article workflow verified: manual body and SEO, default covers with explicitly triggered image generation, and ${configurablePromptFields.length} compatible historical configuration fields.`,
);
