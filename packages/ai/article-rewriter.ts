import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import {
  buildSourceAnchoredRewritePrompt,
  defaultEnglishMetadataStylePrompt,
  defaultEnglishStylePrompt,
  defaultMetadataPrompt,
  defaultMetadataStylePrompt,
} from "@fwqgo/core/ai-rewrite-prompts";
import { contentToArticleMarkdown } from "@fwqgo/core/content";
import { assertPublicHttpUrl } from "@fwqgo/core/network-url";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";

import {
  buildOpenAiChatCompletionsEndpoint,
  parseAiJsonObject,
} from "./openai-compatible";
import {
  formatRewriteKnowledgeContext,
  retrieveRewriteKnowledge,
  type RewriteKnowledgeReference,
} from "./knowledge-retrieval";
import {
  formatRewriteProviderContext,
  retrieveRewriteProviderReferences,
  type RewriteProviderReference,
} from "./provider-context";
import {
  evaluateRewriteQuality,
  protectMarkdownContent,
  replaceProtectedMarkdown,
  restoreProtectedMarkdown,
  type ProtectedMarkdownContent,
  type RewriteQualityMetrics,
} from "./rewrite-quality";

const DEFAULT_AI_REWRITE_TIMEOUT_MS = 300_000;
const MIN_AI_INPUT_LENGTH = 80;
const MIN_REWRITTEN_MARKDOWN_LENGTH = 120;
const MAX_METADATA_INPUT_LENGTH = 28_000;
const MAX_ENGLISH_CONTINUATION_ATTEMPTS = 3;
const MAX_CHINESE_REWRITE_ATTEMPTS = 3;
const MAX_AI_RESPONSE_BYTES = 4 * 1024 * 1024;
const REWRITE_PROMPT_VERSION = "source-anchored-expansion-v2";

function getAiRewriteTimeoutMs() {
  const configured = Number(process.env.AI_REWRITE_TIMEOUT_MS);

  if (Number.isFinite(configured) && configured >= 10_000) {
    return configured;
  }

  return DEFAULT_AI_REWRITE_TIMEOUT_MS;
}

export interface ArticleRewriteOutput {
  title: string;
  description: string;
  keywords: string[];
  markdownContent: string;
  tagsName: string[];
  recommendTagName: string;
  quality: ArticleRewriteQuality;
}

export type ArticleRewriteProgressStage =
  | "fact_extraction"
  | "content_generation"
  | "quality_review"
  | "metadata_generation";

export interface ArticleRewriteProgress {
  stage: ArticleRewriteProgressStage;
  status: "running" | "success" | "retry";
  message: string;
  maxTokens: number;
  attempt?: number;
  inputLength?: number;
  outputLength?: number;
}

export interface ArticleRewriteOptions {
  styleId?: number;
  providerNames?: string[];
  onProgress?: (progress: ArticleRewriteProgress) => void | Promise<void>;
}

export interface ArticleRewriteQuality extends RewriteQualityMetrics {
  promptVersion: string;
  attempts: number;
  factualScore: number;
  reviewPassed: boolean;
  missingFacts: string[];
  unsupportedClaims: string[];
  distortedFacts: string[];
  knowledgeReferences: Array<{
    id: number;
    title: string;
    slug: string;
    categoryName: string;
  }>;
  providerReferences: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
}

export interface EnglishTaxonomyTag {
  name: string;
  slug: string;
}

export interface EnglishMetadataCategoryInput {
  name: string;
  slug: string;
  enName?: string | null;
  enSlug?: string | null;
}

export interface EnglishMetadataOutput {
  enTitle: string;
  enSlug: string;
  enDescription: string;
  enKeywords: string[];
  enTags: EnglishTaxonomyTag[];
  enRecommendTagName: string;
  enCategoryName: string | null;
  enCategorySlug: string | null;
}

export interface EnglishSeoVersionOutput extends EnglishMetadataOutput {
  enContent: string;
}

export type ArticleMetadataOutput = Omit<
  ArticleRewriteOutput,
  "markdownContent" | "quality"
>;

type ArticleFactSheetRaw = Partial<{
  providerName: string;
  articleType: string;
  factualSummary: string;
  criticalFacts: unknown;
  promotions: unknown;
  productGroups: unknown;
  regions: unknown;
  networkFacts: unknown;
  supportedUseCases: unknown;
  cautions: unknown;
  editorialAngle: string;
  outline: unknown;
}>;

type ArticleFactSheet = {
  providerName: string;
  articleType: string;
  factualSummary: string;
  criticalFacts: string[];
  promotions: string[];
  productGroups: string[];
  regions: string[];
  networkFacts: string[];
  supportedUseCases: string[];
  cautions: string[];
  editorialAngle: string;
  outline: string[];
};

type ArticleQualityReviewRaw = Partial<{
  factualScore: number;
  missingFacts: unknown;
  unsupportedClaims: unknown;
  distortedFacts: unknown;
  verdict: string;
}>;

type ArticleQualityReview = {
  factualScore: number;
  missingFacts: string[];
  unsupportedClaims: string[];
  distortedFacts: string[];
  passed: boolean;
};

type EnglishSeoVersionRawOutput = Partial<{
  enTitle: string;
  enSlug: string;
  enDescription: string;
  enKeywords: unknown;
  enTags: unknown;
  enRecommendTagName: string;
  enCategoryName: string;
  enCategorySlug: string;
  enContent: string;
}>;

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    code?: string | number;
    message?: string;
    type?: string;
  };
};

type AiRewriteHttpResult = {
  response: Response;
  data: ChatCompletionResponse | null;
};

type ChatCompletionTextResult = {
  text: string;
  finishReason: string | null;
  completionTokens: number | null;
};

type AiRewriteConfig = NonNullable<
  Awaited<ReturnType<typeof getActiveAiRewriteConfig>>
>;

function createReadableError(message: string, detail?: string) {
  return new Error(detail ? `${message}；原因：${detail}` : message);
}

export function getAiRewriteContentLimit(maxTokens: number) {
  return Number.isFinite(maxTokens) && maxTokens > 0
    ? Math.floor(maxTokens)
    : 8192;
}

export function getSourceAnchoredRewriteTemperature(temperature: number) {
  const normalized = Number.isFinite(temperature) ? temperature / 100 : 0;
  return Math.min(0.3, Math.max(0, normalized));
}

