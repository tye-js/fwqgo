import { sanitizeFileName } from "@fwqgo/core/utils";
import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import {
  buildImageGenerationEndpoint,
  formatImageGenerationHttpError,
  normalizeImageGenerationResultUrl,
} from "@fwqgo/core/image-generation-endpoint";
import { defaultEnglishCoverPromptTemplate } from "@fwqgo/core/image-generation-prompts";
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

type GenerateCoverInput = {
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  fileSlug?: string | null;
  language?: "zh" | "en";
  uploadedBy: string | null;
  configId?: number;
  signal?: AbortSignal;
};

type CoverRequestPreview = {
  configId: number;
  configName: string;
  provider: ImageGenerationProvider;
  model: string;
  endpointOrigin: string;
  endpointPath: string;
  size: string;
  quality: string;
  timeoutSeconds: number;
  promptLength: number;
  titleLength: number;
  descriptionLength: number;
  keywordsLength: number;
  contentLength: number;
};

const MAX_IMAGE_API_RESPONSE_BYTES = 24 * 1024 * 1024;
const MAX_GENERATED_IMAGE_BYTES = 16 * 1024 * 1024;

function fillPromptTemplate(
  template: string,
  input: Pick<
    GenerateCoverInput,
    "title" | "description" | "keywords" | "content"
  >,
) {
  const contentText = stripHtml(input.content ?? "").slice(0, 1200);

  return template
    .replaceAll("{title}", input.title.trim())
    .replaceAll("{description}", input.description?.trim() ?? "")
    .replaceAll("{keywords}", input.keywords?.trim() ?? "")
    .replaceAll("{content}", contentText);
}

function buildLanguagePromptRules(
  englishPromptTemplate: string,
  input: Pick<
    GenerateCoverInput,
    "language" | "title" | "description" | "keywords" | "content"
  >,
) {
  if (input.language === "en") {
    return fillPromptTemplate(englishPromptTemplate, input);
  }

  return [
    "Chinese article cover rules:",
    "- This cover is for a Chinese article and Chinese public page.",
    "- If readable text appears, use Simplified Chinese only, except standard technical abbreviations such as VPS, CPU, RAM, SSD, GB, and TB.",
  ].join("\n");
}

function buildCoverPrompt(
  template: string,
  englishPromptTemplate: string,
  input: GenerateCoverInput,
) {
  return `${fillPromptTemplate(template, input)}\n\n${buildLanguagePromptRules(englishPromptTemplate, input)}`;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "未知错误";
}

function isTimeoutError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")) ||
    message.includes("aborted due to timeout") ||
    message.includes("operation was aborted")
  );
}

function getAbortSignal(timeoutSeconds: number, signal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1000);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;

  if (signal.reason instanceof Error) {
    throw signal.reason;
  }

  throw new Error("封面生图任务已终止");
}

