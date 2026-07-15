export const defaultCoverPromptTemplate = `为服务器/VPS推广文章生成一张专业封面图。

文章摘要：{description}
关键词：{keywords}

画面要求：
- 主题必须围绕云服务器、VPS、数据中心、网络线路、优惠促销。
- 风格清晰、现代、科技感，适合专业服务器测评网站。
- 不要出现水印和二维码。
- 画面留出适合文章卡片裁切的中心主体，横版 16:9。`;

export const defaultEnglishCoverPromptTemplate = `English article cover override (highest priority):
- These rules override earlier conflicting instructions, including references to a Chinese website, Chinese typography, or "no readable text".
- This cover is for an English article and English public page.
- Do not render Chinese characters anywhere in the image.
- Useful fact labels include provider, region, CPU, RAM, storage, bandwidth, network route, price, or discount, but only when explicitly present in the source information below.
- Do not invent brands, prices, discounts, specifications, locations, or performance claims.
- Avoid paragraphs, tiny text, fake dashboards.

Source information to preserve:
- English summary: {description}
- English keywords: {keywords}`;

const REMOVED_COVER_PLACEHOLDER_PATTERN = /\{(?:title|content)\}/i;

export function renderCoverPromptTemplate(
  template: string,
  input: { description?: string | null; keywords?: string | null },
) {
  return template
    .split(/\r?\n/)
    .filter((line) => !REMOVED_COVER_PLACEHOLDER_PATTERN.test(line))
    .join("\n")
    .replaceAll("{description}", input.description?.trim() ?? "")
    .replaceAll("{keywords}", input.keywords?.trim() ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getMandatoryCoverVisualRules(language: "zh" | "en") {
  return language === "en"
    ? "Mandatory visual restriction: Do not depict the Taiwan flag, the Republic of China flag, or visually similar flag elements."
    : "强制画面限制：不要出现台湾旗帜、中华民国旗帜或任何近似旗帜元素。";
}