export function isCompleteAiJsonObject(value: string) {
  try {
    parseAiJsonObject<Record<string, unknown>>(value, "AI JSON 输出校验失败");
    return true;
  } catch {
    return false;
  }
}

async function reportRewriteProgress(
  options: ArticleRewriteOptions,
  progress: ArticleRewriteProgress,
) {
  await options.onProgress?.(progress);
}

function normalizeFactText(value: unknown, maxLength = 800) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeFactSheet(raw: ArticleFactSheetRaw): ArticleFactSheet {
  const criticalFacts = normalizeStringArray(raw.criticalFacts).slice(0, 80);
  const promotions = normalizeStringArray(raw.promotions).slice(0, 30);
  const productGroups = normalizeStringArray(raw.productGroups).slice(0, 40);
  const regions = normalizeStringArray(raw.regions).slice(0, 30);
  const networkFacts = normalizeStringArray(raw.networkFacts).slice(0, 40);
  const supportedUseCases = normalizeStringArray(raw.supportedUseCases).slice(
    0,
    20,
  );
  const cautions = normalizeStringArray(raw.cautions).slice(0, 30);
  const outline = normalizeStringArray(raw.outline).slice(0, 6);
  const fallbackOutline = [
    criticalFacts.length > 0 || normalizeFactText(raw.factualSummary, 1_500)
      ? "核心事实"
      : "",
    promotions.length > 0 || productGroups.length > 0 ? "活动与套餐" : "",
    regions.length > 0 || networkFacts.length > 0 ? "机房与网络" : "",
    supportedUseCases.length > 0 ? "来源明确提到的适用场景" : "",
    cautions.length > 0 ? "购买前需要确认的事项" : "",
  ].filter(Boolean);

  return {
    providerName: normalizeFactText(raw.providerName, 160),
    articleType: normalizeFactText(raw.articleType, 80) || "服务器内容",
    factualSummary:
      normalizeFactText(raw.factualSummary, 1_500) ||
      criticalFacts.slice(0, 6).join("；"),
    criticalFacts,
    promotions,
    productGroups,
    regions,
    networkFacts,
    supportedUseCases,
    cautions,
    editorialAngle:
      normalizeFactText(raw.editorialAngle, 500) ||
      "以来源原文为事实主轴，补充必要解释，不引入原文未涉及的主题。",
    outline: outline.length > 0 ? outline : fallbackOutline,
  };
}

function buildFactExtractionPrompt(sourceMarkdown: string) {
  return `请从来源 Markdown 中提取一份用于忠实扩写的事实核对清单，并列出来源实际涉及的主题。

要求：
1. 只输出紧凑 JSON 对象，不要输出 Markdown、解释或额外文本。
2. 所有价格、配置、优惠码、日期、库存、机房、线路、IP、退款和商家承诺必须逐字忠于来源，不得纠错、补全或推断。
3. 每条事实使用完整短句，保留主体与对象、运营商名称、肯定或否定、比较关系、条件、范围、不确定性和信息归属；不得压缩成会丢失关系的关键词。
4. criticalFacts 应覆盖正文中的关键数字和限定条件；套餐表格会由系统原样保护，无需逐行复制到 productGroups，但不能遗漏最低价格、主要配置组和付款周期。
5. supportedUseCases 只能收录来源明确说明的场景；cautions 只能收录来源已有的限制、未知项或明确提醒，不得加入编辑推断。
6. outline 输出 2 到 6 个来源确实涉及的中文主题。短文可以少于 2 个，不得为了凑结构增加线路分析、适用场景、实测、社区反馈、优缺点或总结。

JSON 格式：
{
  "providerName": "商家名",
  "articleType": "优惠/测评/公告/教程等",
  "factualSummary": "事实摘要",
  "criticalFacts": ["关键事实"],
  "promotions": ["优惠规则、优惠码和期限"],
  "productGroups": ["产品组和主要配置"],
  "regions": ["地区和机房"],
  "networkFacts": ["线路和网络事实"],
  "supportedUseCases": ["来源明确支持的场景"],
  "cautions": ["限制、未知项和购买前确认事项"],
  "editorialAngle": "新的写作角度",
  "outline": ["全新小标题"]
}

来源 Markdown：
${sourceMarkdown}`;
}

function describeProtectedContent(content: ProtectedMarkdownContent) {
  const descriptions = [
    ...content.tables.map((table) => {
      const rowCount = Math.max(0, table.markdown.split(/\r?\n/).length - 2);
      return `${table.placeholder}：原始套餐表，${rowCount} 行数据；输出时只放置该占位符。`;
    }),
    ...content.links.map(
      (link) =>
        `${link.placeholder}：原始链接 ${link.markdown}；输出时只放置该占位符。`,
    ),
  ];

  return descriptions.length > 0
    ? descriptions.join("\n")
    : "来源中没有需要占位保护的套餐表或链接。";
}

function protectedAuthorityMarkdown(content: ProtectedMarkdownContent) {
  return [...content.tables, ...content.links]
    .map((block) => `${block.placeholder}\n${block.markdown}`)
    .join("\n\n");
}

function buildQualityReviewPrompt(input: {
  sourceContent: string;
  factSheet: ArticleFactSheet;
  protectedContent: ProtectedMarkdownContent;
  providerContext: string;
  knowledgeContext: string;
  markdownContent: string;
}) {
  return `请审查候选文章是否忠于允许使用的事实。

事实优先级：
1. 完整来源原文和受保护原始内容是套餐、价格、配置、线路、运营商、库存、优惠、测试、用户反馈和链接的唯一依据。
2. 带官网来源的供应商资料只能支持其中明确列出的供应商介绍、退款政策和禁止事项，不能支持套餐、线路、运营商、库存、解锁或测试事实。
3. 知识库只能解释来源原文已经出现的通用概念，不能引入新的 ASN、线路名、运营商、地区、数据或商家结论。
4. 必须逐项核对主体与对象、运营商、肯定或否定、比较关系、适用条件、不确定性及信息归属。把联通换成移动、把“可能”写成“确定”、把编辑推断写成官方或社区反馈，都属于事实失真或无依据表述。

只输出紧凑 JSON：
{
  "factualScore": 0到100的整数,
  "missingFacts": ["遗漏且影响读者决策的来源事实"],
  "unsupportedClaims": ["无依据的新事实或商家结论"],
  "distortedFacts": ["被改错的数字、名称、条件或关系"],
  "verdict": "pass 或 fail"
}

完整来源原文：
${input.sourceContent}

来源事实核对清单：
${JSON.stringify(input.factSheet)}

受保护原始内容：
${protectedAuthorityMarkdown(input.protectedContent) || "无"}

供应商官网资料：
${input.providerContext}

知识库通用解释：
${input.knowledgeContext}

候选 Markdown：
${input.markdownContent}`;
}

