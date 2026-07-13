import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import {
  defaultEnglishMetadataStylePrompt,
  defaultEnglishStylePrompt,
  defaultMetadataStylePrompt,
} from "@fwqgo/core/ai-rewrite-prompts";
import { contentToArticleMarkdown } from "@fwqgo/core/content";
import { assertPublicHttpUrl } from "@fwqgo/core/network-url";

import { buildOpenAiChatCompletionsEndpoint } from "./openai-compatible";

const DEFAULT_AI_REWRITE_TIMEOUT_MS = 300_000;
const MIN_AI_INPUT_LENGTH = 80;
const MIN_REWRITTEN_MARKDOWN_LENGTH = 120;
const MAX_METADATA_INPUT_LENGTH = 28_000;
const MAX_ENGLISH_CONTINUATION_ATTEMPTS = 3;

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
  "markdownContent"
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

function buildHtmlRewritePrompt(content: string, stylePrompt: string) {
  return `你是一个专业的服务器/VPS 推广文章中文编辑。请把清洗后的原文 Markdown 改写成更适合发布的中文正文 Markdown。

正文改写风格：
${stylePrompt}

硬性规则：
1. 只输出改写后的正文 Markdown，不要输出标题、摘要、关键词、标签、JSON、代码块围栏、解释或额外文本。
2. 正文小标题从 ## 开始，第一段不需要标题。
3. 保留 Markdown 表格、列表、链接、商家名、价格、CPU、内存、存储、流量、地区、线路、优惠码、库存、购买链接等事实信息。
4. 可以优化段落顺序、表达和小标题，但不要编造原文没有的价格、配置、优惠码、库存、线路或商家承诺。
5. 如果有官网、优惠码、套餐表格、网络线路、适用场景等信息，尽量清晰分段展示。
6. 不准删除原文中的返利链接、购买链接和官网链接，不准把链接文字改成“链接”“点击这里”等泛化文本；链接文字应保留商家名、官网、购买入口或套餐含义。

清洗后的原文 Markdown：
${content}`;
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
) {
  const style = getMetadataStylePrompt(metadataStylePrompt);
  const metadataInputLength = Math.min(
    MAX_METADATA_INPUT_LENGTH,
    Math.max(MIN_AI_INPUT_LENGTH, Math.floor(maxContentLength)),
  );

  return `你是服务器/VPS 推广文章的 SEO 编辑。请根据已改写的中文 Markdown 正文生成文章元信息。

输出要求：
1. 只输出 JSON 对象，不要输出 Markdown、解释或额外文本。
2. 输出紧凑 JSON，不要换行缩进，不要输出空白填充。
3. title 要偏 SEO 长尾词，尽量包含商家、价格、配置、线路或适用场景；原文没有的信息不要编造。
4. description 控制在 120 字以内，准确概括商家、价格、配置、线路和适用场景。
5. keywords 生成 2 到 6 个适合 SEO 的关键词，不要超过 6 个。
6. tagsName 生成 8 到 10 个相关标签，第一个标签优先为商家名，其余是长尾 SEO 关键词。
7. recommendTagName 是商家名；无法判断商家名时使用最核心的服务商品牌词。

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

已改写的 Markdown 正文：
${markdownContent.slice(0, metadataInputLength)}`;
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
      const data = (await response
        .json()
        .catch(() => null)) as ChatCompletionResponse | null;

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
    const text = choice?.message?.content;
    if (choice?.finish_reason === "length" && !input.allowLengthFinishReason) {
      throw createReadableError(
        `${input.stepName}失败：模型输出被截断`,
        "请调大 Max Tokens，或缩短抓取正文/提示词",
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
      completionTokens:
        typeof result.data?.usage?.completion_tokens === "number"
          ? result.data.usage.completion_tokens
          : null,
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

  const endpoint = buildOpenAiChatCompletionsEndpoint(config.baseUrl);
  const markdownContent = cleanMarkdownText(
    await requestChatCompletion({
      config,
      endpoint,
      timeoutMs,
      maxTokens: config.maxTokens,
      stepName: "正文改写",
      systemPrompt:
        "你是专业中文编辑。你只输出正文 Markdown，不输出 JSON、代码块围栏、解释或额外文本。",
      userPrompt: buildHtmlRewritePrompt(normalizedContent, config.stylePrompt),
    }),
  );

  if (!markdownContent) {
    throw createReadableError(
      "正文改写失败：模型返回为空",
      "请检查模型输出、额度和第三方接口兼容性",
    );
  }

  if (markdownContent.length < MIN_REWRITTEN_MARKDOWN_LENGTH) {
    throw createReadableError(
      "正文改写失败：返回内容过短",
      `只返回 ${markdownContent.length} 个字符，可能被模型拒绝或输出异常`,
    );
  }

  const metadataText = await requestChatCompletion({
    config,
    endpoint,
    timeoutMs,
    maxTokens: config.maxTokens,
    responseFormat: { type: "json_object" },
    stepName: "标题/SEO 元信息生成",
    systemPrompt:
      "你只输出符合要求的 JSON 对象，不输出 Markdown、解释或额外文本。",
    userPrompt: buildMetadataPrompt(
      markdownContent,
      config.metadataStylePrompt,
      getAiRewriteContentLimit(config.maxTokens),
    ),
  });
  const metadata = normalizeMetadata(
    parseJsonResponse<Partial<ArticleMetadataOutput>>(metadataText),
    markdownContent,
  );
  validateMetadata(metadata);

  return {
    ...metadata,
    markdownContent: removeDuplicatedTitleFromMarkdown(
      markdownContent,
      metadata.title,
    ),
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
    ),
  });
  const metadata = normalizeMetadata(
    parseJsonResponse<Partial<ArticleMetadataOutput>>(metadataText),
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
    parseJsonResponse<EnglishSeoVersionRawOutput>(metadataText),
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
