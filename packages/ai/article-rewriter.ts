import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import {
  buildSourceAnchoredRewritePrompt,
  defaultEnglishMetadataStylePrompt,
  defaultEnglishStylePrompt,
  defaultMetadataPrompt,
  defaultMetadataStylePrompt,
  interpolatePromptTemplate,
} from "@fwqgo/core/ai-rewrite-prompts";
import { contentToArticleMarkdown } from "@fwqgo/core/content";
import { assertPublicHttpUrl } from "@fwqgo/core/network-url";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";

import {
  buildOpenAiChatCompletionsEndpoint,
  getTransientAiNetworkErrorMessage,
  isTransientAiNetworkError,
  parseAiJsonObject,
  retryTransientAiRequest,
} from "./openai-compatible";
import {
  ensureRewriteKnowledgeSections,
  formatRewriteKnowledgeSections,
  formatRewriteKnowledgeContext,
  retrieveRewriteKnowledge,
  selectRewriteKnowledgeSections,
  type RewriteKnowledgeSection,
  type RewriteKnowledgeReference,
} from "./knowledge-retrieval";
import {
  formatRewriteProviderContext,
  retrieveRewriteProviderReferences,
  type RewriteProviderReference,
} from "./provider-context";
import {
  evaluateRewriteQuality,
  getRewriteLengthBudget,
  protectMarkdownContent,
  replaceProtectedMarkdown,
  restoreProtectedMarkdown,
  type ProtectedMarkdownContent,
  type RewriteQualityMetrics,
} from "./rewrite-quality";
import {
  bodySeoKeywordCandidates,
  reconcileSeoKeywords,
  validateSeoKeywordPlan,
  validSeoKeywordCandidates,
  type SeoKeywordPlanRaw,
  type ValidatedSeoKeywordPlan,
} from "./seo-keyword-plan";

const DEFAULT_AI_REWRITE_TIMEOUT_MS = 300_000;
const MIN_AI_INPUT_LENGTH = 80;
const MIN_REWRITTEN_MARKDOWN_LENGTH = 120;
const MAX_METADATA_INPUT_LENGTH = 28_000;
const MAX_ENGLISH_CONTINUATION_ATTEMPTS = 3;
const MAX_AI_RESPONSE_BYTES = 4 * 1024 * 1024;

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
  maxAttempts?: number;
  repairAttempt?: number;
  maxRepairAttempts?: number;
  inputLength?: number;
  outputLength?: number;
}

export type AiRewriteAuditStage =
  | "fact_extraction"
  | "content_generation"
  | "quality_review"
  | "metadata_generation"
  | "english_content_generation"
  | "english_continuation"
  | "english_metadata_generation";

export type AiRewriteAuditStatus = "running" | "success" | "retry" | "failed";

export interface AiRewriteConfigSnapshot {
  id: number;
  name: string;
  provider: string;
  model: string;
  maxTokens: number;
  rewriteMaxAttempts: number;
  temperature: number;
  updatedAt: string | null;
}

export interface AiRewriteAuditEvent {
  stage: AiRewriteAuditStage;
  stageName: string;
  stageAttempt: number;
  status: AiRewriteAuditStatus;
  prompt: string;
  response?: string;
  readableContent?: string;
  error?: string;
  finishReason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  maxTokens: number;
  temperature: number;
  config: AiRewriteConfigSnapshot;
  metadata?: Record<string, unknown>;
}

export interface AiRewriteExecutionOptions {
  styleId?: number;
  onAudit?: (event: AiRewriteAuditEvent) => void | Promise<void>;
}

export interface ArticleRewriteOptions extends AiRewriteExecutionOptions {
  providerNames?: string[];
  sourceTitle?: string | null;
  categoryName?: string | null;
  onProgress?: (progress: ArticleRewriteProgress) => void | Promise<void>;
}

export interface ArticleRewriteQuality extends RewriteQualityMetrics {
  promptVersion: string;
  attempts: number;
  factualScore: number;
  reviewPassed: boolean;
  reviewSkipped?: boolean;
  missingFacts: string[];
  unsupportedClaims: string[];
  distortedFacts: string[];
  seoKeywordPlan?: ValidatedSeoKeywordPlan;
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
  seoKeywordPlan: SeoKeywordPlanRaw;
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
  seoKeywordPlan: ValidatedSeoKeywordPlan;
};