function normalizeQualityReview(raw: ArticleQualityReviewRaw) {
  const factualScoreValue = Number(raw.factualScore);
  const factualScore = Number.isFinite(factualScoreValue)
    ? Math.max(0, Math.min(100, Math.round(factualScoreValue)))
    : 0;
  const missingFacts = normalizeStringArray(raw.missingFacts).slice(0, 20);
  const unsupportedClaims = normalizeStringArray(raw.unsupportedClaims).slice(
    0,
    20,
  );
  const distortedFacts = normalizeStringArray(raw.distortedFacts).slice(0, 20);
  const verdict = normalizeFactText(raw.verdict, 20).toLowerCase();
  const verdictPassed = verdict === "pass" || verdict === "通过";

  return {
    factualScore,
    missingFacts,
    unsupportedClaims,
    distortedFacts,
    passed:
      verdictPassed &&
      factualScore >= 85 &&
      missingFacts.length === 0 &&
      unsupportedClaims.length === 0 &&
      distortedFacts.length === 0,
  } satisfies ArticleQualityReview;
}

function buildRewriteRetryFeedback(input: {
  metrics?: RewriteQualityMetrics;
  review?: ArticleQualityReview;
  placeholderIssues?: string[];
  outputIssue?: string;
}) {
  const issues = [
    input.outputIssue,
    ...(input.placeholderIssues?.length
      ? [`缺失或重复占位符：${input.placeholderIssues.join("、")}`]
      : []),
    ...(input.metrics?.reasons ?? []),
    ...(input.review?.missingFacts.length
      ? [`遗漏事实：${input.review.missingFacts.join("；")}`]
      : []),
    ...(input.review?.unsupportedClaims.length
      ? [`无依据表述：${input.review.unsupportedClaims.join("；")}`]
      : []),
    ...(input.review?.distortedFacts.length
      ? [`事实失真：${input.review.distortedFacts.join("；")}`]
      : []),
  ].filter((item): item is string => Boolean(item));

  return issues.length > 0
    ? `上一轮未通过。请删除所有无依据术语和归因，再以完整来源原文为事实主轴重新扩写全文；不要只依据压缩事实包，也不要局部替换词语：\n${issues
        .slice(0, 12)
        .map((item) => `- ${item}`)
        .join("\n")}`
    : "上一轮未通过，请回到完整来源原文重新扩写，并逐项核对事实关系。";
}

