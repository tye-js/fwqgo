import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import {
  buildSourceAnchoredRewritePrompt,
  defaultMetadataPrompt,
  interpolatePromptTemplate,
} from "@fwqgo/core/ai-rewrite-prompts";
import { contentToArticleMarkdown } from "@fwqgo/core/content";
import { assertPublicHttpUrl } from "@fwqgo/core/network-url";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";

import {
  AiProviderHttpError,
  buildOpenAiChatCompletionsEndpoint,
  getTransientAiNetworkErrorMessage,
  isTransientAiNetworkError,
  parseAiJsonObject,
} from "./openai-compatible";
import {
  evaluateRewriteQuality,
  getRewriteLengthBudget,
  protectMarkdownContent,
  replaceProtectedMarkdown,
  restoreProtectedMarkdown,
  type ProtectedMarkdownContent,
  type RewriteQualityMetrics,
} from "./rewrite-quality";
import { type ValidatedSeoKeywordPlan } from "./seo-keyword-plan";

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
  "content_generation" | "metadata_generation";

export interface ArticleRewriteProgress {
  stage: ArticleRewriteProgressStage;
  status: "running" | "success" | "retry";
  message: string;
  maxTokens: number;
  attempt?: number;
  maxAttempts?: number;
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
  onRequestStage?: (stage: AiRequestStage) => void | Promise<void>;
}

export type AiRequestStage =
  "request_started" | "response_received" | "checkpointed";

export interface ArticleRewriteOptions extends AiRewriteExecutionOptions {
  sourceTitle?: string | null;
  categoryName?: string | null;
  onProgress?: (progress: ArticleRewriteProgress) => void | Promise<void>;
}

export interface ArticleRewriteQuality extends RewriteQualityMetrics {
  promptVersion: string;
  attempts: number;
  factualScore: number;
  factCheckSkipped?: boolean;
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

export class AiRequestConnectionInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRequestConnectionInterruptedError";
  }
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
    temperature: config.temperature,
    updatedAt: (config.updatedAt ?? config.createdAt)?.toISOString() ?? null,
  };
}

