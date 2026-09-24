import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  defaultEnglishContentPrompt,
  resolveEnglishContentPromptTemplate,
} from "../packages/core/ai-rewrite-prompts";

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

// 英文翻译的图片保留要求必须落在**代码层**，不能只写在默认提示词里：
// 提示词存在数据库（`ai_rewrite_configs.englishContentPrompt`），改默认值只对新建配置生效，
// 而 `assertTranslatedArticleStructure` 会把「改变或遗漏图片」的翻译直接判为失败。
// 所以无论配置里存的是哪一版提示词，这条要求都必须出现且只出现一次。
const englishImageRuleMarker = "never drop an image";
const countEnglishImageRule = (value: string) =>
  value.split(englishImageRuleMarker).length - 1;

for (const input of [
  null,
  undefined,
  "",
  "Translate the article below.\n\n{markdownContent}",
]) {
  assert.equal(
    countEnglishImageRule(resolveEnglishContentPromptTemplate(input)),
    1,
    `英文提示词必须恰好含一次图片保留要求，输入：${String(input)}`,
  );
}
assert.equal(
  countEnglishImageRule(defaultEnglishContentPrompt),
  1,
  "默认英文提示词里的图片保留要求不应重复",
);
assert.equal(
  countEnglishImageRule(
    resolveEnglishContentPromptTemplate(
      `Custom.\n\n${englishImageRuleMarker}, never turn it into a link.\n\n{markdownContent}`,
    ),
  ),
  1,
  "已自行写明图片要求的自定义提示词不应被重复追加",
);
assert.match(
  resolveEnglishContentPromptTemplate("Custom.\n\n{markdownContent}"),
  /\{markdownContent\}/,
  "追加图片要求后必须保留 {markdownContent} 占位符",
);
assert.match(
  rewriter,
  /resolveEnglishContentPromptTemplate\(/,
  "英文正文提示词必须经由 resolveEnglishContentPromptTemplate 解析，图片保留要求才会对所有配置生效",
);

console.log(
  `Article workflow verified: clean source, replace affiliate links, save draft, copy full body, explicit English translation and cover generation, and ${configurablePromptFields.length} compatible configuration fields.`,
);