function fillPromptTemplate(template: string, values: Record<string, string>) {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

function getMetadataStylePrompt(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultMetadataStylePrompt;
}

function getEnglishStylePrompt(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultEnglishStylePrompt;
}

function getEnglishMetadataStylePrompt(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0
    ? trimmed
    : defaultEnglishMetadataStylePrompt;
}

function buildMetadataPrompt(
  markdownContent: string,
  metadataStylePrompt?: string | null,
  maxContentLength = MAX_METADATA_INPUT_LENGTH,
  configuredPrompt?: string | null,
) {
  const style = getMetadataStylePrompt(metadataStylePrompt);
  const metadataInputLength = Math.min(
    MAX_METADATA_INPUT_LENGTH,
    Math.max(MIN_AI_INPUT_LENGTH, Math.floor(maxContentLength)),
  );

  const custom = configuredPrompt?.trim();
  const usesContentPlaceholder = ["{markdownContent}", "{htmlContent}"].some(
    (placeholder) => custom?.includes(placeholder),
  );
  const template = usesContentPlaceholder
    ? (custom ?? defaultMetadataPrompt)
    : `${defaultMetadataPrompt}${
        custom
          ? `\n\n后台补充 SEO 要求（不得突破上方事实约束）：\n${custom}`
          : ""
      }`;

  return fillPromptTemplate(template, {
    metadataStylePrompt: style,
    markdownContent: markdownContent.slice(0, metadataInputLength),
    htmlContent: markdownContent.slice(0, metadataInputLength),
  });
}

function buildEnglishContentPrompt(input: {
  title: string;
  description: string | null;
  keywords: string | null;
  markdownContent: string;
  stylePrompt: string;
  maxMarkdownLength: number;
}) {
  return `You are an English editor for a VPS/server deals website.

Translate and localize the already rewritten Chinese hosting deal article from compact Markdown into English Markdown content.

Writing style:
${input.stylePrompt}

Requirements:
1. Output only the translated/localized English Markdown body.
2. Do not output JSON, code fences, explanations, title, meta description or keywords.
3. Preserve Markdown structure. Use headings starting from ##.
4. Preserve factual details: provider names, prices, CPU, RAM, storage, bandwidth, locations, routes, promo codes, coupons and URLs.
5. Do not invent missing specs, prices, discounts, stock status or claims.
6. Keep affiliate links and short links unchanged.

Chinese title:
${input.title}

Chinese description:
${input.description ?? ""}

Chinese keywords:
${input.keywords ?? ""}

Rewritten Chinese article Markdown:
${input.markdownContent.slice(0, input.maxMarkdownLength)}`;
}

function buildEnglishContinuationPrompt(input: {
  originalPrompt: string;
  generatedContent: string;
}) {
  return `${input.originalPrompt}

The previous response was cut off before the article was complete.

Continue the same English Markdown article exactly where it stopped.
Do not repeat sections that were already written.
Do not add explanations, JSON, code fences, title, meta description or keywords.

Already generated English Markdown tail:
${input.generatedContent.slice(-2_000)}`;
}

function buildEnglishMetadataPrompt(input: {
  title: string;
  description: string | null;
  keywords: string | null;
  enContent: string;
  category?: EnglishMetadataCategoryInput | null;
  metadataStylePrompt?: string | null;
  maxContentLength?: number;
}) {
  const style = getEnglishMetadataStylePrompt(input.metadataStylePrompt);
  const metadataInputLength = Math.min(
    MAX_METADATA_INPUT_LENGTH,
    Math.max(
      MIN_AI_INPUT_LENGTH,
      Math.floor(input.maxContentLength ?? MAX_METADATA_INPUT_LENGTH),
    ),
  );

  const categoryContext = input.category
    ? `\nSource category:\n- Chinese name: ${input.category.name}\n- Source slug: ${input.category.slug}\n- Existing English name: ${input.category.enName ?? ""}\n- Existing English slug: ${input.category.enSlug ?? ""}\n`
    : "";

  return `You are an SEO editor for an English VPS/server deals website.

Generate English SEO metadata from the translated English Markdown body.

Requirements:
1. Return only a valid JSON object.
2. Output compact JSON only. Do not add indentation, whitespace padding, Markdown code fences or explanations.
3. enTitle should be an English SEO title.
4. enSlug must be short, lowercase, ASCII only, words separated by hyphens.
5. enDescription should be within 160 characters.
6. enKeywords should contain 2 to 6 English SEO keywords.
7. enTags should contain 2 to 6 concise English topic tags derived from the article. Do not output Chinese tags.
8. enRecommendTagName must exactly match one item in enTags.
9. When source category information is provided, enCategoryName must be a concise natural English category name and enCategorySlug must be lowercase ASCII words separated by hyphens.
10. Do not invent missing specs, prices, discounts or claims.

SEO style:
${style}

JSON shape:
{
  "enTitle": "English SEO title",
  "enSlug": "english-seo-slug",
  "enDescription": "English meta description, within 160 characters",
  "enKeywords": ["keyword 1", "keyword 2"],
  "enTags": ["English tag 1", "English tag 2"],
  "enRecommendTagName": "English tag 1",
  "enCategoryName": "English category name",
  "enCategorySlug": "english-category-slug"
}

Original Chinese title:
${input.title}

Original Chinese description:
${input.description ?? ""}

Original Chinese keywords:
${input.keywords ?? ""}
${categoryContext}

English Markdown:
${input.enContent.slice(0, metadataInputLength)}`;
}

function cleanMarkdownText(text: string) {
  return text
    .replace(/^```(?:markdown|md)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,，、;；\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function normalizeMetadata(
  metadata: Partial<ArticleMetadataOutput>,
  markdownContent: string,
): ArticleMetadataOutput {
  const text = markdownContent
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const fallbackTitle = text.slice(0, 48) || "未命名采集文章";

  return {
    title:
      typeof metadata.title === "string" && metadata.title.trim()
        ? metadata.title.trim()
        : fallbackTitle,
    description:
      typeof metadata.description === "string" && metadata.description.trim()
        ? metadata.description.trim().slice(0, 180)
        : text.slice(0, 120),
    keywords: normalizeStringArray(metadata.keywords).slice(0, 6),
    tagsName: normalizeStringArray(metadata.tagsName).slice(0, 12),
    recommendTagName:
      typeof metadata.recommendTagName === "string" &&
      metadata.recommendTagName.trim()
        ? metadata.recommendTagName.trim()
        : (normalizeStringArray(metadata.tagsName)[0] ?? ""),
  };
}

function validateMetadata(metadata: ArticleMetadataOutput) {
  const issues: string[] = [];

  if (metadata.title.length < 6) {
    issues.push("标题过短");
  }

  if (metadata.description.length < 20) {
    issues.push("摘要过短");
  }

  if (metadata.keywords.length === 0) {
    issues.push("关键词为空");
  }

  if (metadata.tagsName.length === 0) {
    issues.push("标签为空");
  }

  if (!metadata.recommendTagName) {
    issues.push("推荐标签为空");
  }

  if (issues.length > 0) {
    throw createReadableError(
      "AI 元信息生成失败：返回字段不完整",
      issues.join("、"),
    );
  }
}

function normalizeComparableTitle(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, "")
    .toLowerCase()
    .trim();
}

function removeDuplicatedTitleFromMarkdown(
  markdownContent: string,
  title: string,
) {
  const normalizedTitle = normalizeComparableTitle(title);
  const lines = markdownContent.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);

  if (!normalizedTitle || firstContentIndex < 0) {
    return markdownContent;
  }

  const firstLine = lines[firstContentIndex]?.trim() ?? "";
  const headingMatch = /^#{1,6}\s+(.+)$/.exec(firstLine);
  if (!headingMatch) {
    return markdownContent;
  }

  const headingText = headingMatch[1]?.trim() ?? "";
  const normalizedHeading = normalizeComparableTitle(headingText);
  if (
    normalizedHeading === normalizedTitle ||
    normalizedTitle.includes(normalizedHeading) ||
    normalizedHeading.includes(normalizedTitle)
  ) {
    lines.splice(firstContentIndex, 1);
  }

  return lines.join("\n").trim();
}

function normalizeEnglishSlug(value: string, fallback: string) {
  const raw = value.trim() || fallback;
  const slug = raw
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return slug || "server-deal";
}

function normalizeEnglishMetadata(
  raw: EnglishSeoVersionRawOutput,
  fallback: {
    title: string;
    description: string | null;
    category?: EnglishMetadataCategoryInput | null;
  },
): EnglishMetadataOutput {
  const enTitle =
    typeof raw.enTitle === "string" && raw.enTitle.trim()
      ? raw.enTitle.trim()
      : fallback.title;
  const enDescription =
    typeof raw.enDescription === "string" && raw.enDescription.trim()
      ? raw.enDescription.trim().slice(0, 180)
      : (fallback.description ?? enTitle).slice(0, 180);

  const enKeywords = normalizeStringArray(raw.enKeywords).slice(0, 6);
  const rawTagNames = normalizeStringArray(raw.enTags);
  const candidateTagNames = rawTagNames.length > 0 ? rawTagNames : enKeywords;
  const enTags: EnglishTaxonomyTag[] = [];
  const seenTagSlugs = new Set<string>();

  for (const candidate of candidateTagNames) {
    const name = candidate.trim().slice(0, 80);
    const slug = normalizeEnglishSlug(name, name);

    if (!name || /\p{Script=Han}/u.test(name) || seenTagSlugs.has(slug)) {
      continue;
    }

    seenTagSlugs.add(slug);
    enTags.push({ name, slug });
    if (enTags.length >= 6) break;
  }

  const requestedRecommendTagName =
    typeof raw.enRecommendTagName === "string"
      ? raw.enRecommendTagName.trim()
      : "";
  const recommendedTag =
    enTags.find(
      (tag) =>
        tag.name.toLowerCase() === requestedRecommendTagName.toLowerCase(),
    ) ?? enTags[0];
  const category = fallback.category;
  const enCategoryName = category
    ? (typeof raw.enCategoryName === "string" && raw.enCategoryName.trim()
        ? raw.enCategoryName.trim()
        : (nonEmptyTrim(category.enName) ?? "")
      ).slice(0, 120)
    : null;
  const enCategorySlug = category
    ? normalizeEnglishSlug(
        typeof raw.enCategorySlug === "string"
          ? raw.enCategorySlug
          : (category.enSlug ?? ""),
        nonEmptyTrim(enCategoryName) ??
          nonEmptyTrim(category.enSlug) ??
          "server-deals",
      )
    : null;

  return {
    enTitle,
    enSlug: normalizeEnglishSlug(
      typeof raw.enSlug === "string" ? raw.enSlug : "",
      enTitle,
    ),
    enDescription,
    enKeywords,
    enTags,
    enRecommendTagName: recommendedTag?.name ?? "",
    enCategoryName,
    enCategorySlug,
  };
}

function validateEnglishMetadata(
  output: EnglishMetadataOutput,
  requireCategory: boolean,
) {
  const issues: string[] = [];

  if (output.enTitle.length < 8) {
    issues.push("英文标题过短");
  }

  if (!/^[a-z0-9-]+$/.test(output.enSlug)) {
    issues.push("英文 slug 必须为小写字母、数字和连字符");
  }

  if (output.enDescription.length < 30) {
    issues.push("英文摘要过短");
  }

  if (output.enKeywords.length === 0) {
    issues.push("英文关键词为空");
  }

  if (output.enTags.length < 2) {
    issues.push("英文标签少于 2 个");
  }

  if (!output.enRecommendTagName) {
    issues.push("英文推荐标签为空");
  }

  if (requireCategory && !output.enCategoryName) {
    issues.push("英文分类名称为空");
  }

  if (output.enCategoryName && /\p{Script=Han}/u.test(output.enCategoryName)) {
    issues.push("英文分类名称不能包含中文");
  }

  if (requireCategory && !output.enCategorySlug) {
    issues.push("英文分类 slug 为空");
  }

  if (issues.length > 0) {
    throw createReadableError(
      "英文 SEO 版本生成失败：返回字段不完整",
      issues.join("、"),
    );
  }
}

function getAiProviderErrorMessage(input: {
  status: number;
  statusText: string;
  error?: ChatCompletionResponse["error"];
}) {
  const message = input.error?.message?.trim();
  const prefix = `AI 接口请求失败：HTTP ${input.status} ${input.statusText}`;

  if (input.status === 401 || input.status === 403) {
    return `${prefix}，请检查 API Key 是否正确、是否有模型权限`;
  }

  if (input.status === 404) {
    return `${prefix}，请检查 Base URL 是否需要包含或去掉 /v1，以及模型名称是否存在`;
  }

  if (input.status === 429) {
    return `${prefix}，请求频率或额度受限，请稍后重试或更换模型`;
  }

  if (input.status >= 500) {
    return `${prefix}，服务商当前异常，请稍后重试`;
  }

  return message ? `${prefix}，${message}` : prefix;
}

async function requestChatCompletionResult(input: {
  config: AiRewriteConfig;
  endpoint: string;
  timeoutMs: number;
  maxTokens: number;
  responseFormat?: { type: "json_object" };
  temperature?: number;
  systemPrompt: string;
  userPrompt: string;
  stepName: string;
  allowLengthFinishReason?: boolean;
}): Promise<ChatCompletionTextResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = async (): Promise<AiRewriteHttpResult> => {
      const endpoint = await assertPublicHttpUrl(input.endpoint, "AI 接口地址");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.config.apiKey}`,
          "Content-Type": "application/json",
        },
        redirect: "error",
        signal: controller.signal,
        body: JSON.stringify({
          model: input.config.model,
          temperature: input.temperature ?? input.config.temperature / 100,
          max_tokens: input.maxTokens,
          ...(input.responseFormat
            ? { response_format: input.responseFormat }
            : {}),
          messages: [
            {
              role: "system",
              content: input.systemPrompt,
            },
            {
              role: "user",
              content: input.userPrompt,
            },
          ],
        }),
      });
      const responseText = await readResponseTextWithLimit(
        response,
        MAX_AI_RESPONSE_BYTES,
      );
      if (responseText === null) {
        throw createReadableError(
          `${input.stepName}失败：AI 响应过大`,
          "服务商返回超过 4 MiB 安全限制，请检查中转接口或更换服务商",
        );
      }
      let data: ChatCompletionResponse | null = null;
      try {
        data = JSON.parse(responseText || "{}") as ChatCompletionResponse;
      } catch {
        // HTTP errors may legitimately return non-JSON bodies; classify them below.
      }

      return { response, data };
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new Error(
            `AI 改写请求超时（${Math.round(input.timeoutMs / 1000)}秒）：${input.config.name} / ${input.config.model}，请稍后重试或换一个改写模型`,
          ),
        );
      }, input.timeoutMs);
    });

    const result = await Promise.race([request(), timeoutPromise]);

    if (!result.response.ok) {
      throw createReadableError(
        `${input.stepName}失败`,
        getAiProviderErrorMessage({
          status: result.response.status,
          statusText: result.response.statusText,
          error: result.data?.error,
        }),
      );
    }

    if (!result.data) {
      throw createReadableError(
        `${input.stepName}失败：AI 接口返回格式错误`,
        "服务商没有返回有效 JSON，请检查中转接口的 OpenAI 兼容性",
      );
    }

    const choice = result.data?.choices?.[0];
    const text = choice?.message?.content;
    const completionTokens =
      typeof result.data?.usage?.completion_tokens === "number"
        ? result.data.usage.completion_tokens
        : null;
    const hasCompleteStructuredOutput =
      input.responseFormat?.type === "json_object" &&
      typeof text === "string" &&
      isCompleteAiJsonObject(text);

    if (
      choice?.finish_reason === "length" &&
      !input.allowLengthFinishReason &&
      !hasCompleteStructuredOutput
    ) {
      throw createReadableError(
        `${input.stepName}失败：模型输出被截断`,
        `本步骤实际请求 Max Tokens ${input.maxTokens}${completionTokens === null ? "" : `，已消耗 ${completionTokens} 个输出 token`}。请缩短正文输入，或更换支持更大输出/更少推理消耗的模型`,
      );
    }

    if (!text) {
      throw createReadableError(
        `${input.stepName}失败：模型返回为空`,
        "请检查模型名称、额度和第三方接口兼容性",
      );
    }

    return {
      text,
      finishReason: choice?.finish_reason ?? null,
      completionTokens,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `AI 改写请求超时（${Math.round(input.timeoutMs / 1000)}秒）：${input.config.name} / ${input.config.model}，请稍后重试或换一个改写模型`,
      );
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function requestChatCompletion(input: {
  config: AiRewriteConfig;
  endpoint: string;
  timeoutMs: number;
  maxTokens: number;
  responseFormat?: { type: "json_object" };
  temperature?: number;
  systemPrompt: string;
  userPrompt: string;
  stepName: string;
}) {
  const result = await requestChatCompletionResult(input);
  return result.text;
}

