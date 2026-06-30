import { getActiveAiRewriteConfig } from "@/server/ai/rewrite-config";
import {
  defaultBaseRewritePrompt,
  defaultMetadataPrompt,
  defaultMetadataStylePrompt,
} from "@/lib/ai-rewrite-prompts";
import * as cheerio from "cheerio";

const DEFAULT_AI_REWRITE_TIMEOUT_MS = 300_000;
const MIN_AI_INPUT_LENGTH = 80;
const MIN_REWRITTEN_HTML_LENGTH = 120;
const MAX_METADATA_INPUT_LENGTH = 28_000;

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
  htmlContent: string;
  tagsName: string[];
  recommendTagName: string;
}

type ArticleMetadataOutput = Omit<ArticleRewriteOutput, "htmlContent">;

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
    };
  }>;
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

type AiRewriteConfig = NonNullable<Awaited<ReturnType<typeof getActiveAiRewriteConfig>>>;

function createReadableError(message: string, detail?: string) {
  return new Error(detail ? `${message}；原因：${detail}` : message);
}

function cleanJsonText(text: string) {
  return text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonResponse<T>(text: string): T {
  const cleaned = cleanJsonText(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (!match) {
      throw createReadableError(
        "AI 元信息生成失败：返回内容不是 JSON",
        `返回开头：${cleaned.slice(0, 120) || "空"}`,
      );
    }

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      throw createReadableError(
        "AI 元信息生成失败：JSON 格式损坏",
        error instanceof Error ? error.message : "无法解析模型返回值",
      );
    }
  }
}

