import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  const processedText = text
    .trim()
    // 仅保留数字内部的小数点，避免 1.99 被错误转换为 199
    .replace(/(?<![0-9])\.|\.(?![0-9])/g, "")
    // 移除特殊字符和标点符号
    .replace(/[：，。！？「」（）\[\]{}|@#$%^&*+=\\/<>～｜、；'："】【]/g, "")
    // 替换冒号和空格为连字符
    .replace(/[:：\s]+/g, "-")
    // 移除字母数字之外的字符，但保留中文、连字符和小数点
    .replace(/[^\w\u4e00-\u9fa5.-]/g, "")
    // 转换为小写
    .toLowerCase()
    // 移除连续的连字符
    .replace(/-+/g, "-")
    // 移除首尾的连字符
    .replace(/^-+|-+$/g, "")
    // 限制长度
    .substring(0, 40)
    // 避免长度截断后留下不完整的小数点
    .replace(/\.$/, "");

  // URL 编码，处理中文字符
  return processedText
    .split("")
    .map((char) => {
      // 如果是英文字母、数字或连字符，保持原样
      if (/[a-z0-9-]/.test(char)) return char;
      // 其他字符（包括中文）进行 URL 编码
      return char;
    })
    .join("");
}

export function formatDate(date: Date | string, locale = "zh-CN") {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";

  return value.toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function decodeSlug(url: string) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

export function normalizeDecodedSlug(value: string | null | undefined) {
  if (!value) return null;
  const decoded = decodeSlug(value).trim();
  return decoded.length > 0 ? decoded : null;
}

export function parsePositiveInt(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export const MAX_POSTGRES_INTEGER = 2_147_483_647;

export function parsePostgresIntegerId(
  value: string | number | null | undefined,
) {
  const parsed = parsePositiveInt(value);
  return parsed !== null && parsed <= MAX_POSTGRES_INTEGER ? parsed : null;
}

export function isInternalHref(
  href: string | null | undefined,
): href is string {
  return Boolean(href?.startsWith("/") && !href.startsWith("//"));
}

export function isHttpHref(href: string | null | undefined): href is string {
  if (!href) return false;

  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSafePublicHref(href: string | null | undefined) {
  return isInternalHref(href) || isHttpHref(href);
}

export function jsonLdScriptContent(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function toAbsoluteHttpUrl(
  href: string | null | undefined,
  baseUrl: string,
) {
  if (!href) return null;

  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeFileName(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");
  const rawExt = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : "";
  const ext = rawExt.replace(/[^.a-zA-Z0-9_-]/g, "").slice(0, 20);
  const nameWithoutExt =
    lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
  const maxLength = Math.max(1, 200 - ext.length);
  let encodedName = "";

  for (const character of nameWithoutExt.normalize("NFC")) {
    const encodedCharacter = encodeURIComponent(character).replace(
      /[!'()*]/g,
      (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    if (encodedName.length + encodedCharacter.length > maxLength) break;
    encodedName += encodedCharacter;
  }

  return `${encodedName || "file"}${ext}`;
}

// 判断时间是不是24小时内
export function isWithin24Hours(date: Date) {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  if (diffTime < 0) return false;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= 1;
}
