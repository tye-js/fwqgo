import { readResponseBodyWithLimit } from "./bounded-response-body";

export type ImageGenerationResponse = {
  data?: unknown;
  image?: unknown;
  image_url?: unknown;
  url?: unknown;
  data_url?: unknown;
  result_url?: unknown;
  b64_json?: unknown;
  base64?: unknown;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectResultRecords(
  value: unknown,
  depth = 0,
): Array<Record<string, unknown>> {
  if (depth > 3) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectResultRecords(item, depth + 1));
  }

  const record = asRecord(value);
  if (!record) return [];

  return [
    record,
    ...collectResultRecords(record.data, depth + 1),
    ...collectResultRecords(record.output, depth + 1),
  ];
}

function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function looksLikeImageUrl(value: string) {
  return (
    /^https?:\/\//i.test(value) ||
    /^\.{1,2}\//.test(value) ||
    (value.startsWith("/") && !isValidRawBase64(value))
  );
}

function parseUrlCandidate(value: unknown) {
  const candidate = toNonEmptyString(value);
  if (!candidate) return null;
  if (DATA_URI_PATTERN.test(candidate)) return decodeBase64Image(candidate);
  if (looksLikeImageUrl(candidate)) {
    return { kind: "url", value: candidate } as const;
  }
  if (isValidRawBase64(candidate)) return decodeBase64Image(candidate);
  return null;
}

function parseBase64Candidate(value: unknown) {
  const candidate = toNonEmptyString(value);
  return candidate ? decodeBase64Image(candidate) : null;
}

function parseAmbiguousCandidate(value: unknown) {
  const candidate = toNonEmptyString(value);
  if (!candidate) return null;
  if (DATA_URI_PATTERN.test(candidate) || isValidRawBase64(candidate)) {
    return decodeBase64Image(candidate);
  }
  return looksLikeImageUrl(candidate)
    ? ({ kind: "url", value: candidate } as const)
    : null;
}

export function extractGeneratedImageSource(
  payload: ImageGenerationResponse,
): GeneratedImageSource | null {
  const root = asRecord(payload);
  if (!root) return null;

  // OpenAI-compatible relays commonly wrap the actual result in data[], while
  // some image2 relays use data.data[] or output[]. Inspect those first, then
  // fall back to top-level fields.
  const records = [
    ...collectResultRecords(root.data),
    root,
    ...collectResultRecords(root.output),
  ];

  for (const record of records) {
    for (const field of ["url", "image_url", "data_url", "result_url"]) {
      const source = parseUrlCandidate(record[field]);
      if (source) return source;
    }

    for (const field of ["b64_json", "base64"]) {
      const source = parseBase64Candidate(record[field]);
      if (source) return source;
    }

    for (const field of ["image", "result"]) {
      const source = parseAmbiguousCandidate(record[field]);
      if (source) return source;
    }
  }

  return null;
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