function summarizeJsonShape(payload: ImageGenerationResponse) {
  const keys = Object.keys(payload).slice(0, 12);
  const dataKeys = payload.data?.[0] ? Object.keys(payload.data[0]) : [];
  const parts = [
    keys.length > 0 ? `顶层字段：${keys.join(", ")}` : null,
    dataKeys.length > 0 ? `data[0] 字段：${dataKeys.join(", ")}` : null,
  ].filter(Boolean);

  return parts.join("；") || "返回 JSON 为空对象";
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

function buildCoverOriginalName(
  input: Pick<GenerateCoverInput, "title" | "fileSlug" | "language">,
) {
  const baseSlug =
    toEnglishFileSlug(input.fileSlug) || toEnglishFileSlug(input.title);
  const language = input.language === "en" ? "en" : "zh";
  return `${baseSlug || "article-cover"}-${language}-cover.png`;
}

export async function previewArticleCoverImageRequest(
  input: GenerateCoverInput,
): Promise<CoverRequestPreview> {
  if (!input.title.trim()) {
    throw new Error("生成封面图需要文章标题");
  }

  const config = await getActiveImageGenerationConfig(input.configId);
  if (!config) {
    throw new Error("没有可用的生图配置，请先在设置里启用生图接口");
  }

  if (!config.apiKey?.trim()) {
    throw new Error("生图配置缺少 API Key");
  }

  const prompt = buildCoverPrompt(
    config.promptTemplate,
    config.englishPromptTemplate ?? defaultEnglishCoverPromptTemplate,
    input,
  );
  const safeEndpoint = await assertPublicHttpUrl(
    buildImageGenerationEndpoint(config.baseUrl),
    "生图接口地址",
  );

  return {
    configId: config.id,
    configName: config.name,
    provider: config.provider as ImageGenerationProvider,
    model: config.model,
    endpointOrigin: safeEndpoint.origin,
    endpointPath: safeEndpoint.pathname,
    size: config.size,
    quality: config.quality,
    timeoutSeconds: config.timeoutSeconds,
    promptLength: prompt.length,
    titleLength: input.title.trim().length,
    descriptionLength: input.description?.trim().length ?? 0,
    keywordsLength: input.keywords?.trim().length ?? 0,
    contentLength: stripHtml(input.content ?? "").length,
  };
}

async function downloadImage(
  url: string,
  timeoutSeconds: number,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  let response: Response;
  try {
    response = await fetchPublicHttpUrl(
      url,
      {
        signal: getAbortSignal(timeoutSeconds, signal),
      },
      "生图结果图片 URL",
    );
  } catch (error) {
    throwIfAborted(signal);
    if (isTimeoutError(error)) {
      throw new Error(
        `图片下载超时：${timeoutSeconds} 秒内没有下载完成，请调大生图配置里的超时时间或检查图片 URL`,
      );
    }

    throw new Error(`图片下载失败：${getErrorMessage(error)}`);
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
  throwIfAborted(signal);
  return {
    buffer: Buffer.from(downloaded.bytes),
    mime: downloaded.mime,
  };
}

export async function generateArticleCoverImage(
  input: GenerateCoverInput,
): Promise<{ asset: ImageAssetRow; prompt: string }> {
  throwIfAborted(input.signal);
  if (!input.title.trim()) {
    throw new Error("生成封面图需要文章标题");
  }

  const config = await getActiveImageGenerationConfig(input.configId);
  if (!config) {
    throw new Error("没有可用的生图配置，请先在设置里启用生图接口");
  }

  if (!config.apiKey?.trim()) {
    throw new Error("生图配置缺少 API Key");
  }

  const prompt = buildCoverPrompt(
    config.promptTemplate,
    config.englishPromptTemplate ?? defaultEnglishCoverPromptTemplate,
    input,
  );
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
      signal: getAbortSignal(config.timeoutSeconds, input.signal),
    });
  } catch (error) {
    throwIfAborted(input.signal);
    if (isTimeoutError(error)) {
      throw new Error(
        `生图接口请求超时：${config.timeoutSeconds} 秒内没有返回结果。请调大「生图配置」里的超时时间，或检查模型/中转服务是否可用`,
      );
    }

    throw new Error(
      `生图接口连接失败：${getErrorMessage(error)}。请检查 Base URL、网络和中转服务状态`,
    );
  }

  const text = await readResponseTextWithLimit(
    response,
    MAX_IMAGE_API_RESPONSE_BYTES,
  );
  throwIfAborted(input.signal);
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
    const contentType = response.headers.get("content-type") ?? "未知";
    throw new Error(
      `生图接口返回的不是有效 JSON：Content-Type ${contentType}；返回开头：${text.slice(0, 180) || "空"}`,
    );
  }

  const imageSource = extractGeneratedImageSource(payload);
  const image =
    imageSource?.kind === "url"
      ? await downloadImage(
          normalizeImageGenerationResultUrl(imageSource.value, endpoint),
          config.timeoutSeconds,
          input.signal,
        )
      : imageSource?.kind === "bytes"
        ? {
            buffer: Buffer.from(imageSource.bytes),
            mime: imageSource.mime,
          }
        : null;

  if (!image) {
    throw new Error(
      `生图接口没有返回图片 URL 或 base64 图片数据；${summarizeJsonShape(payload)}`,
    );
  }

  throwIfAborted(input.signal);
  const asset = await createImageAssetFromBuffer({
    buffer: image.buffer,
    mime: image.mime,
    originalName: sanitizeFileName(buildCoverOriginalName(input)),
    uploadedBy: input.uploadedBy,
    imageType: "ai_cover",
    altZh: input.title,
    altEn:
      input.language === "en" ? input.title : toEnglishFileSlug(input.title),
    prompt,
  });
  throwIfAborted(input.signal);

  return { asset, prompt };
}
