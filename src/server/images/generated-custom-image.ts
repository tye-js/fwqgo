import { sanitizeFileName } from "@fwqgo/core/utils";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import {
  buildImageGenerationEndpoint,
  canFailoverImageGenerationError,
  createImageGenerationHttpError,
  getImageGenerationRetryDelayMs,
  ImageGenerationConnectionInterruptedError,
  ImageGenerationRateLimitError,
  isUncertainImageGenerationHttpStatus,
  normalizeImageGenerationResultUrl,
} from "@fwqgo/core/image-generation-endpoint";
import {
  extractGeneratedImageSource,
  readGeneratedImageResponse,
  type ImageGenerationResponse,
} from "@fwqgo/core/image-generation-response";
import {
  assertPublicHttpUrl,
  fetchPublicHttpUrl,
} from "@fwqgo/core/network-url";
import {
  createImageAssetFromBuffer,
  type ImageAssetRow,
} from "@/server/images/assets";
import {
  getActiveImageGenerationConfig,
  getEnabledImageGenerationConfigs,
  type ImageGenerationProvider,
} from "@/server/images/generation-config";
import { structuredLog } from "@fwqgo/core/structured-log";

type GenerateCustomImageInput = {
  prompt: string;
  fileName?: string | null;
  altZh?: string | null;
  uploadedBy: string | null;
  configId?: number;
  allowFailover?: boolean;
  attemptedConfigIds?: number[];
};

const MAX_IMAGE_API_RESPONSE_BYTES = 24 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 16 * 1024 * 1024;

function getErrorDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : "未知错误";
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : null;
  const rawCode =
    cause && typeof cause === "object" && "code" in cause
      ? (cause as { code?: unknown }).code
      : null;
  const code =
    typeof rawCode === "string" || typeof rawCode === "number"
      ? String(rawCode).trim()
      : "";

  return code && !message.includes(code) ? `${message}（${code}）` : message;
}

function buildRequestBody(input: {
  provider: ImageGenerationProvider;
  model: string;
  prompt: string;
  size: string;
  quality: string;
}) {
  const baseBody = {
    model: input.model,
    prompt: input.prompt,
    n: 1,
    size: input.size,
  };

  if (input.provider === "image2") {
    return {
      ...baseBody,
      response_format: "url",
    };
  }

  return {
    ...baseBody,
    quality: input.quality,
  };
}

function toEnglishFileSlug(value: string | null | undefined) {
  const slug = value
    ?.trim()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug ?? "";
}

function buildOriginalName(
  input: Pick<GenerateCustomImageInput, "fileName" | "prompt">,
) {
  const baseSlug =
    toEnglishFileSlug(input.fileName) ||
    toEnglishFileSlug(input.prompt) ||
    "ai-generated-image";
  return `${baseSlug}.png`;
}

async function getCustomImageFallbackConfig(
  currentConfigId: number,
  attemptedConfigIds: number[],
) {
  const attempted = new Set([...attemptedConfigIds, currentConfigId]);
  const configs = await getEnabledImageGenerationConfigs();
  return (
    configs.find(
      (config) => config.apiKey?.trim() && !attempted.has(config.id),
    ) ?? null
  );
}

async function downloadImage(url: string, timeoutSeconds: number) {
  let response: Response;
  try {
    response = await fetchPublicHttpUrl(
      url,
      {
        signal: AbortSignal.timeout(timeoutSeconds * 1000),
      },
      "生图结果图片 URL",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new Error(`图片下载超时：${timeoutSeconds} 秒内没有下载完成`);
    }
    throw new Error(`图片下载失败：${message}`);
  }

  if (!response.ok) {
    throw new Error(
      `图片下载失败：HTTP ${response.status} ${response.statusText}`,
    );
  }

  const downloaded = await readGeneratedImageResponse(
    response,
    MAX_GENERATED_IMAGE_BYTES,
  );
  return {
    buffer: Buffer.from(downloaded.bytes),
    mime: downloaded.mime,
  };
}

