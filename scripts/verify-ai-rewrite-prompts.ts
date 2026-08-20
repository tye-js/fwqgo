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
assert.match(taskManager, /原文约束模式/);
assert.match(taskDetail, /不执行事实核查/);

console.log(
  `AI rewrite prompt verification passed: ${configurablePromptFields.length} current fields, one-pass source-anchored rewrite, and fact-check-free UI/runtime contract present.`,
);
