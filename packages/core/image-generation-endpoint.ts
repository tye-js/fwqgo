import { isBlockedNetworkHostname } from "./network-url";

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
