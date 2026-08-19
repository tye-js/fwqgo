function errorDetails(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? [error] : [];
  }

  const details = [error.name, error.message];
  const errorWithMetadata = error as Error & {
    cause?: unknown;
    code?: unknown;
  };

  if (typeof errorWithMetadata.code === "string") {
    details.push(errorWithMetadata.code);
  }
  if (errorWithMetadata.cause && errorWithMetadata.cause !== error) {
    details.push(...errorDetails(errorWithMetadata.cause));
  }

  return details;
}

export class AiProviderHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AiProviderHttpError";
    this.status = status;
  }
}

export function canFailoverAiProviderError(error: unknown) {
  if (error instanceof AiProviderHttpError) {
    // A complete HTTP response proves that the provider rejected or failed
    // the request. Keep timeout/gateway-timeout statuses out because the
    // upstream may still be processing a non-idempotent request.
    return new Set([
      400,
      401,
      402,
      403,
      404,
      405,
      413,
      415,
      422,
      429,
      500,
      501,
      502,
      503,
    ]).has(error.status);
  }

  const message = error instanceof Error ? error.message : "";
  return /AI 改写配置不完整|缺少 API Key|AI 接口地址校验失败/.test(message);
}

export function isTransientAiNetworkError(error: unknown) {
  const detail = errorDetails(error).join(" ").toLowerCase();

  return [
    "socket connection was closed unexpectedly",
    "fetch failed",
    "connection reset",
    "connection closed",
    "other side closed",
    "econnreset",
    "epipe",
    "und_err_socket",
    "und_err_connect_timeout",
  ].some((fragment) => detail.includes(fragment));
}

export function getTransientAiNetworkErrorMessage(input: {
  configName: string;
  model: string;
}) {
  return `第三方 AI 中转在响应完成前关闭了连接，系统未自动重试：${input.configName} / ${input.model}。为避免重复计费，请检查中转余额、上游请求时限和模型可用性后手动重试`;
}

export function buildOpenAiChatCompletionsEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return trimmed;
  }

  if (/\/(?:v1\/)?chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

function cleanAiJsonText(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonObject(text: string) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAiJsonObject<T extends Record<string, unknown>>(
  text: string,
  errorLabel: string,
): T {
  const cleaned = cleanAiJsonText(text);
  let directError: unknown = null;
  let directParsed: unknown;

  try {
    directParsed = JSON.parse(cleaned);
  } catch (error) {
    directError = error;
  }

  if (directError === null) {
    if (!isJsonObject(directParsed)) {
      throw new Error(
        `${errorLabel}：JSON 格式损坏；原因：模型返回的 JSON 顶层不是对象`,
      );
    }
    return directParsed as T;
  }

  const candidate = extractFirstJsonObject(cleaned);
  if (!candidate) {
    const hasObjectStart = cleaned.includes("{");
    throw new Error(
      hasObjectStart
        ? `${errorLabel}：JSON 格式损坏；原因：模型输出可能被截断，缺少完整的右大括号`
        : `${errorLabel}：返回内容不是 JSON；原因：返回开头：${cleaned.slice(0, 120) || "空"}`,
    );
  }

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!isJsonObject(parsed)) {
      throw new Error("模型返回的 JSON 顶层不是对象");
    }
    return parsed as T;
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : directError instanceof Error
          ? directError.message
          : "无法解析模型返回值";
    throw new Error(`${errorLabel}：JSON 格式损坏；原因：${detail}`);
  }
}
