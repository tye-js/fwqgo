import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import {
  defaultMetadataStylePrompt,
} from "@fwqgo/core/ai-rewrite-prompts";
import * as cheerio from "cheerio";

const DEFAULT_AI_REWRITE_TIMEOUT_MS = 300_000;
const MIN_AI_INPUT_LENGTH = 80;
const MIN_REWRITTEN_HTML_LENGTH = 120;
const MAX_METADATA_INPUT_LENGTH = 28_000;
const MAX_ENGLISH_CONTENT_INPUT_LENGTH = 22_000;

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

export interface EnglishSeoVersionOutput {
  enTitle: string;
  enSlug: string;
  enDescription: string;
  enKeywords: string[];
  enContent: string;
}

type ArticleMetadataOutput = Omit<ArticleRewriteOutput, "htmlContent">;

type EnglishSeoVersionRawOutput = Partial<{
  enTitle: string;
  enSlug: string;
  enDescription: string;
  enKeywords: unknown;
  enContent: string;
}>;

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

function buildHtmlRewritePrompt(
  content: string,
  stylePrompt: string,
) {
  return `你是一个专业的服务器/VPS 推广文章中文编辑。请把清洗后的原文改写成更适合发布的中文正文 HTML。

正文改写风格：
${stylePrompt}

硬性规则：
1. 只输出改写后的正文 HTML 片段，不要输出标题、摘要、关键词、标签、JSON、Markdown 代码块、解释或额外文本。
2. HTML 中的标题从 h2 开始，第一段不需要标题。
3. 保留表格、列表、链接、商家名、价格、CPU、内存、存储、流量、地区、线路、优惠码、库存、购买链接等事实信息。
4. 可以优化段落顺序、表达和小标题，但不要编造原文没有的价格、配置、优惠码、库存、线路或商家承诺。
5. 如果有官网、优惠码、套餐表格、网络线路、适用场景等信息，尽量清晰分段展示。

清洗后的原文 HTML：
${content}`;
}

function getMetadataStylePrompt(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultMetadataStylePrompt;
}

function buildMetadataPrompt(
  htmlContent: string,
  metadataStylePrompt?: string | null,
) {
  const style = getMetadataStylePrompt(metadataStylePrompt);

  return `你是服务器/VPS 推广文章的 SEO 编辑。请根据已改写的中文 HTML 正文生成文章元信息。

输出要求：
1. 只输出 JSON 对象，不要输出 Markdown、解释或额外文本。
2. title 要偏 SEO 长尾词，尽量包含商家、价格、配置、线路或适用场景；原文没有的信息不要编造。
3. description 控制在 120 字以内，准确概括商家、价格、配置、线路和适用场景。
4. keywords 生成 5 个适合 SEO 的关键词。
5. tagsName 生成 8 到 10 个相关标签，第一个标签优先为商家名，其余是长尾 SEO 关键词。
6. recommendTagName 是商家名；无法判断商家名时使用最核心的服务商品牌词。

标题 / SEO 生成风格：
${style}

JSON 格式：
{
  "title": "文章标题",
  "description": "120字以内的文章摘要",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "tagsName": ["标签1", "标签2"],
  "recommendTagName": "推荐标签"
}

已改写的 HTML 正文：
${htmlContent.slice(0, MAX_METADATA_INPUT_LENGTH)}`;
}

function buildEnglishContentPrompt(input: {
  title: string;
  description: string | null;
  keywords: string | null;
  htmlContent: string;
  stylePrompt: string;
}) {
  return `You are an English editor for a VPS/server deals website.

Translate and localize the Chinese hosting deal article into English HTML content.

Writing style:
${input.stylePrompt}

Requirements:
1. Output only the translated/localized English HTML body fragment.
2. Do not output JSON, Markdown code fences, explanations, title, meta description or keywords.
3. Preserve the HTML structure where useful. Use headings starting from h2.
4. Preserve factual details: provider names, prices, CPU, RAM, storage, bandwidth, locations, routes, promo codes, coupons and URLs.
5. Do not invent missing specs, prices, discounts, stock status or claims.
6. Keep affiliate links and short links unchanged.

Chinese title:
${input.title}

Chinese description:
${input.description ?? ""}

Chinese keywords:
${input.keywords ?? ""}

Chinese HTML:
${input.htmlContent.slice(0, MAX_ENGLISH_CONTENT_INPUT_LENGTH)}`;
}

