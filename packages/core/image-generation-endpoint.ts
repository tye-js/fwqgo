import { isBlockedNetworkHostname } from "./network-url";

const DEFAULT_IMAGE_RATE_LIMIT_RETRY_MS = 5 * 60 * 1000;
const MIN_IMAGE_RATE_LIMIT_RETRY_MS = 5 * 1000;
const MAX_IMAGE_RATE_LIMIT_RETRY_MS = 30 * 60 * 1000;

export class ImageGenerationRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "ImageGenerationRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class ImageGenerationConnectionInterruptedError extends Error {
  readonly pauseAfterMs: number;

  constructor(
    message: string,
    pauseAfterMs = DEFAULT_IMAGE_RATE_LIMIT_RETRY_MS,
  ) {
    super(message);
    this.name = "ImageGenerationConnectionInterruptedError";
    this.pauseAfterMs = pauseAfterMs;
  }
}

export class ImageGenerationHttpError extends Error {
  readonly status: number;
  readonly providerCode: string;

  constructor(message: string, status: number, providerCode = "") {
    super(message);
    this.name = "ImageGenerationHttpError";
    this.status = status;
    this.providerCode = providerCode;
  }
}

function clampRetryDelay(value: number) {
  return Math.min(
    MAX_IMAGE_RATE_LIMIT_RETRY_MS,
    Math.max(MIN_IMAGE_RATE_LIMIT_RETRY_MS, value),
  );
}

export function getImageGenerationRetryDelayMs(input: {
  retryAfter?: string | null;
  responseText?: string;
  nowMs?: number;
}) {
  const retryAfter = input.retryAfter?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return clampRetryDelay(seconds * 1000);
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return clampRetryDelay(retryAt - (input.nowMs ?? Date.now()));
    }
  }

  const minuteWindow = input.responseText?.match(
    /(?:maximum\s+\d+\s+requests?\s+in|try\s+again\s+in)\s+(\d+)\s+minutes?/i,
  )?.[1];
  if (minuteWindow) {
    return clampRetryDelay(Number(minuteWindow) * 60 * 1000);
  }

  const secondWindow = input.responseText?.match(
    /(?:retry|try\s+again)\s+(?:after|in)\s+(\d+)\s+seconds?/i,
  )?.[1];
  if (secondWindow) {
    return clampRetryDelay(Number(secondWindow) * 1000);
  }

  return DEFAULT_IMAGE_RATE_LIMIT_RETRY_MS;
}

export function isUncertainImageGenerationHttpStatus(status: number) {
  return status === 408 || status === 504 || status === 524;
}

export function buildImageGenerationEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (/\/v1\/images\/generations$/i.test(normalized)) return normalized;
  if (/\/images\/generations$/i.test(normalized)) return normalized;
  return `${normalized}/v1/images/generations`;
}

/**
 * Some OpenAI-compatible relays return a relative image path or leak the
 * upstream worker's private URL. Route those paths back through the configured
 * public relay without ever connecting to the private host itself.
 */
export function normalizeImageGenerationResultUrl(
  value: string,
  generationEndpoint: string,
) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  let endpoint: URL;
  try {
    endpoint = new URL(generationEndpoint);
  } catch {
    return trimmed;
  }

  let result: URL;
  try {
    result = new URL(trimmed, endpoint.origin);
  } catch {
    return trimmed;
  }

  if (result.protocol !== "http:" && result.protocol !== "https:") {
    return trimmed;
  }

  if (isBlockedNetworkHostname(result.hostname)) {
    return new URL(
      `${result.pathname}${result.search}${result.hash}`,
      endpoint.origin,
    ).toString();
  }

  return result.toString();
}

function parseProviderError(responseText: string) {
  try {
    const payload = JSON.parse(responseText) as {
      error?: { message?: string; code?: string | number; type?: string };
      message?: string;
      detail?: string;
    };
    return {
      message:
        payload.error?.message ?? payload.message ?? payload.detail ?? "",
      code: payload.error?.code ? String(payload.error.code) : "",
    };
  } catch {
    return { message: "", code: "" };
  }
}

export function formatImageGenerationHttpError(input: {
  status: number;
  statusText: string;
  responseText: string;
  baseUrl: string;
}) {
  const providerError = parseProviderError(input.responseText);
  const movedToImageEndpoint =
    providerError.code === "use_image_endpoint" ||
    /dedicated image endpoint|image api has moved/i.test(providerError.message);
  const statusText = input.statusText || "请求失败";

  if (movedToImageEndpoint) {
    let origin = input.baseUrl;
    try {
      origin = new URL(input.baseUrl).origin;
    } catch {
      // Keep the configured value for the operator-facing diagnostic.
    }
    return [
      `生图接口请求失败：HTTP ${input.status} ${statusText}`,
      `当前 Base URL「${origin}」是通用接口主机，服务商已停止在该主机提供图片 API`,
      "请在“设置 > 生图配置”中填写服务商提供的图片专用完整地址，或切换到已验证可用的生图配置",
    ].join("；");
  }

  if (providerError.message) {
    const code = providerError.code ? `（${providerError.code}）` : "";
    return `生图接口请求失败：HTTP ${input.status} ${statusText}；${providerError.message}${code}`;
  }

  return `生图接口请求失败：HTTP ${input.status} ${statusText}；返回内容：${input.responseText.slice(0, 240) || "空"}`;
}

export function createImageGenerationHttpError(input: {
  status: number;
  statusText: string;
  responseText: string;
  baseUrl: string;
}) {
  const providerError = parseProviderError(input.responseText);
  return new ImageGenerationHttpError(
    formatImageGenerationHttpError(input),
    input.status,
    providerError.code,
  );
}

export function canFailoverImageGenerationError(error: unknown) {
  if (
    error instanceof ImageGenerationHttpError ||
    error instanceof ImageGenerationRateLimitError
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : "";
  return /^(?:生图配置缺少 API Key|生图接口地址校验失败)/.test(message);
}
