import { assertPublicHttpUrl } from "@fwqgo/core/network-url";

import { getAiRewriteConfigForStatusCheck } from "@fwqgo/ai/rewrite-config";

import { buildOpenAiChatCompletionsEndpoint } from "./openai-compatible";

type ChatCompletionStatusResponse = {
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

export type AiRewriteStatusCheckResult =
  | {
      success: true;
      checkedAt: string;
      configId: number;
      configName: string;
      provider: string;
      endpointOrigin: string;
      endpointPath: string;
      model: string;
      latencyMs: number;
      finishReason: string | null;
      promptTokens: number | null;
      completionTokens: number | null;
      totalTokens: number | null;
      responsePreview: string;
    }
  | {
      success: false;
      checkedAt: string;
      configId: number;
      configName: string | null;
      provider: string | null;
      endpointOrigin: string | null;
      endpointPath: string | null;
      model: string | null;
      latencyMs: number | null;
      errorTitle: string;
      error: string;
      suggestion: string;
    };

function nowIso() {
  return new Date().toISOString();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

function failed(input: {
  configId: number;
  configName?: string | null;
  provider?: string | null;
  endpoint?: URL | null;
  model?: string | null;
  latencyMs?: number | null;
  errorTitle: string;
  error: string;
  suggestion: string;
}): AiRewriteStatusCheckResult {
  return {
    success: false,
    checkedAt: nowIso(),
    configId: input.configId,
    configName: input.configName ?? null,
    provider: input.provider ?? null,
    endpointOrigin: input.endpoint?.origin ?? null,
    endpointPath: input.endpoint?.pathname ?? null,
    model: input.model ?? null,
    latencyMs: input.latencyMs ?? null,
    errorTitle: input.errorTitle,
    error: input.error,
    suggestion: input.suggestion,
  };
}

function classifyHttpError(input: {
  status: number;
  statusText: string;
  payload: ChatCompletionStatusResponse | null;
  bodyText: string;
}) {
  const providerMessage = input.payload?.error?.message?.trim();
  const bodyPreview = input.bodyText.slice(0, 220).trim();
  const error =
    providerMessage ??
    (bodyPreview.length > 0 ? bodyPreview : "服务商没有返回错误详情");
  const prefix = `HTTP ${input.status} ${input.statusText}`;

  if (input.status === 401 || input.status === 403) {
    return {
      errorTitle: "认证失败",
      error: `${prefix}；${error}`,
      suggestion: "检查 API Key 是否正确、是否过期，以及该 Key 是否有模型权限。",
    };
  }

  if (input.status === 404) {
    return {
      errorTitle: "接口或模型不存在",
      error: `${prefix}；${error}`,
      suggestion: "检查 Base URL 是否应包含 /v1，以及模型名称是否和服务商后台一致。",
    };
  }

  if (input.status === 429) {
    return {
      errorTitle: "额度或频率受限",
      error: `${prefix}；${error}`,
      suggestion: "检查余额、RPM/TPM 限制，或稍后再试。",
    };
  }

  if (input.status >= 500) {
    return {
      errorTitle: "服务商接口异常",
      error: `${prefix}；${error}`,
      suggestion: "服务商当前返回 5xx，稍后重试或切换备用模型。",
    };
  }

  return {
    errorTitle: "接口请求失败",
    error: `${prefix}；${error}`,
    suggestion: "检查 Base URL、模型、Key、服务商兼容性和请求参数。",
  };
}

function parseStatusResponse(text: string) {
  try {
    return JSON.parse(text || "{}") as ChatCompletionStatusResponse;
  } catch {
    return null;
  }
}

export async function checkAiRewriteConfigStatus(
  configId: number,
): Promise<AiRewriteStatusCheckResult> {
  const config = await getAiRewriteConfigForStatusCheck(configId);

  if (!config) {
    return failed({
      configId,
      errorTitle: "配置不存在",
      error: `找不到 AI 改写配置 #${configId}`,
      suggestion: "刷新页面后重新选择配置。",
    });
  }

  if (!config.apiKey?.trim()) {
    return failed({
      configId,
      configName: config.name,
      provider: config.provider,
      model: config.model,
      errorTitle: "API Key 未配置",
      error: `「${config.name}」没有保存 API Key`,
      suggestion: "编辑配置并填入 API Key，保存后再检测。",
    });
  }

  const startedAt = Date.now();
  let endpoint: URL;

  try {
    endpoint = await assertPublicHttpUrl(
      buildOpenAiChatCompletionsEndpoint(config.baseUrl),
      "AI 接口地址",
    );
  } catch (error) {
    return failed({
      configId,
      configName: config.name,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - startedAt,
      errorTitle: "接口地址不可用",
      error: getErrorMessage(error),
      suggestion: "Base URL 只能使用公网 http/https 地址，不能指向 localhost、内网或保留地址。",
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: "system",
            content: "You are a health check endpoint.",
          },
          {
            role: "user",
            content: "Reply with the single word: ok",
          },
        ],
      }),
    });
    const latencyMs = Date.now() - startedAt;
    const bodyText = await response.text();
    const payload = parseStatusResponse(bodyText);

    if (!response.ok) {
      const classified = classifyHttpError({
        status: response.status,
        statusText: response.statusText,
        payload,
        bodyText,
      });

      return failed({
        configId,
        configName: config.name,
        provider: config.provider,
        endpoint,
        model: config.model,
        latencyMs,
        ...classified,
      });
    }

    if (!payload) {
      return failed({
        configId,
        configName: config.name,
        provider: config.provider,
        endpoint,
        model: config.model,
        latencyMs,
        errorTitle: "返回格式异常",
        error: `接口返回成功状态，但响应不是 JSON：${bodyText.slice(0, 180) || "空"}`,
        suggestion: "检查第三方接口是否完全兼容 OpenAI chat/completions 响应结构。",
      });
    }

    const choice = payload.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (!text) {
      return failed({
        configId,
        configName: config.name,
        provider: config.provider,
        endpoint,
        model: config.model,
        latencyMs,
        errorTitle: "返回格式异常",
        error: "接口返回成功状态，但没有 choices[0].message.content",
        suggestion: "检查第三方接口是否完全兼容 OpenAI chat/completions 响应结构。",
      });
    }

    return {
      success: true,
      checkedAt: nowIso(),
      configId,
      configName: config.name,
      provider: config.provider,
      endpointOrigin: endpoint.origin,
      endpointPath: endpoint.pathname,
      model: config.model,
      latencyMs,
      finishReason: choice?.finish_reason ?? null,
      promptTokens:
        typeof payload.usage?.prompt_tokens === "number"
          ? payload.usage.prompt_tokens
          : null,
      completionTokens:
        typeof payload.usage?.completion_tokens === "number"
          ? payload.usage.completion_tokens
          : null,
      totalTokens:
        typeof payload.usage?.total_tokens === "number"
          ? payload.usage.total_tokens
          : null,
      responsePreview: text.slice(0, 120),
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = getErrorMessage(error);
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        message.toLowerCase().includes("timeout"));

    return failed({
      configId,
      configName: config.name,
      provider: config.provider,
      endpoint,
      model: config.model,
      latencyMs,
      errorTitle: isTimeout ? "接口检测超时" : "接口连接失败",
      error: message,
      suggestion: isTimeout
        ? "15 秒内没有返回。检查中转服务、模型可用性，或稍后重试。"
        : "检查网络连通性、Base URL、TLS 证书和服务商兼容性。",
    });
  }
}
