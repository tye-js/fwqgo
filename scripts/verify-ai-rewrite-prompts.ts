import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  defaultEnglishContentPrompt,
  englishImageRuleMarker,
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

/**
 * 编辑器必须支持**粘贴截图**（操作者的截图工作流），且必须走「上传 → 弹窗确认」。
 *
 * 三条契约：
 * 1. 只有剪贴板里真的是图片才拦截。**必须先判断、再 preventDefault**——
 *    顺序反了普通文本就粘不进正文，这是最容易写错也最难发现的一条。
 * 2. 上传必须走共享的 `uploadArticleImageFile`：类型/大小校验、内容哈希去重、
 *    alt 的文件名兜底只有那一份实现，不能在编辑器里再写一遍。
 * 3. 上传完成后必须交给「插入图片」弹窗确认，不能直接写进正文——
 *    否则截图会绕过 alt 与图注，正文里出现没有说明的图片。
 */
assert.match(
  draftEditor,
  /onPaste=\{handlePaste\}/,
  "编辑器必须在 textarea 上挂粘贴处理",
);
assert.match(
  draftEditor,
  /extractClipboardImageFiles\(event\.clipboardData\)/,
  "粘贴必须用共享的剪贴板解析（区分图片与普通文本）",
);
assert.match(
  draftEditor,
  /uploadArticleImageFile\(/,
  "粘贴上传必须走共享实现，不能在编辑器里另写一份校验与上传",
);
assert.match(
  draftEditor,
  /openWithImage\(/,
  "粘贴上传完成后必须交给「插入图片」弹窗确认，不能直接写进正文",
);
const pasteHandler = draftEditor.slice(
  draftEditor.indexOf("async function handlePaste"),
);
const notImageReturnIndex = pasteHandler.indexOf("if (!first) return;");
const preventDefaultIndex = pasteHandler.indexOf("event.preventDefault()");
assert.ok(
  notImageReturnIndex > -1 &&
    preventDefaultIndex > -1 &&
    notImageReturnIndex < preventDefaultIndex,
  "必须先判断「不是图片就放行」，再 preventDefault——顺序反了正文里就粘不进文字",
);
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
// 标记文本从实现里 import，不在守卫里再抄一份：抄一份的话改文案时会静默失配，
// 计数恒为 0、断言看着还在，实际什么也没验到。
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

// 追加必须落在**末尾**，操作者自定义的提示词前缀要原样保留。
//
// 曾试过把图片要求插到 `{markdownContent}` 之前，好让自定义配置与
// `defaultEnglishContentPrompt` 的结构一致（默认模板里规则就在正文之前）——
// 但那会从中间切断操作者写的提示词，`verify-article-generation.test.ts` 断言
// 「自定义提示词解析后以原文开头」，直接报错。那条契约（不篡改存库配置）比顺序一致
// 更重要，所以这里把「前缀原样 + 恰好一次」两个性质一起钉住，防止再被改回去。
const customTemplate = "Custom instruction {title} {markdownContent} {enContent}";
const resolvedCustom = resolveEnglishContentPromptTemplate(customTemplate);
assert.ok(
  resolvedCustom.startsWith(customTemplate),
  "自定义英文提示词必须原样保留前缀，追加内容不能从中间切断它",
);
assert.equal(
  countEnglishImageRule(resolvedCustom),
  1,
  "自定义英文提示词必须恰好含一次图片保留要求",
);
assert.match(
  rewriter,
  /resolveEnglishContentPromptTemplate\(/,
  "英文正文提示词必须经由 resolveEnglishContentPromptTemplate 解析，图片保留要求才会对所有配置生效",
);

console.log(
  `Article workflow verified: clean source, replace affiliate links, save draft, copy full body, explicit English translation and cover generation, and ${configurablePromptFields.length} compatible configuration fields.`,
);
