import { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";
import { assertPublicHttpUrl } from "@fwqgo/core/network-url";
import { slugify } from "@fwqgo/core/utils";

import { buildOpenAiChatCompletionsEndpoint } from "./openai-compatible";

const DEFAULT_AI_REWRITE_TIMEOUT_MS = 300_000;
const TAG_SEO_MAX_TOKENS = 2_000;

type AiRewriteConfig = NonNullable<
  Awaited<ReturnType<typeof getActiveAiRewriteConfig>>
>;

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

type RawTagSeoOutput = Partial<{
  description: string;
  keywords: unknown;
  enName: string;
  enSlug: string;
  enDescription: string;
  enKeywords: unknown;
}>;

export type TagSeoOutput = {
  description: string;
  keywords: string[];
  enName: string;
  enSlug: string;
  enDescription: string;
  enKeywords: string[];
};

export type TagSeoInput = {
  name: string;
  slug: string;
  description?: string | null;
  keywords?: string | null;
  enName?: string | null;
  enSlug?: string | null;
  enDescription?: string | null;
  enKeywords?: string | null;
};

function getAiRewriteTimeoutMs() {
  const configured = Number(process.env.AI_REWRITE_TIMEOUT_MS);

  if (Number.isFinite(configured) && configured >= 10_000) {
    return configured;
  }

  return DEFAULT_AI_REWRITE_TIMEOUT_MS;
}

function getTagSeoMaxTokens(maxTokens: number) {
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    return Math.min(Math.floor(maxTokens), TAG_SEO_MAX_TOKENS);
  }

  return TAG_SEO_MAX_TOKENS;
}

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
        "标签 SEO AI 生成失败：返回内容不是 JSON",
        `返回开头：${cleaned.slice(0, 120) || "空"}`,
      );
    }

    try {
      return JSON.parse(match[0]) as T;
    } catch {
      throw createReadableError(
        "标签 SEO AI 生成失败：JSON 格式损坏",
        error instanceof Error ? error.message : "无法解析模型返回值",
      );
    }
  }
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .replace(/，/g, ",")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeEnglishSlug(value: string, fallback: string) {
  const normalized = slugify(value)
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (normalized) {
    return normalized;
  }

  return slugify(fallback)
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeTagSeoOutput(raw: RawTagSeoOutput, fallback: TagSeoInput) {
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim().slice(0, 180)
      : "";
  const keywords = normalizeStringArray(raw.keywords).slice(0, 6);
  const enName =
    typeof raw.enName === "string" && raw.enName.trim()
      ? raw.enName.trim().slice(0, 120)
      : "";
  const enSlug =
    typeof raw.enSlug === "string" && raw.enSlug.trim()
      ? normalizeEnglishSlug(raw.enSlug, enName || fallback.slug)
      : "";
  const enDescription =
    typeof raw.enDescription === "string" && raw.enDescription.trim()
      ? raw.enDescription.trim().slice(0, 180)
      : "";
  const enKeywords = normalizeStringArray(raw.enKeywords).slice(0, 6);

  return {
    description,
    keywords,
    enName,
    enSlug,
    enDescription,
    enKeywords,
  };
}

function validateTagSeoOutput(output: TagSeoOutput) {
  const issues: string[] = [];

  if (output.description.length < 20) {
    issues.push("中文 Description 过短");
  }

  if (output.keywords.length === 0) {
    issues.push("中文 Keywords 为空");
  }

  if (output.enName.length < 2) {
    issues.push("英文标签为空或过短");
  }

  if (!output.enSlug) {
    issues.push("英文 slug 为空");
  }

  if (output.enDescription.length < 40) {
    issues.push("英文 Description 过短");
  }

  if (output.enKeywords.length === 0) {
    issues.push("英文 Keywords 为空");
  }

  if (issues.length > 0) {
    throw createReadableError(
      "标签 SEO AI 生成失败：返回字段不完整",
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

async function requestTagSeoJson(input: {
  config: AiRewriteConfig;
  endpoint: string;
  timeoutMs: number;
  maxTokens: number;
  userPrompt: string;
}) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = async () => {
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
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是服务器/VPS 内容站的 SEO 运营专家。你只输出一个符合要求的 JSON 对象，不输出 Markdown、解释或额外文本。",
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
            `标签 SEO AI 生成超时（${Math.round(input.timeoutMs / 1000)}秒）：${input.config.name} / ${input.config.model}，请稍后重试或换一个改写模型`,
          ),
        );
      }, input.timeoutMs);
    });

    const result = await Promise.race([request(), timeoutPromise]);

    if (!result.response.ok) {
      throw createReadableError(
        "标签 SEO AI 生成失败",
        getAiProviderErrorMessage({
          status: result.response.status,
          statusText: result.response.statusText,
          error: result.data?.error,
        }),
      );
    }

    const choice = result.data?.choices?.[0];
    const text = choice?.message?.content;

    if (choice?.finish_reason === "length") {
      throw createReadableError(
        "标签 SEO AI 生成失败：模型输出被截断",
        "请调大 Max Tokens，或减少批量数量后重试",
      );
    }

    if (!text) {
      throw createReadableError(
        "标签 SEO AI 生成失败：模型返回为空",
        "请检查模型名称、额度和第三方接口兼容性",
      );
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `标签 SEO AI 生成超时（${Math.round(input.timeoutMs / 1000)}秒）：${input.config.name} / ${input.config.model}，请稍后重试或换一个改写模型`,
      );
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function buildTagSeoPrompt(input: TagSeoInput) {
  return `请为一个服务器/VPS 内容站的标签聚合页生成中英文 SEO 元信息。

标签信息：
- 中文标签名：${input.name}
- 中文 slug：${input.slug}
- 现有中文 Description：${input.description ?? ""}
- 现有中文 Keywords：${input.keywords ?? ""}
- 现有英文标签：${input.enName ?? ""}
- 现有英文 slug：${input.enSlug ?? ""}
- 现有英文 Description：${input.enDescription ?? ""}
- 现有英文 Keywords：${input.enKeywords ?? ""}

生成规则：
1. description 用中文，80 到 160 字，适合搜索结果摘要，围绕服务器、VPS、主机、云服务、线路、配置、应用场景等信息，不写具体价格、折扣、优惠码或时效承诺。
2. keywords 生成 3 到 6 个中文 SEO 关键词，使用数组。
3. enName 是自然、简洁的英文标签名，不要直译成生硬拼音。
4. enSlug 只使用小写英文字母、数字和连字符，长度 3 到 80。
5. enDescription 用英文，120 到 160 个字符，适合英文搜索结果摘要，不写具体价格、折扣、优惠码或时效承诺。
6. enKeywords 生成 3 到 6 个英文 SEO keywords，使用数组。
7. 只输出 JSON，不要输出代码块。

JSON 结构必须为：
{
  "description": "中文 Description",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "enName": "English tag name",
  "enSlug": "english-tag-slug",
  "enDescription": "English meta description",
  "enKeywords": ["keyword 1", "keyword 2", "keyword 3"]
}`;
}

export async function generateTagSeoMetadata(
  input: TagSeoInput,
  options: { styleId?: number } = {},
): Promise<TagSeoOutput> {
  const config = await getActiveAiRewriteConfig(options.styleId);

  if (!config) {
    throw createReadableError(
      "标签 SEO AI 生成未启用",
      "请先在后台「内容生产 - 改写接口配置」启用一套默认配置",
    );
  }

  if (!config.apiKey) {
    throw createReadableError(
      "AI 改写配置不完整",
      `「${config.name}」缺少 API Key`,
    );
  }

  const endpoint = buildOpenAiChatCompletionsEndpoint(config.baseUrl);
  const text = await requestTagSeoJson({
    config,
    endpoint,
    timeoutMs: getAiRewriteTimeoutMs(),
    maxTokens: getTagSeoMaxTokens(config.maxTokens),
    userPrompt: buildTagSeoPrompt(input),
  });
  const output = normalizeTagSeoOutput(
    parseJsonResponse<RawTagSeoOutput>(text),
    input,
  );

  validateTagSeoOutput(output);

  return output;
}