type ArticleQualityReviewRaw = Partial<{
  factualScore: number;
  missingFacts: unknown;
  unsupportedClaims: unknown;
  distortedFacts: unknown;
  issues: unknown;
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
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
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

async function reportRewriteAudit(
  options: AiRewriteExecutionOptions,
  event: AiRewriteAuditEvent,
) {
  await options.onAudit?.(event);
}

function createConfigSnapshot(
  config: AiRewriteConfig,
): AiRewriteConfigSnapshot {
  return {
    id: config.id,
    name: config.name,
    provider: config.provider,
    model: config.model,
    maxTokens: config.maxTokens,
    rewriteMaxAttempts: 1,
    temperature: config.temperature,
    updatedAt: (config.updatedAt ?? config.createdAt)?.toISOString() ?? null,
  };
}

function getPromptVersion(config: AiRewriteConfig) {
  const timestamp = (config.updatedAt ?? config.createdAt)?.getTime() ?? 0;
  return `config-${config.id}-${timestamp}`;
}

function getAuditTemperature(
  config: AiRewriteConfig,
  stage: AiRewriteAuditStage,
) {
  if (stage === "fact_extraction" || stage === "quality_review") {
    return 10;
  }
  if (stage === "content_generation") {
    return Math.round(
      getSourceAnchoredRewriteTemperature(config.temperature) * 100,
    );
  }
  return config.temperature;
}

function normalizeFactText(value: unknown, maxLength = 800) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeFactSheet(
  raw: ArticleFactSheetRaw,
  context: {
    sourceMarkdown: string;
    sourceTitle?: string | null;
    categoryName?: string | null;
  },
): ArticleFactSheet {
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
    seoKeywordPlan: validateSeoKeywordPlan(raw.seoKeywordPlan, {
      sourceMarkdown: context.sourceMarkdown,
      sourceTitle: context.sourceTitle,
      taxonomyTerms: context.categoryName ? [context.categoryName] : [],
    }),
  };
}

function buildFactExtractionPrompt(input: {
  template: string;
  sourceMarkdown: string;
  sourceTitle?: string | null;
  categoryName?: string | null;
}) {
  const normalizedText = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    return normalized;
  };
  const sourceTitle = normalizedText(input.sourceTitle);
  const categoryName = normalizedText(input.categoryName);
  const sourceContext = [
    `来源标题：${sourceTitle ?? "未提供"}`,
    `文章分类：${categoryName ?? "未提供"}`,
  ].join("\n");
  const prompt = fillPromptTemplate(input.template, {
    sourceMarkdown: input.sourceMarkdown,
    sourceContext,
  });

  if (input.template.includes('"seoKeywordPlan"')) return prompt;

  return `${prompt}\n\n必须在原有 JSON 对象中额外输出 seoKeywordPlan，包含 primaryKeyword、secondaryKeywords、longTailKeywords 和 searchIntent。每个关键词对象必须包含 keyword 与 evidence；evidence 每项包含可从来源逐字定位的 text，以及 body、table、title 或 taxonomy provenance。关键词不能作为新事实来源，不得加入来源没有的线路、地区、用途、性能或评价。\n\n${sourceContext}`;
}

function verifiedFactCount(factSheet: ArticleFactSheet) {
  return new Set(
    [
      ...factSheet.criticalFacts,
      ...factSheet.promotions,
      ...factSheet.productGroups,
      ...factSheet.regions,
      ...factSheet.networkFacts,
      ...factSheet.supportedUseCases,
      ...factSheet.cautions,
    ].map((item) => item.trim()),
  ).size;
}

function describeRewriteLengthBudget(
  budget: ReturnType<typeof getRewriteLengthBudget>,
) {
  return `来源叙述约 ${budget.sourceNarrativeLength} 字，已验证事实 ${budget.verifiedFactCount} 条；建议正文叙述不超过 ${budget.targetNarrativeLength} 字，硬上限 ${budget.hardMaxNarrativeLength} 字。表格和链接不计入叙述长度。`;
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
  template: string;
  sourceContent: string;
  factSheet: ArticleFactSheet;
  keywordPlan: ValidatedSeoKeywordPlan;
  rewriteLengthBudget: string;
  protectedContent: ProtectedMarkdownContent;
  providerContext: string;
  knowledgeContext: string;
  markdownContent: string;
}) {
  const prompt = fillPromptTemplate(input.template, {
    sourceContent: input.sourceContent,
    factSheet: JSON.stringify(input.factSheet, null, 2),
    keywordPlan: JSON.stringify(input.keywordPlan, null, 2),
    rewriteLengthBudget: input.rewriteLengthBudget,
    protectedAuthorityContent:
      protectedAuthorityMarkdown(input.protectedContent) || "无",
    providerContext: input.providerContext,
    knowledgeContext: input.knowledgeContext,
    markdownContent: input.markdownContent,
  });

  if (
    input.template.includes("{keywordPlan}") &&
    input.template.includes("{rewriteLengthBudget}")
  ) {
    return prompt;
  }

  return `${prompt}\n\n补充审查上下文：\n关键词规划：${JSON.stringify(input.keywordPlan)}\n长度预算：${input.rewriteLengthBudget}`;
}

function fillPromptTemplate(template: string, values: Record<string, string>) {
  return interpolatePromptTemplate(template, values);
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
  keywordPlan = "未提供关键词规划，请仅依据已通过审查的正文生成。",
) {
  const style = getMetadataStylePrompt(metadataStylePrompt);
  const metadataInputLength = Math.min(
    MAX_METADATA_INPUT_LENGTH,
    Math.max(MIN_AI_INPUT_LENGTH, Math.floor(maxContentLength)),
  );

  const template = configuredPrompt?.trim() ?? defaultMetadataPrompt;

  const prompt = fillPromptTemplate(template, {
    metadataStylePrompt: style,
    keywordPlan,
    markdownContent: markdownContent.slice(0, metadataInputLength),
    htmlContent: markdownContent.slice(0, metadataInputLength),
  });
  return template.includes("{keywordPlan}")
    ? prompt
    : `${prompt}\n\n经过原文证据校验的关键词规划（只能选择正文已覆盖的有效词）：\n${keywordPlan}`;
}

