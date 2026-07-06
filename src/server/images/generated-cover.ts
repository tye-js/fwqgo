import { sanitizeFileName } from "@fwqgo/core/utils";
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

type ImageGenerationResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  image?: string;
  image_url?: string;
  url?: string;
  b64_json?: string;
  output?: unknown;
};

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
  input: Pick<GenerateCoverInput, "language" | "title">,
) {
  if (input.language === "en") {
    return [
      "English article cover rules:",
      "- This cover is for an English article and English public page.",
      "- Ignore any earlier wording that implies a Chinese website, Chinese audience, or Chinese typography.",
      "- Do not render Chinese characters anywhere in the image.",
      "- If the image includes readable text, labels, UI fragments, or headline typography, it must be English only.",
      `- Any visible headline text must be based on this English title: ${input.title.trim()}`,
      "- Prefer no readable text if the model cannot render clean English.",
    ].join("\n");
  }

  return [
    "Chinese article cover rules:",
    "- This cover is for a Chinese article and Chinese public page.",
    "- If readable text appears, use Simplified Chinese only, except standard technical abbreviations such as VPS, CPU, RAM, SSD, GB, and TB.",
  ].join("\n");
}

function buildCoverPrompt(template: string, input: GenerateCoverInput) {
  return `${fillPromptTemplate(template, input)}\n\n${buildLanguagePromptRules(input)}`;
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

function buildEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (/\/v1\/images\/generations$/i.test(normalized)) return normalized;
  if (/\/images\/generations$/i.test(normalized)) return normalized;
  return `${normalized}/v1/images/generations`;
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

function findImageUrl(payload: ImageGenerationResponse): string | null {
  if (payload.data?.[0]?.url) return payload.data[0].url;
  if (payload.image_url) return payload.image_url;
  if (payload.url) return payload.url;
  if (
    typeof payload.image === "string" &&
    /^https?:\/\//i.test(payload.image)
  ) {
    return payload.image;
  }
  return null;
}

function findBase64Image(payload: ImageGenerationResponse): string | null {
  if (payload.data?.[0]?.b64_json) return payload.data[0].b64_json;
  if (payload.b64_json) return payload.b64_json;
  if (
    typeof payload.image === "string" &&
    !/^https?:\/\//i.test(payload.image)
  ) {
    return payload.image;
  }
  return null;
}

function inferMimeFromResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (contentType?.startsWith("image/")) return contentType;
  return "image/png";
}

function normalizeBase64(value: string) {
  const commaIndex = value.indexOf(",");
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
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

function getJsonErrorMessage(text: string) {
  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string; code?: string | number; type?: string };
      message?: string;
      detail?: string;
    };
    const message =
      payload.error?.message ?? payload.message ?? payload.detail ?? "";
    const code = payload.error?.code ? `（${payload.error.code}）` : "";
    return message ? `${message}${code}` : "";
  } catch {
    return "";
  }
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

  const prompt = buildCoverPrompt(config.promptTemplate, input);
  const safeEndpoint = await assertPublicHttpUrl(
    buildEndpoint(config.baseUrl),
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

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    mime: inferMimeFromResponse(response),
  };
}

export async function generateArticleCoverImage(
  input: GenerateCoverInput,
): Promise<{ asset: ImageAssetRow; prompt: string }> {
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

  const prompt = buildCoverPrompt(config.promptTemplate, input);
  const endpoint = buildEndpoint(config.baseUrl);
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
    if (isTimeoutError(error)) {
      throw new Error(
        `生图接口请求超时：${config.timeoutSeconds} 秒内没有返回结果。请调大「生图配置」里的超时时间，或检查模型/中转服务是否可用`,
      );
    }

    throw new Error(
      `生图接口连接失败：${getErrorMessage(error)}。请检查 Base URL、网络和中转服务状态`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    const providerMessage = getJsonErrorMessage(text);
    throw new Error(
      providerMessage
        ? `生图接口请求失败：HTTP ${response.status} ${response.statusText}；${providerMessage}`
        : `生图接口请求失败：HTTP ${response.status} ${response.statusText}；返回内容：${text.slice(0, 240) || "空"}`,
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

  const imageUrl = findImageUrl(payload);
  const base64Image = findBase64Image(payload);
  const image = imageUrl
    ? await downloadImage(imageUrl, config.timeoutSeconds)
    : base64Image
      ? {
          buffer: Buffer.from(normalizeBase64(base64Image), "base64"),
          mime: "image/png",
        }
      : null;

  if (!image) {
    throw new Error(
      `生图接口没有返回图片 URL 或 base64 图片数据；${summarizeJsonShape(payload)}`,
    );
  }

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

  return { asset, prompt };
}