export async function generateCustomImage(
  input: GenerateCustomImageInput,
): Promise<{ asset: ImageAssetRow; prompt: string }> {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("生图要求不能为空");
  }

  const config = await getActiveImageGenerationConfig(input.configId);
  if (!config) {
    throw new Error("没有可用的生图配置，请先在设置里启用生图接口");
  }

  if (!config.apiKey?.trim()) {
    throw new Error("生图配置缺少 API Key");
  }

  const allowFailover = input.allowFailover ?? input.configId === undefined;
  const attemptedConfigIds = input.attemptedConfigIds ?? [];

  const endpoint = buildImageGenerationEndpoint(config.baseUrl);
  let response: Response;
  let requestStarted = false;
  try {
    const safeEndpoint = await assertPublicHttpUrl(endpoint, "生图接口地址");
    requestStarted = true;
    response = await fetch(safeEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      redirect: "error",
      body: JSON.stringify(
        buildRequestBody({
          provider: config.provider as ImageGenerationProvider,
          model: config.model,
          prompt,
          size: config.size,
          quality: config.quality,
        }),
      ),
      signal: AbortSignal.timeout(config.timeoutSeconds * 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new ImageGenerationConnectionInterruptedError(
        `生图接口响应中断：${config.timeoutSeconds} 秒内没有收到完整结果；上游任务可能仍在生成，本地暂时无法取得图片。请先到服务商任务页确认，避免立即重复生成`,
      );
    }
    if (requestStarted) {
      throw new ImageGenerationConnectionInterruptedError(
        `生图接口连接中断：未收到完整图片响应；上游任务可能仍在生成，本地暂时无法取得图片。请先到服务商任务页确认，避免立即重复生成；底层错误：${getErrorDiagnostic(error)}`,
      );
    }
    throw new Error(`生图接口地址校验失败：${message}`);
  }

  let text: string | null;
  try {
    text = await readResponseTextWithLimit(
      response,
      MAX_IMAGE_API_RESPONSE_BYTES,
    );
  } catch (error) {
    throw new ImageGenerationConnectionInterruptedError(
      `生图接口响应中断：已收到响应头，但图片数据没有传输完整；上游任务可能已经成功，本地暂时无法取得图片。请先到服务商任务页确认，避免立即重复生成；底层错误：${getErrorDiagnostic(error)}`,
    );
  }
  if (text === null) {
    throw new Error(
      "生图接口响应过大，已停止读取；请检查接口是否返回了异常内容",
    );
  }
  if (!response.ok) {
    const httpError = createImageGenerationHttpError({
      status: response.status,
      statusText: response.statusText,
      responseText: text,
      baseUrl: config.baseUrl,
    });
    let definiteError: Error;
    if (response.status === 429) {
      const retryAfterMs = getImageGenerationRetryDelayMs({
        retryAfter: response.headers.get("retry-after"),
        responseText: text,
      });
      definiteError = new ImageGenerationRateLimitError(
        `${httpError.message}；预计等待 ${Math.max(1, Math.ceil(retryAfterMs / 60_000))} 分钟后重试`,
        retryAfterMs,
      );
    } else if (isUncertainImageGenerationHttpStatus(response.status)) {
      throw new ImageGenerationConnectionInterruptedError(
        `${httpError.message}；上游任务可能仍在生成，本地暂时无法取得图片。请先到服务商任务页确认，避免立即重复生成`,
      );
    } else {
      definiteError = httpError;
    }

    if (allowFailover && canFailoverImageGenerationError(definiteError)) {
      const fallback = await getCustomImageFallbackConfig(
        config.id,
        attemptedConfigIds,
      );
      if (fallback) {
        structuredLog("warn", "custom_image.config_failover", {
          failedConfigId: config.id,
          failedConfigName: config.name,
          nextConfigId: fallback.id,
          error: definiteError,
        });
        return generateCustomImage({
          ...input,
          configId: fallback.id,
          allowFailover: true,
          attemptedConfigIds: [...attemptedConfigIds, config.id],
        });
      }
    }

    throw definiteError;
  }

  let payload: ImageGenerationResponse;
  try {
    payload = JSON.parse(text) as ImageGenerationResponse;
  } catch {
    throw new Error("生图接口返回的不是有效 JSON");
  }

  const imageSource = extractGeneratedImageSource(payload);
  const image =
    imageSource?.kind === "url"
      ? await downloadImage(
          normalizeImageGenerationResultUrl(imageSource.value, endpoint),
          config.timeoutSeconds,
        )
      : imageSource?.kind === "bytes"
        ? {
            buffer: Buffer.from(imageSource.bytes),
            mime: imageSource.mime,
          }
        : null;

  if (!image) {
    throw new Error("生图接口没有返回图片 URL 或 base64 图片数据");
  }

  const asset = await createImageAssetFromBuffer({
    buffer: image.buffer,
    mime: image.mime,
    originalName: sanitizeFileName(buildOriginalName(input)),
    uploadedBy: input.uploadedBy,
    imageType: "ai_generated",
    altZh: input.altZh ?? input.prompt.slice(0, 120),
    prompt,
  });

  return { asset, prompt };
}