function appendMarkdownContinuation(content: string, continuation: string) {
  const base = content.trimEnd();
  const next = continuation.trimStart();

  if (!base) {
    return next;
  }

  for (
    let length = Math.min(1_000, base.length, next.length);
    length >= 80;
    length -= 20
  ) {
    const suffix = base.slice(-length);
    if (next.startsWith(suffix)) {
      return `${base}${next.slice(length)}`;
    }
  }

  return `${base}\n\n${next}`;
}

export async function rewriteArticleWithAi(
  content: string,
  options: ArticleRewriteOptions = {},
): Promise<ArticleRewriteOutput> {
  const config = await getActiveAiRewriteConfig(options.styleId);
  const timeoutMs = getAiRewriteTimeoutMs();

  if (!config) {
    throw createReadableError(
      "AI 改写未启用",
      "请先在后台「内容生产 - 接口配置」启用一套默认配置",
    );
  }

  if (!config.apiKey) {
    throw createReadableError(
      "AI 改写配置不完整",
      `「${config.name}」缺少 API Key`,
    );
  }

  const normalizedContent = content.trim();
  if (normalizedContent.length < MIN_AI_INPUT_LENGTH) {
    throw createReadableError(
      "AI 改写输入过短",
      `清洗后的正文只有 ${normalizedContent.length} 个字符，可能没有抓到有效正文`,
    );
  }

  const endpoint = buildOpenAiChatCompletionsEndpoint(config.baseUrl);
  const protectedContent = protectMarkdownContent(normalizedContent);
  const protectedSource = replaceProtectedMarkdown(
    normalizedContent,
    protectedContent,
  );
  const factExtractionPrompt = buildFactExtractionPrompt(
    `${protectedSource}\n\n受保护原始内容：\n${
      protectedAuthorityMarkdown(protectedContent) || "无"
    }`,
  );
  await reportRewriteProgress(options, {
    stage: "fact_extraction",
    status: "running",
    message: "正在提取来源事实",
    maxTokens: config.maxTokens,
    inputLength: factExtractionPrompt.length,
  });
  const factExtractionText = await requestChatCompletion({
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    temperature: 0.1,
    stepName: "来源事实提取",
    systemPrompt:
      "你是严格的服务器文章事实抽取器。只输出 JSON；不得改写、纠错、推断或补造来源事实。",
    userPrompt: factExtractionPrompt,
  });
  await reportRewriteProgress(options, {
    stage: "fact_extraction",
    status: "success",
    message: "来源事实提取完成",
    maxTokens: config.maxTokens,
    inputLength: factExtractionPrompt.length,
    outputLength: factExtractionText.length,
  });
  const factSheet = normalizeFactSheet(
    parseAiJsonObject<ArticleFactSheetRaw>(
      factExtractionText,
      "来源事实提取失败",
    ),
  );
  if (!factSheet.factualSummary && factSheet.criticalFacts.length === 0) {
    throw createReadableError(
      "来源事实提取失败：事实包为空",
      "请检查来源正文是否包含可识别的服务器、套餐或活动信息",
    );
  }

  let knowledgeReferences: RewriteKnowledgeReference[] = [];
  let providerReferences: RewriteProviderReference[] = [];
  const [knowledgeResult, providerResult] = await Promise.allSettled([
    retrieveRewriteKnowledge({
      values: [
        factSheet.providerName,
        factSheet.articleType,
        factSheet.factualSummary,
        factSheet.editorialAngle,
        ...factSheet.criticalFacts,
        ...factSheet.productGroups,
        ...factSheet.regions,
        ...factSheet.networkFacts,
        ...factSheet.supportedUseCases,
        ...factSheet.cautions,
      ],
    }),
    retrieveRewriteProviderReferences({ names: options.providerNames ?? [] }),
  ]);
  if (knowledgeResult.status === "fulfilled") {
    knowledgeReferences = knowledgeResult.value;
  } else {
    console.error(
      "AI 改写知识库检索失败，将在无知识上下文下继续:",
      knowledgeResult.reason,
    );
  }
  if (providerResult.status === "fulfilled") {
    providerReferences = providerResult.value;
  } else {
    console.error(
      "AI 改写供应商资料检索失败，将在无供应商上下文下继续:",
      providerResult.reason,
    );
  }
  const knowledgeContext = formatRewriteKnowledgeContext(knowledgeReferences);
  const providerContext = formatRewriteProviderContext(providerReferences);
  const allowedProviderFacts =
    providerReferences.length > 0 ? providerContext : "";
  let retryFeedback = "";
  let acceptedMarkdown = "";
  let acceptedMetrics: RewriteQualityMetrics | null = null;
  let acceptedReview: ArticleQualityReview | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_CHINESE_REWRITE_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    const candidatePrompt = buildSourceAnchoredRewritePrompt({
      configuredPrompt: config.basePrompt,
      stylePrompt: config.stylePrompt,
      sourceContent: protectedSource,
      factSheet: JSON.stringify(factSheet, null, 2),
      outline:
        factSheet.outline.length > 0
          ? factSheet.outline.map((item) => `- ${item}`).join("\n")
          : "来源内容较短，请按原文主题自然扩写，不必强行增加小节。",
      providerContext,
      knowledgeContext,
      protectedContent: describeProtectedContent(protectedContent),
      retryFeedback:
        retryFeedback ||
        "首次生成，没有上一轮反馈。请直接满足全部事实保真要求。",
    });
    await reportRewriteProgress(options, {
      stage: "content_generation",
      status: "running",
      message: `正在生成第 ${attempt} 轮候选正文`,
      maxTokens: config.maxTokens,
      attempt,
      inputLength: candidatePrompt.length,
    });
    const candidateText = await requestChatCompletion({
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      temperature: getSourceAnchoredRewriteTemperature(config.temperature),
      stepName: `原文锚定正文扩写（第 ${attempt} 轮）`,
      systemPrompt:
        "你是服务器/VPS 内容主编。只输出忠实扩写的中文正文 Markdown；完整原文是事实主轴，严格保持实体关系、运营商、否定、条件与归因，并服从供应商资料和知识库的使用边界。",
      userPrompt: candidatePrompt,
    });
    const candidate = cleanMarkdownText(candidateText);
    await reportRewriteProgress(options, {
      stage: "content_generation",
      status: "success",
      message: `第 ${attempt} 轮候选正文生成完成`,
      maxTokens: config.maxTokens,
      attempt,
      inputLength: candidatePrompt.length,
      outputLength: candidate.length,
    });

    if (!candidate || candidate.length < MIN_REWRITTEN_MARKDOWN_LENGTH) {
      retryFeedback = buildRewriteRetryFeedback({
        outputIssue: candidate
          ? `正文只有 ${candidate.length} 个字符，内容不完整`
          : "模型返回空正文",
      });
      continue;
    }

    const restored = restoreProtectedMarkdown(candidate, protectedContent);
    let metrics = evaluateRewriteQuality(normalizedContent, restored.markdown, {
      allowedFactsMarkdown: allowedProviderFacts,
    });
    if (restored.missingPlaceholders.length > 0) {
      metrics = {
        ...metrics,
        passed: false,
        reasons: [
          ...metrics.reasons,
          `受保护内容占位符缺失或重复：${restored.missingPlaceholders.join("、")}`,
        ],
      };
    }

    const reviewPrompt = buildQualityReviewPrompt({
      sourceContent: protectedSource,
      factSheet,
      protectedContent,
      providerContext,
      knowledgeContext,
      markdownContent: restored.markdown,
    });
    await reportRewriteProgress(options, {
      stage: "quality_review",
      status: "running",
      message: `正在执行第 ${attempt} 轮事实质量审查`,
      maxTokens: config.maxTokens,
      attempt,
      inputLength: reviewPrompt.length,
      outputLength: restored.markdown.length,
    });
    const reviewText = await requestChatCompletion({
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      stepName: `事实质量审查（第 ${attempt} 轮）`,
      systemPrompt:
        "你是独立的事实审查员。只输出 JSON，严格区分来源事实、通用知识和无依据商家结论。",
      userPrompt: reviewPrompt,
    });
    const review = normalizeQualityReview(
      parseAiJsonObject<ArticleQualityReviewRaw>(
        reviewText,
        "事实质量审查失败",
      ),
    );

    if (metrics.passed && review.passed) {
      await reportRewriteProgress(options, {
        stage: "quality_review",
        status: "success",
        message: `第 ${attempt} 轮事实质量审查通过`,
        maxTokens: config.maxTokens,
        attempt,
        inputLength: reviewPrompt.length,
        outputLength: reviewText.length,
      });
      acceptedMarkdown = restored.markdown;
      acceptedMetrics = metrics;
      acceptedReview = review;
      break;
    }

    retryFeedback = buildRewriteRetryFeedback({
      metrics,
      review,
      placeholderIssues: restored.missingPlaceholders,
    });
    await reportRewriteProgress(options, {
      stage: "quality_review",
      status: "retry",
      message: `第 ${attempt} 轮质量审查未通过，准备重试`,
      maxTokens: config.maxTokens,
      attempt,
      inputLength: reviewPrompt.length,
      outputLength: reviewText.length,
    });
  }

  if (!acceptedMarkdown || !acceptedMetrics || !acceptedReview) {
    throw createReadableError(
      `正文改写质量审查未通过（已尝试 ${attempts} 轮）`,
      retryFeedback.replace(/\n+/g, " ").slice(0, 1_200),
    );
  }

  const metadataPrompt = buildMetadataPrompt(
    acceptedMarkdown,
    config.metadataStylePrompt,
    getAiRewriteContentLimit(config.maxTokens),
    config.metadataPrompt,
  );
  await reportRewriteProgress(options, {
    stage: "metadata_generation",
    status: "running",
    message: "正在生成标题与 SEO 元信息",
    maxTokens: config.maxTokens,
    inputLength: metadataPrompt.length,
  });
  const metadataText = await requestChatCompletion({
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    stepName: "标题/SEO 元信息生成",
    systemPrompt:
      "你只输出符合要求的 JSON 对象，不输出 Markdown、解释或额外文本。",
    userPrompt: metadataPrompt,
  });
  const metadata = normalizeMetadata(
    parseAiJsonObject<Partial<ArticleMetadataOutput>>(
      metadataText,
      "AI 元信息生成失败",
    ),
    acceptedMarkdown,
  );
  validateMetadata(metadata);
  await reportRewriteProgress(options, {
    stage: "metadata_generation",
    status: "success",
    message: "标题与 SEO 元信息生成完成",
    maxTokens: config.maxTokens,
    inputLength: metadataPrompt.length,
    outputLength: metadataText.length,
  });

  return {
    ...metadata,
    markdownContent: removeDuplicatedTitleFromMarkdown(
      acceptedMarkdown,
      metadata.title,
    ),
    quality: {
      ...acceptedMetrics,
      passed: true,
      promptVersion: REWRITE_PROMPT_VERSION,
      attempts,
      factualScore: acceptedReview.factualScore,
      reviewPassed: acceptedReview.passed,
      missingFacts: acceptedReview.missingFacts,
      unsupportedClaims: acceptedReview.unsupportedClaims,
      distortedFacts: acceptedReview.distortedFacts,
      knowledgeReferences: knowledgeReferences.map((reference) => ({
        id: reference.id,
        title: reference.title,
        slug: reference.slug,
        categoryName: reference.categoryName,
      })),
      providerReferences: providerReferences.map((reference) => ({
        id: reference.id,
        name: reference.name,
        slug: reference.slug ?? "",
      })),
    },
  };
}

