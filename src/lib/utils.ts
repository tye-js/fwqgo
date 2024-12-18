import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  const processedText = text
    .trim()
    // 移除特殊字符和标点符号
    .replace(/[：，。！？「」（）\[\]{}|@#$%^&*+=\\/<>～｜、；'："】【]/g, "")
    // 替换冒号和空格为连字符
    .replace(/[:：\s]+/g, "-")
    // 移除字母数字之外的字符，但保留中文和连字符
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    // 转换为小写
    .toLowerCase()
    // 移除连续的连字符
    .replace(/-+/g, "-")
    // 移除首尾的连字符
    .replace(/^-+|-+$/g, "")
    // 限制长度
    .substring(0, 40);

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

export function formatDate(date: Date) {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function decodeSlug(url: string) {
  return decodeURIComponent(url);
}

export function sanitizeFileName(fileName: string) {
  // 获取文件扩展名
  const lastDotIndex = fileName.lastIndexOf(".");
  const ext = lastDotIndex !== -1 ? fileName.slice(lastDotIndex) : "";
  const nameWithoutExt =
    lastDotIndex !== -1 ? fileName.slice(0, lastDotIndex) : fileName;

  // 编码文件名（不包括扩展名）
  const encodedName = encodeURIComponent(nameWithoutExt);

  // 限制编码后的文件名长度（保留扩展名）
  const maxLength = 200 - ext.length;
  const truncatedName =
    encodedName.length > maxLength
      ? encodedName.slice(0, maxLength)
      : encodedName;

  // 返回处理后的文件名（带扩展名）
  return `${truncatedName}${ext}`;
}
