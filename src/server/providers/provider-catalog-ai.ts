import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import { assertPublicHttpUrl } from "@fwqgo/core/network-url";
import {
  validateProviderCatalogAiOutput,
  type ProviderCatalogSourceMapping,
} from "@fwqgo/core/provider-catalog-discovery";
import {
  buildOpenAiChatCompletionsEndpoint,
  parseAiJsonObject,
} from "@fwqgo/ai/openai-compatible";
import type { getActiveAiRewriteConfig } from "@fwqgo/ai/rewrite-config";

const AI_TIMEOUT_MS = 120_000;
const MAX_AI_RESPONSE_BYTES = 2 * 1024 * 1024;

type ActiveAiConfig = NonNullable<
  Awaited<ReturnType<typeof getActiveAiRewriteConfig>>
>;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
};

export type ProviderCatalogAiMappingResult = {
  rawResponse: string;
  mappings: ProviderCatalogSourceMapping[];
  warnings: string[];
};

export class ProviderCatalogAiOutputError extends Error {
  constructor(
    message: string,
    readonly rawResponse: string,
  ) {
    super(message);
    this.name = "ProviderCatalogAiOutputError";
  }
}

function getApiErrorMessage(response: Response, data: ChatCompletionResponse) {
  const detail = data.error?.message?.trim();
  const base = `AI 套餐源映射请求失败：HTTP ${response.status} ${response.statusText}`;
  if (response.status === 401 || response.status === 403) {
    return `${base}，请检查 API Key 和模型权限`;
  }
  if (response.status === 404) {
    return `${base}，请检查 Base URL 和模型名称`;
  }
  if (response.status === 429) {
    return `${base}，接口额度或频率受限`;
  }
  return detail ? `${base}，${detail}` : base;
}

export async function mapProviderCatalogPagesWithAi(input: {
  config: ActiveAiConfig;
  prompt: string;
  fetchedUrls: string[];
}): Promise<ProviderCatalogAiMappingResult> {
  if (!input.config.apiKey?.trim()) {
    throw new Error("默认 AI 配置没有 API Key，无法执行套餐源映射");
  }

  const endpoint = await assertPublicHttpUrl(
    buildOpenAiChatCompletionsEndpoint(input.config.baseUrl),
    "AI 接口地址",
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
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
        temperature: Math.min(input.config.temperature / 100, 0.3),
        max_tokens: Math.min(Math.max(input.config.maxTokens, 2_000), 12_000),
        response_format: { type: "json_object" },
        // The configurable prompt is the complete instruction. No system message is added.
        messages: [{ role: "user", content: input.prompt }],
      }),
    });
    const responseText = await readResponseTextWithLimit(
      response,
      MAX_AI_RESPONSE_BYTES,
    );
    if (responseText === null) {
      throw new Error("AI 套餐源映射响应超过 2 MB 限制");
    }

    let data: ChatCompletionResponse;
    try {
      data = JSON.parse(responseText || "{}") as ChatCompletionResponse;
    } catch {
      throw new Error(
        `AI 套餐源映射接口返回的不是 JSON：${responseText.slice(0, 200)}`,
      );
    }
    if (!response.ok) throw new Error(getApiErrorMessage(response, data));

    const choice = data.choices?.[0];
    const rawResponse = choice?.message?.content?.trim() ?? "";
    if (!rawResponse) throw new Error("AI 套餐源映射返回空内容");
    if (choice?.finish_reason === "length") {
      throw new Error(
        "AI 套餐源映射输出被截断，请缩短发现 Prompt 或减少页面内容",
      );
    }

    let validated: ReturnType<typeof validateProviderCatalogAiOutput>;
    try {
      const value = parseAiJsonObject<Record<string, unknown>>(
        rawResponse,
        "AI 套餐源映射失败",
      );
      validated = validateProviderCatalogAiOutput({
        value,
        fetchedUrls: input.fetchedUrls,
      });
    } catch (error) {
      throw new ProviderCatalogAiOutputError(
        error instanceof Error ? error.message : "AI 套餐源映射输出无效",
        rawResponse,
      );
    }
    return { rawResponse, ...validated };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI 套餐源映射请求超时（120 秒）");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