export async function generateArticleMetadata(
  input: { markdownContent: string },
  options: { styleId?: number } = {},
): Promise<ArticleMetadataOutput> {
  const config = await getVerifiedAiConfig("中文 SEO 生成", options);
  const timeoutMs = getAiRewriteTimeoutMs();
  const normalizedContent = input.markdownContent.trim();

  if (normalizedContent.length < MIN_AI_INPUT_LENGTH) {
    throw createReadableError(
      "中文 SEO 生成输入过短",
      `正文 Markdown 只有 ${normalizedContent.length} 个字符`,
    );
  }

  const endpoint = buildOpenAiChatCompletionsEndpoint(config.baseUrl);
  const metadataText = await requestChatCompletion({
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    stepName: "中文 SEO 元信息生成",
    systemPrompt:
      "你只输出符合要求的 JSON 对象，不输出 Markdown、解释或额外文本。",
    userPrompt: buildMetadataPrompt(
      normalizedContent,
      config.metadataStylePrompt,
      getAiRewriteContentLimit(config.maxTokens),
      config.metadataPrompt,
    ),
  });
  const metadata = normalizeMetadata(
    parseAiJsonObject<Partial<ArticleMetadataOutput>>(
      metadataText,
      "AI 元信息生成失败",
    ),
    normalizedContent,
  );
  validateMetadata(metadata);

  return metadata;
}

