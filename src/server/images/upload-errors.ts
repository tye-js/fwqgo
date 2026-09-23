/**
 * 上传链路的类型化错误，以及「错误 → HTTP 响应」的映射。
 *
 * ## 为什么需要这个文件
 *
 * `routes/api/upload/route.ts` 原来靠字符串匹配决定状态码：
 *
 * ```ts
 * const status = message.includes("too large") ? 413
 *   : message.includes("Invalid file type") ? 415
 *   : message.includes("Invalid upload path") ? 400
 *   : 500;
 * ```
 *
 * 只要上游任何一句提示文案改动（哪怕只是翻译成中文），**413 就会静默变成 500** ——
 * 类型检查与测试都拦不住，因为「语义」被编码在了人写的英文句子里。
 * 而且非 500 分支把内部 `message` 直接回显给客户端。
 *
 * 现在：上游抛这里的类型化错误，路由用 `instanceof` 判断，面向用户的文案也由这里统一给。
 * 上传体积上限与允许的 MIME 类型同样以本文件为准（原来散落在 `assets.ts` 与前端组件里）。
 */
export const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export function isAllowedUploadMimeType(mime: string) {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime);
}

function formatMegabytes(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/** 415：MIME 不在白名单里。 */
export class UnsupportedMediaTypeError extends Error {
  constructor() {
    super(
      `不支持的图片格式，仅支持 ${ALLOWED_UPLOAD_MIME_TYPES.map((mime) => mime.replace("image/", "").toUpperCase()).join(" / ")}`,
    );
    this.name = "UnsupportedMediaTypeError";
  }
}

/** 413：单张图片超过上限。 */
export class UploadTooLargeError extends Error {
  constructor(limitBytes: number = MAX_UPLOAD_SIZE_BYTES) {
    super(`图片文件过大，单张最大 ${formatMegabytes(limitBytes)}`);
    this.name = "UploadTooLargeError";
  }
}

/** 400：上传路径不合法（缺 `/uploads/` 前缀、文件名是 `.` / `..` 等）。 */
export class InvalidUploadPathError extends Error {
  constructor(message = "上传路径无效，请重新选择文件后再试") {
    super(message);
    this.name = "InvalidUploadPathError";
  }
}

export type UploadApiError = {
  status: 400 | 413 | 415;
  /** 面向用户的文案，不含内部细节。 */
  message: string;
  title: string;
  suggestion: string;
};

/**
 * 把上传链路抛出的错误映射成 HTTP 响应。**返回 null 表示不是可识别的上传错误**，
 * 调用方应把它当作 500 处理并写服务端日志。
 */
export function toUploadApiError(error: unknown): UploadApiError | null {
  if (error instanceof UploadTooLargeError) {
    return {
      status: 413,
      message: error.message,
      title: "上传图片失败",
      suggestion: `单张图片不能超过 ${formatMegabytes(MAX_UPLOAD_SIZE_BYTES)}，请压缩后再上传。`,
    };
  }

  if (error instanceof UnsupportedMediaTypeError) {
    return {
      status: 415,
      message: error.message,
      title: "上传图片失败",
      suggestion: "请选择 JPEG、PNG、WebP 或 GIF 格式的图片。",
    };
  }

  if (error instanceof InvalidUploadPathError) {
    return {
      status: 400,
      message: error.message,
      title: "上传图片失败",
      suggestion: "请重新选择文件后再试；如果持续失败，请联系管理员检查上传目录配置。",
    };
  }

  return null;
}