function getPromptVersion(config: AiRewriteConfig) {
  const timestamp = (config.updatedAt ?? config.createdAt)?.getTime() ?? 0;
  return `config-${config.id}-${timestamp}-direct-rewrite-no-fact-check-v3`;
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

function describeRewriteLengthBudget(
  budget: ReturnType<typeof getRewriteLengthBudget>,
) {
  return `来源叙述约 ${budget.sourceNarrativeLength} 字；建议正文叙述不超过 ${budget.targetNarrativeLength} 字，硬上限 ${budget.hardMaxNarrativeLength} 字。表格和链接不计入叙述长度。`;
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

function fillPromptTemplate(template: string, values: Record<string, string>) {
  return interpolatePromptTemplate(template, values);
}

function buildMetadataPrompt(
  markdownContent: string,
  maxContentLength = MAX_METADATA_INPUT_LENGTH,
  configuredPrompt?: string | null,
) {
  const metadataInputLength = Math.min(
    MAX_METADATA_INPUT_LENGTH,
    Math.max(MIN_AI_INPUT_LENGTH, Math.floor(maxContentLength)),
  );

  const template = configuredPrompt?.trim() ?? defaultMetadataPrompt;

  const prompt = fillPromptTemplate(template, {
    metadataStylePrompt: "",
    keywordPlan: "不再单独生成关键词规划，请直接依据正文生成。",
    markdownContent: markdownContent.slice(0, metadataInputLength),
    htmlContent: markdownContent.slice(0, metadataInputLength),
  });
  return prompt;
}

function buildEnglishContentPrompt(input: {
  template: string;
  title: string;
  description: string | null;
  keywords: string | null;
  markdownContent: string;
  maxMarkdownLength: number;
}) {
  return fillPromptTemplate(input.template, {
    englishStylePrompt: "",
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
  maxContentLength?: number;
}) {
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
    englishMetadataStylePrompt: "",
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
    return `${prefix}，请求频率或额度受限，请确认服务商状态后手动重试或更换模型`;
  }

  if (input.status === 402) {
    return `${prefix}，服务商余额不足，请充值后重试或切换备用配置`;
  }

  if (input.status >= 500) {
    return `${prefix}，服务商当前异常，请确认服务商状态后手动重试`;
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
  onRequestStage?: (stage: AiRequestStage) => void | Promise<void>;
}): Promise<ChatCompletionTextResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const endpoint = await assertPublicHttpUrl(input.endpoint, "AI 接口地址");
    await input.onRequestStage?.("request_started");
    const request = async () => {
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
          messages: [{ role: "user", content: input.userPrompt }],
        }),
      });
      const responseText = await readResponseTextWithLimit(
        response,
        MAX_AI_RESPONSE_BYTES,
      );
      await input.onRequestStage?.("response_received");
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
          new AiRequestConnectionInterruptedError(
            `AI 改写请求超时（${Math.round(input.timeoutMs / 1000)}秒）：${input.config.name} / ${input.config.model}，上游可能仍在处理，系统不会自动重试，请先确认服务商侧状态后再手动重试`,
          ),
        );
      }, input.timeoutMs);
    });

    const result = await Promise.race([request(), timeoutPromise]);

    if (!result.response.ok) {
      throw new AiProviderHttpError(
        `${input.stepName}失败：${getAiProviderErrorMessage({
          status: result.response.status,
          statusText: result.response.statusText,
          error: result.data?.error,
        })}`,
        result.response.status,
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
      throw new AiRequestConnectionInterruptedError(
        `AI 改写请求超时（${Math.round(input.timeoutMs / 1000)}秒）：${input.config.name} / ${input.config.model}，上游可能仍在处理，系统不会自动重试；请先确认服务商侧状态后再手动重试或更换模型`,
      );
    }

    if (isTransientAiNetworkError(error)) {
      throw new AiRequestConnectionInterruptedError(
        `${input.stepName}失败：第三方 AI 中转连接中断`,
      );
    }

    if (error instanceof AiRequestConnectionInterruptedError) {
      if (error.message.includes("系统不会自动重试")) {
        throw error;
      }
      throw new AiRequestConnectionInterruptedError(
        `${error.message}；${getTransientAiNetworkErrorMessage({
          configName: input.config.name,
          model: input.config.model,
        })}`,
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
      onRequestStage: input.options.onRequestStage,
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
    await input.options.onRequestStage?.("checkpointed");
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
  const rewriteLengthBudget = getRewriteLengthBudget(normalizedContent, 0);
  const rewriteLengthBudgetDescription =
    describeRewriteLengthBudget(rewriteLengthBudget);
  const candidatePrompt = buildSourceAnchoredRewritePrompt({
    configuredPrompt: config.basePrompt,
    sourceContent: protectedSource,
    rewriteLengthBudget: rewriteLengthBudgetDescription,
    protectedContent: describeProtectedContent(protectedContent),
  });
  const candidateStepName = "原文轻量改写";
  await reportRewriteProgress(options, {
    stage: "content_generation",
    status: "running",
    message: "正在轻量改写正文（固定 1 次）",
    maxTokens: config.maxTokens,
    attempt: 1,
    maxAttempts: 1,
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
  const acceptedMarkdown = restored.markdown;
  let acceptedMetrics = evaluateRewriteQuality(
    normalizedContent,
    acceptedMarkdown,
    {
      allowHighSimilarity: true,
      maxNarrativeLength: rewriteLengthBudget.hardMaxNarrativeLength,
      skipFactChecks: true,
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
    message: "正文轻量改写完成（1/1）",
    maxTokens: config.maxTokens,
    attempt: 1,
    maxAttempts: 1,
    inputLength: candidatePrompt.length,
    outputLength: acceptedMarkdown.length,
  });

  const metadataPrompt = buildMetadataPrompt(
    acceptedMarkdown,
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
    metadata = normalizeMetadata(
      parseAiJsonObject<Partial<ArticleMetadataOutput>>(
        metadataText,
        "AI 元信息生成失败",
      ),
      acceptedMarkdown,
    );
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
      // Keep the historical review fields for task/report compatibility.
      // Historical quality fields remain for task/report compatibility.
      // The simplified pipeline skips both AI and deterministic fact checks.
      passed: acceptedMetrics.passed,
      promptVersion: getPromptVersion(config),
      attempts: 1,
      factualScore: acceptedMetrics.criticalFactCoverage,
      factCheckSkipped: true,
      reviewPassed: true,
      reviewSkipped: true,
      missingFacts: acceptedMetrics.missingCriticalFacts,
      unsupportedClaims: acceptedMetrics.unsupportedCriticalFacts,
      distortedFacts: [],
      knowledgeReferences: [],
      providerReferences: [],
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