async function getVerifiedAiConfig(
  purpose: string,
  options: { styleId?: number } = {},
) {
  const config = await getActiveAiRewriteConfig(options.styleId);

  if (!config) {
    throw createReadableError(
      `${purpose}未启用`,
      "请先在后台「内容生产 - 改写接口配置」启用一套默认配置",
    );
  }

  if (!config.apiKey) {
    throw createReadableError(
      "AI 改写配置不完整",
      `「${config.name}」缺少 API Key`,
    );
  }

  return config;
}

export async function generateEnglishArticleContent(
  input: {
    title: string;
    description: string | null;
    keywords: string | null;
    markdownContent: string;
  },
  options: { styleId?: number } = {},
): Promise<string> {
  const config = await getVerifiedAiConfig("英文正文生成", options);
  const timeoutMs = getAiRewriteTimeoutMs();

  const normalizedContent = input.markdownContent.trim();
  if (normalizedContent.length < MIN_AI_INPUT_LENGTH) {
    throw createReadableError(
      "英文 SEO 生成输入过短",
      `中文正文 Markdown 只有 ${normalizedContent.length} 个字符`,
    );
  }

  const endpoint = buildOpenAiChatCompletionsEndpoint(config.baseUrl);
  const contentLimit = getAiRewriteContentLimit(config.maxTokens);
  const userPrompt = buildEnglishContentPrompt({
    ...input,
    markdownContent: normalizedContent,
    stylePrompt: getEnglishStylePrompt(config.englishStylePrompt),
    maxMarkdownLength: contentLimit,
  });
  const firstResult = await requestChatCompletionResult({
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    stepName: "英文正文生成",
    systemPrompt:
      "You are a professional English editor. Output only the English Markdown body.",
    userPrompt,
    allowLengthFinishReason: true,
  });
  let enContent = cleanMarkdownText(firstResult.text);
  let finishReason = firstResult.finishReason;
  let continuationAttempt = 0;

  while (
    finishReason === "length" &&
    continuationAttempt < MAX_ENGLISH_CONTINUATION_ATTEMPTS
  ) {
    continuationAttempt += 1;

    const continuationResult = await requestChatCompletionResult({
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      stepName: `英文正文续写 ${continuationAttempt}`,
      systemPrompt:
        "You are a professional English editor. Output only the English Markdown body continuation.",
      userPrompt: buildEnglishContinuationPrompt({
        originalPrompt: userPrompt,
        generatedContent: enContent,
      }),
      allowLengthFinishReason: true,
    });
    const continuation = cleanMarkdownText(continuationResult.text);

    enContent = appendMarkdownContinuation(enContent, continuation);
    finishReason =
      continuation.length > 0 ? continuationResult.finishReason : null;

    if (!continuation || finishReason !== "length") {
      break;
    }
  }

  if (!enContent) {
    throw createReadableError(
      "英文正文生成失败：模型返回为空",
      "请检查模型输出、额度和第三方接口兼容性",
    );
  }

  if (enContent.length < MIN_REWRITTEN_MARKDOWN_LENGTH) {
    throw createReadableError(
      "英文正文生成失败：返回内容过短",
      `只返回 ${enContent.length} 个字符，可能被模型拒绝或输出异常`,
    );
  }

  return enContent;
}