function stripLegacyJsonInstruction(template: string) {
  return template
    .replace(/\n请严格按照以下 JSON 格式返回[\s\S]*$/i, "")
    .replace(/\n```json[\s\S]*$/i, "")
    .trim();
}

function ensurePromptPlaceholders(template: string) {
  if (template.includes("{content}") || template.includes("{stylePrompt}")) {
    return template;
  }

  return `${template}

改写风格：
{stylePrompt}

原文：
{content}`;
}

function fillPromptPlaceholders(
  template: string,
  values: Record<string, string>,
) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, value),
    template,
  );
}

function buildHtmlRewritePrompt(
  content: string,
  stylePrompt: string,
  basePrompt?: string | null,
) {
  const trimmedBasePrompt = basePrompt?.trim();
  const baseTemplate =
    trimmedBasePrompt && trimmedBasePrompt.length > 0
      ? trimmedBasePrompt
      : defaultBaseRewritePrompt;
  const template = ensurePromptPlaceholders(stripLegacyJsonInstruction(baseTemplate));

  return `${fillPromptPlaceholders(template, { stylePrompt, content })}

输出要求：
1. 本次只输出改写后的正文 HTML 片段。
2. 不要输出标题、摘要、关键词、标签或 JSON。
3. 不要使用 Markdown 代码块，不要添加解释文字。
4. HTML 中的标题从 h2 开始，保留表格、列表、链接和关键配置。`;
}

function buildMetadataPrompt(
  htmlContent: string,
  metadataStylePrompt?: string | null,
  metadataPrompt?: string | null,
) {
  const trimmedMetadataStylePrompt = metadataStylePrompt?.trim();
  const template =
    metadataPrompt?.trim() && metadataPrompt.trim().length > 0
      ? metadataPrompt.trim()
      : defaultMetadataPrompt;

  return fillPromptPlaceholders(
    ensureMetadataPromptPlaceholders(template),
    {
      htmlContent: htmlContent.slice(0, MAX_METADATA_INPUT_LENGTH),
      metadataStylePrompt:
        trimmedMetadataStylePrompt && trimmedMetadataStylePrompt.length > 0
          ? trimmedMetadataStylePrompt
          : defaultMetadataStylePrompt,
    },
  );
}

function ensureMetadataPromptPlaceholders(template: string) {
  if (
    template.includes("{htmlContent}") ||
    template.includes("{metadataStylePrompt}")
  ) {
    return template;
  }

  return `${template}

元信息生成风格：
{metadataStylePrompt}

HTML 正文：
{htmlContent}`;
}

function cleanHtmlText(text: string) {
  return text
    .replace(/^```(?:html)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,，、;；\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeMetadata(
  metadata: Partial<ArticleMetadataOutput>,
  htmlContent: string,
): ArticleMetadataOutput {
  const text = htmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    keywords: normalizeStringArray(metadata.keywords).slice(0, 8),
    tagsName: normalizeStringArray(metadata.tagsName).slice(0, 12),
    recommendTagName:
      typeof metadata.recommendTagName === "string" &&
      metadata.recommendTagName.trim()
        ? metadata.recommendTagName.trim()
        : normalizeStringArray(metadata.tagsName)[0] ?? "",
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

function removeDuplicatedTitleFromHtml(htmlContent: string, title: string) {
  const $ = cheerio.load(htmlContent, null, false);
  const normalizedTitle = normalizeComparableTitle(title);

  if (!normalizedTitle) {
    return $.html();
  }

  const firstElement = $.root().children().first();
  const firstTag = String(firstElement.prop("tagName") ?? "").toLowerCase();

  if (!["h1", "h2", "h3"].includes(firstTag)) {
    return $.html();
  }

  const firstHeadingText = firstElement.text().trim();
  const normalizedHeading = normalizeComparableTitle(firstHeadingText);

  if (
    normalizedHeading === normalizedTitle ||
    normalizedTitle.includes(normalizedHeading) ||
    normalizedHeading.includes(normalizedTitle)
  ) {
    firstElement.remove();
  }

  return $.html();
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

async function requestChatCompletion(input: {
  config: AiRewriteConfig;
  endpoint: string;
  timeoutMs: number;
  maxTokens: number;
  responseFormat?: { type: "json_object" };
  systemPrompt: string;
  userPrompt: string;
  stepName: string;
}) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = async (): Promise<AiRewriteHttpResult> => {
      const response = await fetch(input.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.config.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: input.config.model,
          temperature: input.config.temperature / 100,
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
      const data = (await response.json().catch(() => null)) as
        | ChatCompletionResponse
        | null;

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

    const choice = result.data?.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw createReadableError(
        `${input.stepName}失败：模型输出被截断`,
        "请调大 Max Tokens，或缩短抓取正文/提示词",
      );
    }

    const text = choice?.message?.content;
    if (!text) {
      throw createReadableError(
        `${input.stepName}失败：模型返回为空`,
        "请检查模型名称、额度和第三方接口兼容性",
      );
    }

    return text;
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

export async function rewriteArticleWithAi(
  content: string,
  options: { styleId?: number } = {},
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

  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const htmlContent = cleanHtmlText(
    await requestChatCompletion({
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      stepName: "正文改写",
      systemPrompt:
        "你是专业中文编辑。你只输出正文 HTML 片段，不输出 JSON、Markdown 代码块、解释或额外文本。",
      userPrompt: buildHtmlRewritePrompt(
        normalizedContent,
        config.stylePrompt,
        config.basePrompt,
      ),
    }),
  );

  if (!htmlContent) {
    throw createReadableError(
      "正文改写失败：模型返回为空",
      "请检查模型输出、额度和第三方接口兼容性",
    );
  }

  if (htmlContent.length < MIN_REWRITTEN_HTML_LENGTH) {
    throw createReadableError(
      "正文改写失败：返回内容过短",
      `只返回 ${htmlContent.length} 个字符，可能被模型拒绝或输出异常`,
    );
  }

  const metadataText = await requestChatCompletion({
    config,
    endpoint,
    timeoutMs,
    maxTokens: Math.min(config.maxTokens, 4096),
    responseFormat: { type: "json_object" },
    stepName: "标题/SEO 元信息生成",
    systemPrompt:
      "你只输出符合要求的 JSON 对象，不输出 Markdown、解释或额外文本。",
    userPrompt: buildMetadataPrompt(
      htmlContent,
      config.metadataStylePrompt,
      config.metadataPrompt,
    ),
  });
  const metadata = normalizeMetadata(
    parseJsonResponse<Partial<ArticleMetadataOutput>>(metadataText),
    htmlContent,
  );
  validateMetadata(metadata);

  return {
    ...metadata,
    htmlContent: removeDuplicatedTitleFromHtml(htmlContent, metadata.title),
  };
}