function buildEnglishContentPrompt(input: {
  template: string;
  title: string;
  description: string | null;
  keywords: string | null;
  markdownContent: string;
  stylePrompt: string;
  maxMarkdownLength: number;
}) {
  return fillPromptTemplate(input.template, {
    englishStylePrompt: input.stylePrompt,
    title: input.title,
    description: input.description ?? "",
    keywords: input.keywords ?? "",
    markdownContent: input.markdownContent.slice(0, input.maxMarkdownLength),
  });
}

function buildEnglishContinuationPrompt(input: {
  template: string;
  originalPrompt: string;
  generatedContent: string;
}) {
  return fillPromptTemplate(input.template, {
    originalPrompt: input.originalPrompt,
    generatedContentTail: input.generatedContent.slice(-2_000),
  });
}

function buildEnglishMetadataPrompt(input: {
  template: string;
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
    ? `- Chinese name: ${input.category.name}\n- Source slug: ${input.category.slug}\n- Existing English name: ${input.category.enName ?? ""}\n- Existing English slug: ${input.category.enSlug ?? ""}`
    : "No source category was provided.";

  return fillPromptTemplate(input.template, {
    englishMetadataStylePrompt: style,
    title: input.title,
    description: input.description ?? "",
    keywords: input.keywords ?? "",
    categoryContext,
    enContent: input.enContent.slice(0, metadataInputLength),
  });
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

function normalizeQualityReview(raw: ArticleQualityReviewRaw) {
  const missingFacts = normalizeStringArray(raw.missingFacts).slice(0, 20);
  const unsupportedClaims = normalizeStringArray(
    raw.unsupportedClaims,
  ).slice(0, 20);
  const distortedFacts = normalizeStringArray(raw.distortedFacts).slice(0, 20);

  if (Array.isArray(raw.issues)) {
    for (const item of raw.issues) {
      if (!item || typeof item !== "object") continue;
      const issue = item as Record<string, unknown>;
      const type = normalizeFactText(issue.type ?? issue.kind, 40).toLowerCase();
      const candidateText = normalizeFactText(
        issue.candidateText ?? issue.claim,
        1_200,
      );
      const sourceText = normalizeFactText(
        issue.sourceText ?? issue.correction,
        1_200,
      );
      const reason = normalizeFactText(issue.reason, 600);
      if (type === "missing_fact" && sourceText) {
        missingFacts.push(sourceText);
      } else if (type === "unsupported_claim" && (candidateText || reason)) {
        unsupportedClaims.push(candidateText || reason);
      } else if (type === "distorted_fact" && (candidateText || reason)) {
        distortedFacts.push(candidateText || reason);
      }
    }
  }

  const factualScoreValue = Number(raw.factualScore);
  const factualScore = Number.isFinite(factualScoreValue)
    ? Math.max(0, Math.min(100, Math.round(factualScoreValue)))
    : 0;
  const verdict = normalizeFactText(raw.verdict, 20).toLowerCase();
  const unique = (values: string[]) => [...new Set(values)].slice(0, 20);
  const normalized = {
    factualScore,
    missingFacts: unique(missingFacts),
    unsupportedClaims: unique(unsupportedClaims),
    distortedFacts: unique(distortedFacts),
  };

  return {
    ...normalized,
    passed:
      (verdict === "pass" || verdict === "通过") &&
      factualScore >= 85 &&
      normalized.missingFacts.length === 0 &&
      normalized.unsupportedClaims.length === 0 &&
      normalized.distortedFacts.length === 0,
  } satisfies ArticleQualityReview;
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

  return lines.join("\n").trim() || markdownContent.trim();
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

  if (input.status === 402) {
    return `${prefix}，服务商余额不足，请充值后重试或切换备用配置`;
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
  userPrompt: string;
  stepName: string;
  allowLengthFinishReason?: boolean;
}): Promise<ChatCompletionTextResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = () =>
      retryTransientAiRequest<AiRewriteHttpResult>(
        async () => {
          const endpoint = await assertPublicHttpUrl(
            input.endpoint,
            "AI 接口地址",
          );
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
              temperature:
                input.temperature ?? input.config.temperature / 100,
              max_tokens: input.maxTokens,
              ...(input.responseFormat
                ? { response_format: input.responseFormat }
                : {}),
              messages: [{ role: "user", content: input.userPrompt }],
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
        },
        { signal: controller.signal },
      );

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
    const promptTokens =
      typeof result.data?.usage?.prompt_tokens === "number"
        ? result.data.usage.prompt_tokens
        : null;
    const totalTokens =
      typeof result.data?.usage?.total_tokens === "number"
        ? result.data.usage.total_tokens
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
      promptTokens,
      completionTokens,
      totalTokens,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `AI 改写请求超时（${Math.round(input.timeoutMs / 1000)}秒）：${input.config.name} / ${input.config.model}，请稍后重试或换一个改写模型`,
      );
    }

    if (isTransientAiNetworkError(error)) {
      throw createReadableError(
        `${input.stepName}失败：第三方 AI 中转连接中断`,
        getTransientAiNetworkErrorMessage({
          configName: input.config.name,
          model: input.config.model,
        }),
      );
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function requestAuditedChatCompletion(input: {
  options: AiRewriteExecutionOptions;
  config: AiRewriteConfig;
  endpoint: string;
  timeoutMs: number;
  maxTokens: number;
  responseFormat?: { type: "json_object" };
  temperature?: number;
  userPrompt: string;
  stepName: string;
  stage: AiRewriteAuditStage;
  stageAttempt?: number;
  allowLengthFinishReason?: boolean;
}) {
  const stageAttempt = Math.max(1, Math.trunc(input.stageAttempt ?? 1));
  const temperature = input.temperature ?? input.config.temperature / 100;
  const baseEvent = {
    stage: input.stage,
    stageName: input.stepName,
    stageAttempt,
    prompt: input.userPrompt,
    maxTokens: input.maxTokens,
    temperature: Math.round(temperature * 100),
    config: createConfigSnapshot(input.config),
  } satisfies Omit<AiRewriteAuditEvent, "status">;

  await reportRewriteAudit(input.options, {
    ...baseEvent,
    status: "running",
  });

  try {
    const result = await requestChatCompletionResult({
      config: input.config,
      endpoint: input.endpoint,
      timeoutMs: input.timeoutMs,
      maxTokens: input.maxTokens,
      responseFormat: input.responseFormat,
      temperature,
      userPrompt: input.userPrompt,
      stepName: input.stepName,
      allowLengthFinishReason: input.allowLengthFinishReason,
    });
    await reportRewriteAudit(input.options, {
      ...baseEvent,
      status: "success",
      response: result.text,
      finishReason: result.finishReason,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
    });
    return result;
  } catch (error) {
    await reportRewriteAudit(input.options, {
      ...baseEvent,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function updateRewriteAudit(
  options: AiRewriteExecutionOptions,
  config: AiRewriteConfig,
  input: Omit<AiRewriteAuditEvent, "config" | "maxTokens" | "temperature">,
) {
  await reportRewriteAudit(options, {
    ...input,
    maxTokens: config.maxTokens,
    temperature: getAuditTemperature(config, input.stage),
    config: createConfigSnapshot(config),
  });
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
  const factExtractionSource = `${protectedSource}\n\n受保护原始内容：\n${
      protectedAuthorityMarkdown(protectedContent) || "无"
    }`;
  const factExtractionPrompt = buildFactExtractionPrompt({
    template: config.factExtractionPrompt,
    sourceMarkdown: factExtractionSource,
    sourceTitle: options.sourceTitle,
    categoryName: options.categoryName,
  });
  await reportRewriteProgress(options, {
    stage: "fact_extraction",
    status: "running",
    message: "正在提取来源事实",
    maxTokens: config.maxTokens,
    inputLength: factExtractionPrompt.length,
  });
  const factExtractionResult = await requestAuditedChatCompletion({
    options,
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    temperature: 0.1,
    stepName: "来源事实提取",
    stage: "fact_extraction",
    userPrompt: factExtractionPrompt,
  });
  const factExtractionText = factExtractionResult.text;
  await reportRewriteProgress(options, {
    stage: "fact_extraction",
    status: "success",
    message: "来源事实提取完成",
    maxTokens: config.maxTokens,
    inputLength: factExtractionPrompt.length,
    outputLength: factExtractionText.length,
  });
  let factSheet: ArticleFactSheet;
  try {
    factSheet = normalizeFactSheet(
      parseAiJsonObject<ArticleFactSheetRaw>(
        factExtractionText,
        "来源事实提取失败",
      ),
      {
        sourceMarkdown: normalizedContent,
        sourceTitle: options.sourceTitle,
        categoryName: options.categoryName,
      },
    );
  } catch (error) {
    await updateRewriteAudit(options, config, {
      stage: "fact_extraction",
      stageName: "来源事实提取",
      stageAttempt: 1,
      status: "failed",
      prompt: factExtractionPrompt,
      response: factExtractionText,
      error: error instanceof Error ? error.message : String(error),
      finishReason: factExtractionResult.finishReason,
      promptTokens: factExtractionResult.promptTokens,
      completionTokens: factExtractionResult.completionTokens,
      totalTokens: factExtractionResult.totalTokens,
    });
    throw error;
  }
  await updateRewriteAudit(options, config, {
    stage: "fact_extraction",
    stageName: "来源事实提取",
    stageAttempt: 1,
    status: "success",
    prompt: factExtractionPrompt,
    response: factExtractionText,
    readableContent: JSON.stringify(factSheet, null, 2),
    finishReason: factExtractionResult.finishReason,
    promptTokens: factExtractionResult.promptTokens,
    completionTokens: factExtractionResult.completionTokens,
    totalTokens: factExtractionResult.totalTokens,
    metadata: {
      criticalFactCount: factSheet.criticalFacts.length,
      outlineCount: factSheet.outline.length,
      acceptedKeywordCount: validSeoKeywordCandidates(
        factSheet.seoKeywordPlan,
      ).length,
      rejectedKeywords: factSheet.seoKeywordPlan.rejectedKeywords,
    },
  });
  if (!factSheet.factualSummary && factSheet.criticalFacts.length === 0) {
    const error = createReadableError(
      "来源事实提取失败：事实包为空",
      "请检查来源正文是否包含可识别的服务器、套餐或活动信息",
    );
    await updateRewriteAudit(options, config, {
      stage: "fact_extraction",
      stageName: "来源事实提取",
      stageAttempt: 1,
      status: "failed",
      prompt: factExtractionPrompt,
      response: factExtractionText,
      readableContent: JSON.stringify(factSheet, null, 2),
      error: error.message,
      finishReason: factExtractionResult.finishReason,
      promptTokens: factExtractionResult.promptTokens,
      completionTokens: factExtractionResult.completionTokens,
      totalTokens: factExtractionResult.totalTokens,
    });
    throw error;
  }

  let knowledgeReferences: RewriteKnowledgeReference[] = [];
  let knowledgeSections: RewriteKnowledgeSection[] = [];
  let providerReferences: RewriteProviderReference[] = [];
  const [knowledgeResult, providerResult] = await Promise.allSettled([
    retrieveRewriteKnowledge({
      language: "zh",
      values: [
        normalizedContent,
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
  knowledgeSections = selectRewriteKnowledgeSections(
    normalizedContent,
    knowledgeReferences,
  );
  const knowledgeContext = formatRewriteKnowledgeContext(knowledgeReferences);
  const knowledgeSectionRequirements = formatRewriteKnowledgeSections(
    knowledgeSections,
  );
  const providerContext = formatRewriteProviderContext(providerReferences);
  const allowedProviderFacts =
    providerReferences.length > 0 ? providerContext : "";
  const rewriteLengthBudget = getRewriteLengthBudget(
    normalizedContent,
    verifiedFactCount(factSheet),
  );
  const rewriteLengthBudgetDescription =
    describeRewriteLengthBudget(rewriteLengthBudget);
  const keywordPlanForWriting = {
    searchIntent: factSheet.seoKeywordPlan.searchIntent,
    keywords: bodySeoKeywordCandidates(factSheet.seoKeywordPlan),
  };
  const rewriteOutline =
    factSheet.outline.length > 0
      ? factSheet.outline.map((item) => `- ${item}`).join("\n")
      : "来源内容较短，请按原文主题自然扩写，不必强行增加小节。";
  const candidatePrompt = buildSourceAnchoredRewritePrompt({
    configuredPrompt: config.basePrompt,
    stylePrompt: config.stylePrompt,
    sourceContent: protectedSource,
    factSheet: JSON.stringify(factSheet, null, 2),
    keywordPlan: JSON.stringify(keywordPlanForWriting, null, 2),
    rewriteLengthBudget: rewriteLengthBudgetDescription,
    outline: rewriteOutline,
    providerContext,
    knowledgeContext,
    knowledgeSections: knowledgeSectionRequirements,
    protectedContent: describeProtectedContent(protectedContent),
    retryFeedback: config.initialRewritePrompt,
  });
  const candidateStepName = "原文锚定正文扩写";
  await reportRewriteProgress(options, {
    stage: "content_generation",
    status: "running",
    message: "正在生成正文（固定 1 次）",
    maxTokens: config.maxTokens,
    attempt: 1,
    maxAttempts: 1,
    repairAttempt: 0,
    maxRepairAttempts: 0,
    inputLength: candidatePrompt.length,
  });
  const candidateResult = await requestAuditedChatCompletion({
    options,
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    temperature: getSourceAnchoredRewriteTemperature(config.temperature),
    stepName: candidateStepName,
    stage: "content_generation",
    stageAttempt: 1,
    userPrompt: candidatePrompt,
  });
  const candidateText = candidateResult.text;
  const candidate = cleanMarkdownText(candidateText);

  if (!candidate || candidate.length < MIN_REWRITTEN_MARKDOWN_LENGTH) {
    const outputIssue = candidate
      ? `正文只有 ${candidate.length} 个字符，内容不完整`
      : "模型返回空正文";
    await updateRewriteAudit(options, config, {
      stage: "content_generation",
      stageName: candidateStepName,
      stageAttempt: 1,
      status: "failed",
      prompt: candidatePrompt,
      response: candidateText,
      readableContent: candidate,
      error: outputIssue,
      finishReason: candidateResult.finishReason,
      promptTokens: candidateResult.promptTokens,
      completionTokens: candidateResult.completionTokens,
      totalTokens: candidateResult.totalTokens,
      metadata: { accepted: false, maxAttempts: 1, outputIssue },
    });
    throw createReadableError("正文改写失败", outputIssue);
  }

  const restored = restoreProtectedMarkdown(candidate, protectedContent);
  const acceptedMarkdown = ensureRewriteKnowledgeSections(
    restored.markdown,
    knowledgeSections,
  );
  let acceptedMetrics = evaluateRewriteQuality(
    normalizedContent,
    acceptedMarkdown,
    {
      allowedFactsMarkdown: allowedProviderFacts,
      maxNarrativeLength: rewriteLengthBudget.hardMaxNarrativeLength,
    },
  );
  if (restored.missingPlaceholders.length > 0) {
    const integrityError = `受保护内容缺失或重复：${restored.missingPlaceholders.join("、")}`;
    acceptedMetrics = {
      ...acceptedMetrics,
      passed: false,
      reasons: [...acceptedMetrics.reasons, integrityError],
    };
    await updateRewriteAudit(options, config, {
      stage: "content_generation",
      stageName: candidateStepName,
      stageAttempt: 1,
      status: "failed",
      prompt: candidatePrompt,
      response: candidateText,
      readableContent: acceptedMarkdown,
      error: integrityError,
      finishReason: candidateResult.finishReason,
      promptTokens: candidateResult.promptTokens,
      completionTokens: candidateResult.completionTokens,
      totalTokens: candidateResult.totalTokens,
      metadata: {
        accepted: false,
        maxAttempts: 1,
        deterministicMetrics: acceptedMetrics,
        missingPlaceholders: restored.missingPlaceholders,
      },
    });
    throw createReadableError("正文改写失败", integrityError);
  }

  await updateRewriteAudit(options, config, {
    stage: "content_generation",
    stageName: candidateStepName,
    stageAttempt: 1,
    status: "success",
    prompt: candidatePrompt,
    response: candidateText,
    readableContent: acceptedMarkdown,
    finishReason: candidateResult.finishReason,
    promptTokens: candidateResult.promptTokens,
    completionTokens: candidateResult.completionTokens,
    totalTokens: candidateResult.totalTokens,
    metadata: {
      accepted: true,
      maxAttempts: 1,
      deterministicMetrics: acceptedMetrics,
      missingPlaceholders: [],
    },
  });
  await reportRewriteProgress(options, {
    stage: "content_generation",
    status: "success",
    message: "正文生成完成（1/1）",
    maxTokens: config.maxTokens,
    attempt: 1,
    maxAttempts: 1,
    repairAttempt: 0,
    maxRepairAttempts: 0,
    inputLength: candidatePrompt.length,
    outputLength: acceptedMarkdown.length,
  });

  const reviewPrompt = buildQualityReviewPrompt({
    template: config.qualityReviewPrompt,
    sourceContent: protectedSource,
    factSheet,
    keywordPlan: factSheet.seoKeywordPlan,
    rewriteLengthBudget: rewriteLengthBudgetDescription,
    protectedContent,
    providerContext,
    knowledgeContext,
    markdownContent: acceptedMarkdown,
  });
  let qualityReview: ArticleQualityReview = {
    factualScore: 0,
    missingFacts: [],
    unsupportedClaims: [],
    distortedFacts: [],
    passed: false,
  };
  let reviewSkipped = false;
  await reportRewriteProgress(options, {
    stage: "quality_review",
    status: "running",
    message: "正在执行质量审查（固定 1 次）",
    maxTokens: config.maxTokens,
    attempt: 1,
    maxAttempts: 1,
    inputLength: reviewPrompt.length,
    outputLength: acceptedMarkdown.length,
  });
  try {
    const reviewResult = await requestAuditedChatCompletion({
      options,
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      stepName: "正文质量审查（1/1）",
      stage: "quality_review",
      stageAttempt: 1,
      userPrompt: reviewPrompt,
    });
    qualityReview = normalizeQualityReview(
      parseAiJsonObject<ArticleQualityReviewRaw>(
        reviewResult.text,
        "正文质量审查失败",
      ),
    );
    await updateRewriteAudit(options, config, {
      stage: "quality_review",
      stageName: "正文质量审查（1/1）",
      stageAttempt: 1,
      status: "success",
      prompt: reviewPrompt,
      response: reviewResult.text,
      readableContent: JSON.stringify(qualityReview, null, 2),
      finishReason: reviewResult.finishReason,
      promptTokens: reviewResult.promptTokens,
      completionTokens: reviewResult.completionTokens,
      totalTokens: reviewResult.totalTokens,
      metadata: { accepted: qualityReview.passed, review: qualityReview },
    });
    await reportRewriteProgress(options, {
      stage: "quality_review",
      status: "success",
      message: qualityReview.passed
        ? "质量审查通过（1/1）"
        : "质量审查完成，问题已记录（1/1）",
      maxTokens: config.maxTokens,
      attempt: 1,
      maxAttempts: 1,
      inputLength: reviewPrompt.length,
      outputLength: reviewResult.text.length,
    });
  } catch (error) {
    reviewSkipped = true;
    const message = error instanceof Error ? error.message : String(error);
    await updateRewriteAudit(options, config, {
      stage: "quality_review",
      stageName: "正文质量审查（1/1）",
      stageAttempt: 1,
      status: "failed",
      prompt: reviewPrompt,
      error: message,
      metadata: { accepted: false, nonBlocking: true },
    });
    await reportRewriteProgress(options, {
      stage: "quality_review",
      status: "success",
      message: "质量审查调用失败，已记录并继续（1/1）",
      maxTokens: config.maxTokens,
      attempt: 1,
      maxAttempts: 1,
      inputLength: reviewPrompt.length,
    });
  }

  const metadataPrompt = buildMetadataPrompt(
    acceptedMarkdown,
    config.metadataStylePrompt,
    getAiRewriteContentLimit(config.maxTokens),
    config.metadataPrompt,
    JSON.stringify(factSheet.seoKeywordPlan, null, 2),
  );
  await reportRewriteProgress(options, {
    stage: "metadata_generation",
    status: "running",
    message: "正在生成标题与 SEO 元信息",
    maxTokens: config.maxTokens,
    inputLength: metadataPrompt.length,
  });
  const metadataResult = await requestAuditedChatCompletion({
    options,
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    stepName: "标题/SEO 元信息生成",
    stage: "metadata_generation",
    userPrompt: metadataPrompt,
  });
  const metadataText = metadataResult.text;
  let metadata: ArticleMetadataOutput;
  try {
    const normalizedMetadata = normalizeMetadata(
      parseAiJsonObject<Partial<ArticleMetadataOutput>>(
        metadataText,
        "AI 元信息生成失败",
      ),
      acceptedMarkdown,
    );
    metadata = {
      ...normalizedMetadata,
      keywords: reconcileSeoKeywords({
        generatedKeywords: normalizedMetadata.keywords,
        plan: factSheet.seoKeywordPlan,
        acceptedMarkdown,
      }),
    };
    validateMetadata(metadata);
  } catch (error) {
    await updateRewriteAudit(options, config, {
      stage: "metadata_generation",
      stageName: "标题/SEO 元信息生成",
      stageAttempt: 1,
      status: "failed",
      prompt: metadataPrompt,
      response: metadataText,
      error: error instanceof Error ? error.message : String(error),
      finishReason: metadataResult.finishReason,
      promptTokens: metadataResult.promptTokens,
      completionTokens: metadataResult.completionTokens,
      totalTokens: metadataResult.totalTokens,
    });
    throw error;
  }
  await updateRewriteAudit(options, config, {
    stage: "metadata_generation",
    stageName: "标题/SEO 元信息生成",
    stageAttempt: 1,
    status: "success",
    prompt: metadataPrompt,
    response: metadataText,
    readableContent: JSON.stringify(metadata, null, 2),
    finishReason: metadataResult.finishReason,
    promptTokens: metadataResult.promptTokens,
    completionTokens: metadataResult.completionTokens,
    totalTokens: metadataResult.totalTokens,
  });
  await reportRewriteProgress(options, {
    stage: "metadata_generation",
    status: "success",
    message: "标题与 SEO 元信息生成完成",
    maxTokens: config.maxTokens,
    inputLength: metadataPrompt.length,
    outputLength: metadataText.length,
  });

  const finalMarkdown = removeDuplicatedTitleFromMarkdown(
    acceptedMarkdown,
    metadata.title,
  );

  return {
    ...metadata,
    // Removing a duplicated heading must never turn a valid rewrite into an empty draft.
    markdownContent: finalMarkdown || acceptedMarkdown,
    quality: {
      ...acceptedMetrics,
      passed: acceptedMetrics.passed && qualityReview.passed,
      promptVersion: getPromptVersion(config),
      attempts: 1,
      factualScore: qualityReview.factualScore,
      reviewPassed: qualityReview.passed,
      reviewSkipped,
      missingFacts: qualityReview.missingFacts,
      unsupportedClaims: qualityReview.unsupportedClaims,
      distortedFacts: qualityReview.distortedFacts,
      seoKeywordPlan: factSheet.seoKeywordPlan,
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
  options: AiRewriteExecutionOptions = {},
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
  const userPrompt = buildMetadataPrompt(
    normalizedContent,
    config.metadataStylePrompt,
    getAiRewriteContentLimit(config.maxTokens),
    config.metadataPrompt,
  );
  const metadataResult = await requestAuditedChatCompletion({
    options,
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    stepName: "中文 SEO 元信息生成",
    stage: "metadata_generation",
    userPrompt,
  });
  const metadataText = metadataResult.text;
  let metadata: ArticleMetadataOutput;
  try {
    metadata = normalizeMetadata(
      parseAiJsonObject<Partial<ArticleMetadataOutput>>(
        metadataText,
        "AI 元信息生成失败",
      ),
      normalizedContent,
    );
    validateMetadata(metadata);
  } catch (error) {
    await updateRewriteAudit(options, config, {
      stage: "metadata_generation",
      stageName: "中文 SEO 元信息生成",
      stageAttempt: 1,
      status: "failed",
      prompt: userPrompt,
      response: metadataText,
      error: error instanceof Error ? error.message : String(error),
      finishReason: metadataResult.finishReason,
      promptTokens: metadataResult.promptTokens,
      completionTokens: metadataResult.completionTokens,
      totalTokens: metadataResult.totalTokens,
    });
    throw error;
  }
  await updateRewriteAudit(options, config, {
    stage: "metadata_generation",
    stageName: "中文 SEO 元信息生成",
    stageAttempt: 1,
    status: "success",
    prompt: userPrompt,
    response: metadataText,
    readableContent: JSON.stringify(metadata, null, 2),
    finishReason: metadataResult.finishReason,
    promptTokens: metadataResult.promptTokens,
    completionTokens: metadataResult.completionTokens,
    totalTokens: metadataResult.totalTokens,
  });

  return metadata;
}

async function getVerifiedAiConfig(
  purpose: string,
  options: AiRewriteExecutionOptions = {},
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
  options: AiRewriteExecutionOptions = {},
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
    template: config.englishContentPrompt,
    ...input,
    markdownContent: normalizedContent,
    stylePrompt: getEnglishStylePrompt(config.englishStylePrompt),
    maxMarkdownLength: contentLimit,
  });
  const firstResult = await requestAuditedChatCompletion({
    options,
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    stepName: "英文正文生成",
    stage: "english_content_generation",
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

    const continuationPrompt = buildEnglishContinuationPrompt({
      template: config.englishContinuationPrompt,
      originalPrompt: userPrompt,
      generatedContent: enContent,
    });
    const continuationResult = await requestAuditedChatCompletion({
      options,
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      stepName: `英文正文续写 ${continuationAttempt}`,
      stage: "english_continuation",
      stageAttempt: continuationAttempt,
      userPrompt: continuationPrompt,
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
    const error = createReadableError(
      "英文正文生成失败：模型返回为空",
      "请检查模型输出、额度和第三方接口兼容性",
    );
    await updateRewriteAudit(options, config, {
      stage: "english_content_generation",
      stageName: "英文正文生成",
      stageAttempt: 1,
      status: "failed",
      prompt: userPrompt,
      response: firstResult.text,
      readableContent: enContent,
      error: error.message,
      finishReason: firstResult.finishReason,
      promptTokens: firstResult.promptTokens,
      completionTokens: firstResult.completionTokens,
      totalTokens: firstResult.totalTokens,
    });
    throw error;
  }

  if (enContent.length < MIN_REWRITTEN_MARKDOWN_LENGTH) {
    const error = createReadableError(
      "英文正文生成失败：返回内容过短",
      `只返回 ${enContent.length} 个字符，可能被模型拒绝或输出异常`,
    );
    await updateRewriteAudit(options, config, {
      stage: "english_content_generation",
      stageName: "英文正文生成",
      stageAttempt: 1,
      status: "failed",
      prompt: userPrompt,
      response: firstResult.text,
      readableContent: enContent,
      error: error.message,
      finishReason: firstResult.finishReason,
      promptTokens: firstResult.promptTokens,
      completionTokens: firstResult.completionTokens,
      totalTokens: firstResult.totalTokens,
      metadata: { continuationAttempts: continuationAttempt },
    });
    throw error;
  }

  await updateRewriteAudit(options, config, {
    stage: "english_content_generation",
    stageName: "英文正文生成",
    stageAttempt: 1,
    status: "success",
    prompt: userPrompt,
    response: firstResult.text,
    readableContent: enContent,
    finishReason,
    promptTokens: firstResult.promptTokens,
    completionTokens: firstResult.completionTokens,
    totalTokens: firstResult.totalTokens,
    metadata: { continuationAttempts: continuationAttempt },
  });

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
  options: AiRewriteExecutionOptions = {},
): Promise<EnglishMetadataOutput> {
  const config = await getVerifiedAiConfig("英文 SEO 生成", options);
  const timeoutMs = getAiRewriteTimeoutMs();
  const endpoint = buildOpenAiChatCompletionsEndpoint(config.baseUrl);
  const userPrompt = buildEnglishMetadataPrompt({
    template: config.englishMetadataPrompt,
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    enContent: input.enContent,
    category: input.category,
    metadataStylePrompt: config.englishMetadataStylePrompt,
    maxContentLength: getAiRewriteContentLimit(config.maxTokens),
  });
  const metadataResult = await requestAuditedChatCompletion({
    options,
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    stepName: "英文 SEO 元信息生成",
    stage: "english_metadata_generation",
    userPrompt,
  });
  const metadataText = metadataResult.text;
  let output: EnglishMetadataOutput;
  try {
    output = normalizeEnglishMetadata(
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
  } catch (error) {
    await updateRewriteAudit(options, config, {
      stage: "english_metadata_generation",
      stageName: "英文 SEO 元信息生成",
      stageAttempt: 1,
      status: "failed",
      prompt: userPrompt,
      response: metadataText,
      error: error instanceof Error ? error.message : String(error),
      finishReason: metadataResult.finishReason,
      promptTokens: metadataResult.promptTokens,
      completionTokens: metadataResult.completionTokens,
      totalTokens: metadataResult.totalTokens,
    });
    throw error;
  }
  await updateRewriteAudit(options, config, {
    stage: "english_metadata_generation",
    stageName: "英文 SEO 元信息生成",
    stageAttempt: 1,
    status: "success",
    prompt: userPrompt,
    response: metadataText,
    readableContent: JSON.stringify(output, null, 2),
    finishReason: metadataResult.finishReason,
    promptTokens: metadataResult.promptTokens,
    completionTokens: metadataResult.completionTokens,
    totalTokens: metadataResult.totalTokens,
  });

  return output;
}

export async function generateEnglishSeoVersion(
  input: {
    title: string;
    description: string | null;
    keywords: string | null;
    htmlContent: string;
  },
  options: AiRewriteExecutionOptions = {},
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
