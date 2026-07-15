import { sanitizeFileName } from "@fwqgo/core/utils";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import {
  buildImageGenerationEndpoint,
  formatImageGenerationHttpError,
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
  type ImageGenerationProvider,
} from "@/server/images/generation-config";

type GenerateCustomImageInput = {
  prompt: string;
  fileName?: string | null;
  altZh?: string | null;
  uploadedBy: string | null;
  configId?: number;
};

const MAX_IMAGE_API_RESPONSE_BYTES = 24 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 16 * 1024 * 1024;

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

  const endpoint = buildImageGenerationEndpoint(config.baseUrl);
  let response: Response;
  try {
    const safeEndpoint = await assertPublicHttpUrl(endpoint, "生图接口地址");
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
      throw new Error(
        `生图接口请求超时：${config.timeoutSeconds} 秒内没有返回结果`,
      );
    }
    throw new Error(`生图接口连接失败：${message}`);
  }

  const text = await readResponseTextWithLimit(
    response,
    MAX_IMAGE_API_RESPONSE_BYTES,
  );
  if (text === null) {
    throw new Error(
      "生图接口响应过大，已停止读取；请检查接口是否返回了异常内容",
    );
  }
  if (!response.ok) {
    throw new Error(
      formatImageGenerationHttpError({
        status: response.status,
        statusText: response.statusText,
        responseText: text,
        baseUrl: config.baseUrl,
      }),
    );
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
