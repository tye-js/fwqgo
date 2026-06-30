import { sanitizeFileName } from "@/lib/utils";
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
  uploadedBy: string | null;
  configId?: number;
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
  input: Pick<GenerateCoverInput, "title" | "description" | "keywords" | "content">,
) {
  const contentText = stripHtml(input.content ?? "").slice(0, 1200);

  return template
    .replaceAll("{title}", input.title.trim())
    .replaceAll("{description}", input.description?.trim() ?? "")
    .replaceAll("{keywords}", input.keywords?.trim() ?? "")
    .replaceAll("{content}", contentText);
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
  if (typeof payload.image === "string" && /^https?:\/\//i.test(payload.image)) {
    return payload.image;
  }
  return null;
}

function findBase64Image(payload: ImageGenerationResponse): string | null {
  if (payload.data?.[0]?.b64_json) return payload.data[0].b64_json;
  if (payload.b64_json) return payload.b64_json;
  if (typeof payload.image === "string" && !/^https?:\/\//i.test(payload.image)) {
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

async function downloadImage(url: string, timeoutSeconds: number) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  });

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}`);
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

  const prompt = fillPromptTemplate(config.promptTemplate, input);
  const endpoint = buildEndpoint(config.baseUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
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

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `生图接口请求失败：HTTP ${response.status} ${text.slice(0, 240)}`,
    );
  }

  let payload: ImageGenerationResponse;
  try {
    payload = JSON.parse(text) as ImageGenerationResponse;
  } catch {
    throw new Error("生图接口返回的不是有效 JSON");
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
    throw new Error("生图接口没有返回图片 URL 或 base64 图片数据");
  }

  const asset = await createImageAssetFromBuffer({
    buffer: image.buffer,
    mime: image.mime,
    originalName: `${sanitizeFileName(input.title)}-cover.png`,
    uploadedBy: input.uploadedBy,
  });

  return { asset, prompt };
}