export async function generateEnglishMetadata(
  input: {
    title: string;
    description: string | null;
    keywords: string | null;
    enContent: string;
    category?: EnglishMetadataCategoryInput | null;
  },
  options: { styleId?: number } = {},
): Promise<EnglishMetadataOutput> {
  const config = await getVerifiedAiConfig("英文 SEO 生成", options);
  const timeoutMs = getAiRewriteTimeoutMs();
  const endpoint = buildOpenAiChatCompletionsEndpoint(config.baseUrl);
  const metadataText = await requestChatCompletion({
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    stepName: "英文 SEO 元信息生成",
    systemPrompt:
      "You only output one valid JSON object. Do not output Markdown, explanations or extra text.",
    userPrompt: buildEnglishMetadataPrompt({
      title: input.title,
      description: input.description,
      keywords: input.keywords,
      enContent: input.enContent,
      category: input.category,
      metadataStylePrompt: config.englishMetadataStylePrompt,
      maxContentLength: getAiRewriteContentLimit(config.maxTokens),
    }),
  });
  const output = normalizeEnglishMetadata(
    parseAiJsonObject<EnglishSeoVersionRawOutput>(
      metadataText,
      "英文 SEO 元信息生成失败",
    ),
    {
      title: input.title,
      description: input.description,
      category: input.category,
    },
  );
  validateEnglishMetadata(output, Boolean(input.category));

  return output;
}

export async function generateEnglishSeoVersion(
  input: {
    title: string;
    description: string | null;
    keywords: string | null;
    htmlContent: string;
  },
  options: { styleId?: number } = {},
): Promise<EnglishSeoVersionOutput> {
  const config = await getVerifiedAiConfig("英文 SEO 生成", options);
  const markdown = contentToArticleMarkdown(input.htmlContent, {
    maxLength: getAiRewriteContentLimit(config.maxTokens),
  });
  const enContent = await generateEnglishArticleContent(
    {
      title: input.title,
      description: input.description,
      keywords: input.keywords,
      markdownContent: markdown.markdown,
    },
    options,
  );
  const metadata = await generateEnglishMetadata(
    {
      title: input.title,
      description: input.description,
      keywords: input.keywords,
      enContent,
    },
    options,
  );

  return {
    ...metadata,
    enContent: removeDuplicatedTitleFromMarkdown(enContent, metadata.enTitle),
  };
}