function buildEnglishMetadataPrompt(input: {
  title: string;
  description: string | null;
  keywords: string | null;
  enContent: string;
  metadataStylePrompt?: string | null;
}) {
  const style = getMetadataStylePrompt(input.metadataStylePrompt);

  return `You are an SEO editor for an English VPS/server deals website.

Generate English SEO metadata from the translated English HTML body.

Requirements:
1. Return only a valid JSON object.
2. Do not use Markdown code fences or explanations.
3. enTitle should be an English SEO title.
4. enSlug must be short, lowercase, ASCII only, words separated by hyphens.
5. enDescription should be within 160 characters.
6. enKeywords should contain 5 to 10 English SEO keywords.
7. Do not invent missing specs, prices, discounts or claims.

SEO style:
${style}

JSON shape:
{
  "enTitle": "English SEO title",
  "enSlug": "english-seo-slug",
  "enDescription": "English meta description, within 160 characters",
  "enKeywords": ["keyword 1", "keyword 2"]
}

Original Chinese title:
${input.title}

Original Chinese description:
${input.description ?? ""}

Original Chinese keywords:
${input.keywords ?? ""}

English HTML:
${input.enContent.slice(0, MAX_METADATA_INPUT_LENGTH)}`;
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

function normalizeEnglishSeoVersion(
  raw: EnglishSeoVersionRawOutput,
  fallback: {
    title: string;
    description: string | null;
    htmlContent: string;
  },
): EnglishSeoVersionOutput {
  const enTitle =
    typeof raw.enTitle === "string" && raw.enTitle.trim()
      ? raw.enTitle.trim()
      : fallback.title;
  const enContent =
    typeof raw.enContent === "string" && raw.enContent.trim()
      ? cleanHtmlText(raw.enContent)
      : fallback.htmlContent;
  const enDescription =
    typeof raw.enDescription === "string" && raw.enDescription.trim()
      ? raw.enDescription.trim().slice(0, 180)
      : (fallback.description ?? enTitle).slice(0, 180);

  return {
    enTitle,
    enSlug: normalizeEnglishSlug(
      typeof raw.enSlug === "string" ? raw.enSlug : "",
      enTitle,
    ),
    enDescription,
    enKeywords: normalizeStringArray(raw.enKeywords).slice(0, 10),
    enContent: removeDuplicatedTitleFromHtml(enContent, enTitle),
  };
}

function validateEnglishSeoVersion(output: EnglishSeoVersionOutput) {
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

  if (output.enContent.length < MIN_REWRITTEN_HTML_LENGTH) {
    issues.push("英文正文过短");
  }

  if (issues.length > 0) {
    throw createReadableError("英文 SEO 版本生成失败：返回字段不完整", issues.join("、"));
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

export async function generateEnglishSeoVersion(
  input: {
    title: string;
    description: string | null;
    keywords: string | null;
    htmlContent: string;
  },
  options: { styleId?: number } = {},
): Promise<EnglishSeoVersionOutput> {
  const config = await getActiveAiRewriteConfig(options.styleId);
  const timeoutMs = getAiRewriteTimeoutMs();

  if (!config) {
    throw createReadableError(
      "英文 SEO 生成未启用",
      "请先在后台「内容生产 - 改写接口配置」启用一套默认配置",
    );
  }

  if (!config.apiKey) {
    throw createReadableError(
      "AI 改写配置不完整",
      `「${config.name}」缺少 API Key`,
    );
  }

  const normalizedContent = input.htmlContent.trim();
  if (normalizedContent.length < MIN_AI_INPUT_LENGTH) {
    throw createReadableError(
      "英文 SEO 生成输入过短",
      `中文正文只有 ${normalizedContent.length} 个字符`,
    );
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const enContent = cleanHtmlText(
    await requestChatCompletion({
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      stepName: "英文正文生成",
      systemPrompt:
        "You are a professional English editor. Output only the English HTML body fragment.",
      userPrompt: buildEnglishContentPrompt({
        ...input,
        htmlContent: normalizedContent,
        stylePrompt: config.stylePrompt,
      }),
    }),
  );

  if (!enContent) {
    throw createReadableError(
      "英文正文生成失败：模型返回为空",
      "请检查模型输出、额度和第三方接口兼容性",
    );
  }

  if (enContent.length < MIN_REWRITTEN_HTML_LENGTH) {
    throw createReadableError(
      "英文正文生成失败：返回内容过短",
      `只返回 ${enContent.length} 个字符，可能被模型拒绝或输出异常`,
    );
  }

  const metadataText = await requestChatCompletion({
    config,
    endpoint,
    timeoutMs,
    maxTokens: Math.min(config.maxTokens, 4096),
    responseFormat: { type: "json_object" },
    stepName: "英文 SEO 元信息生成",
    systemPrompt:
      "You only output one valid JSON object. Do not output Markdown, explanations or extra text.",
    userPrompt: buildEnglishMetadataPrompt({
      title: input.title,
      description: input.description,
      keywords: input.keywords,
      enContent,
      metadataStylePrompt: config.metadataStylePrompt,
    }),
  });
  const output = normalizeEnglishSeoVersion(
    {
      ...parseJsonResponse<EnglishSeoVersionRawOutput>(metadataText),
      enContent,
    },
    {
      title: input.title,
      description: input.description,
      htmlContent: enContent,
    },
  );
  validateEnglishSeoVersion(output);

  return output;
}
