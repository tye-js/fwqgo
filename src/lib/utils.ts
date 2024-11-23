import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  const processedText = text
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
    .substring(0, 20);

  // URL 编码，处理中文字符
  return processedText
    .split("")
    .map((char) => {
      // 如果是英文字母、数字或连字符，保持原样
      if (/[a-z0-9-]/.test(char)) return char;
      // 其他字符（包括中文）进行 URL 编码
      return encodeURIComponent(char);
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
