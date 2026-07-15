import { readResponseBodyWithLimit } from "./bounded-response-body";

export type ImageGenerationResponse = {
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

export type GeneratedImageSource =
  | { kind: "url"; value: string }
  | { kind: "bytes"; bytes: Uint8Array; mime: string };

const SUPPORTED_IMAGE_MIMES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const DATA_URI_PATTERN = /^data:([^;,]+);base64,([\s\S]*)$/i;
const RAW_BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function normalizeImageMime(value: string) {
  const mime = value.trim().toLowerCase();
  return mime === "image/jpg" ? "image/jpeg" : mime;
}

function normalizeRawBase64(value: string) {
  return value.replace(/\s+/g, "");
}

function sniffImageMime(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a"
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 6 &&
    String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a"
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function isValidRawBase64(value: string) {
  const normalized = normalizeRawBase64(value);
  return (
    normalized.length >= 4 &&
    normalized.length % 4 !== 1 &&
    RAW_BASE64_PATTERN.test(normalized)
  );
}

function decodeBase64Image(value: string, fallbackMime = "image/png") {
  const trimmed = value.trim();
  const dataUri = DATA_URI_PATTERN.exec(trimmed);
  const mime = normalizeImageMime(dataUri?.[1] ?? fallbackMime);
  const encoded = normalizeRawBase64(dataUri?.[2] ?? trimmed);

  if (!SUPPORTED_IMAGE_MIMES.has(mime)) {
    throw new Error(`生图接口返回了不支持的图片格式：${mime || "未知"}`);
  }

  if (!isValidRawBase64(encoded)) {
    throw new Error("生图接口返回的 base64 图片数据格式无效");
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0) {
    throw new Error("生图接口返回了空的 base64 图片数据");
  }
  const detectedMime = sniffImageMime(bytes);
  if (!detectedMime) {
    throw new Error(
      "生图接口返回的 base64 数据不是有效的 PNG、JPEG、GIF 或 WebP 图片",
    );
  }
  if (dataUri && mime !== detectedMime) {
    throw new Error(
      `生图接口返回的图片格式不一致：声明为 ${mime}，实际为 ${detectedMime}`,
    );
  }

  return { kind: "bytes", bytes, mime: detectedMime } as const;
}

function firstNonEmpty(values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? null;
}

export function extractGeneratedImageSource(
  payload: ImageGenerationResponse,
): GeneratedImageSource | null {
  const explicitUrl = firstNonEmpty([
    payload.data?.[0]?.url,
    payload.image_url,
    payload.url,
  ]);
  if (explicitUrl) return { kind: "url", value: explicitUrl };

  const explicitBase64 = firstNonEmpty([
    payload.data?.[0]?.b64_json,
    payload.b64_json,
  ]);
  if (explicitBase64) return decodeBase64Image(explicitBase64);

  const ambiguousImage = payload.image?.trim();
  if (!ambiguousImage) return null;

  if (DATA_URI_PATTERN.test(ambiguousImage)) {
    return decodeBase64Image(ambiguousImage);
  }

  if (
    /^https?:\/\//i.test(ambiguousImage) ||
    /^\.{1,2}\//.test(ambiguousImage) ||
    (ambiguousImage.startsWith("/") && !isValidRawBase64(ambiguousImage))
  ) {
    return { kind: "url", value: ambiguousImage };
  }

  return decodeBase64Image(ambiguousImage);
}

export async function readGeneratedImageResponse(
  response: Response,
  maxBytes: number,
) {
  const declaredMime = normalizeImageMime(
    response.headers.get("content-type")?.split(";")[0] ?? "",
  );
  const bytes = await readResponseBodyWithLimit(response, maxBytes);
  if (!bytes) {
    throw new Error(
      `图片下载失败：文件超过 ${Math.ceil(maxBytes / 1024 / 1024)} MB 限制`,
    );
  }
  if (bytes.length === 0) {
    throw new Error("图片下载失败：服务器返回了空文件");
  }
  const detectedMime = sniffImageMime(bytes);
  if (!detectedMime) {
    throw new Error(
      `图片下载返回的不是有效 PNG、JPEG、GIF 或 WebP 图片：Content-Type ${declaredMime || "缺失"}`,
    );
  }
  if (
    SUPPORTED_IMAGE_MIMES.has(declaredMime) &&
    declaredMime !== detectedMime
  ) {
    throw new Error(
      `图片下载格式不一致：Content-Type 为 ${declaredMime}，实际为 ${detectedMime}`,
    );
  }

  return { bytes, mime: detectedMime };
}
