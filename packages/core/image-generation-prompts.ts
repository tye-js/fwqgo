export const defaultCoverPromptTemplate = `为服务器/VPS推广文章生成一张专业封面图。

文章标题（核心主题）：{title}
文章摘要：{description}
关键词：{keywords}
结构化视觉简报：
{visualBrief}

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
- English title and core subject: {title}
- English summary: {description}
- English keywords: {keywords}
- Structured visual brief:
{visualBrief}`;

const REMOVED_COVER_PLACEHOLDER_PATTERN = /\{content\}/i;

export type CoverVisualBrief = {
  title: string;
  brands: string[];
  regions: string[];
  productTypes: string[];
  specifications: string[];
  promotionThemes: string[];
  language: "zh" | "en";
  forbiddenElements: string[];
};

export type CoverVisualBriefOverrides = Partial<
  Omit<CoverVisualBrief, "language" | "forbiddenElements">
> & {
  forbiddenElements?: string[];
};

const SYSTEM_FORBIDDEN_ELEMENTS = [
  "watermarks",
  "QR codes",
  "Taiwan flag",
  "Republic of China flag",
  "visually similar flag elements",
];

function uniqueMatches(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function matchPatterns(source: string, patterns: RegExp[]) {
  return uniqueMatches(
    patterns.flatMap((pattern) =>
      [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))]
        .map((match) => match[0]),
    ),
  );
}

export function extractCoverVisualBrief(input: {
  title: string;
  description?: string | null;
  keywords?: string | null;
  content?: string | null;
  language?: "zh" | "en";
  knownBrands?: string[];
}): CoverVisualBrief {
  const source = [input.title, input.description, input.keywords, input.content]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .replace(/<[^>]+>/g, " ");
  const lowerSource = source.toLowerCase();
  const brands = uniqueMatches(
    (input.knownBrands ?? []).filter((brand) =>
      lowerSource.includes(brand.trim().toLowerCase()),
    ),
  );

  return {
    title: input.title.trim(),
    brands,
    regions: matchPatterns(source, [
      /(?:香港|日本|东京|大阪|新加坡|美国|洛杉矶|圣何塞|西雅图|达拉斯|纽约|德国|法兰克福|英国|伦敦|荷兰|阿姆斯特丹|Canada|Toronto|Vancouver|Hong Kong|Tokyo|Osaka|Singapore|Los Angeles|San Jose|Seattle|Dallas|New York|Frankfurt|London|Amsterdam)/gi,
    ]),
    productTypes: matchPatterns(source, [
      /(?:VPS|云服务器|独立服务器|裸金属服务器|专用服务器|虚拟主机|Cloud Server|Dedicated Server|Bare Metal|Web Hosting)/gi,
    ]),
    specifications: matchPatterns(source, [
      /\b\d+(?:\.\d+)?\s*(?:GB|TB|MB|Mbps|Gbps|GHz|vCPU|CPU|Core|Cores)\b/gi,
      /(?:CN2\s*GIA|CN2|CMI|CUVIP|AS9929|BGP|NVMe|SSD|HDD|IPv4|IPv6)/gi,
    ]),
    promotionThemes: matchPatterns(source, [
      /(?:优惠|折扣|促销|特价|限时|黑五|双十一|周年庆|年付|月付|免费升级|coupon|promo(?:tion)?|discount|sale|Black Friday|limited time)/gi,
    ]),
    language: input.language === "en" ? "en" : "zh",
    forbiddenElements: [...SYSTEM_FORBIDDEN_ELEMENTS],
  };
}

export function mergeCoverVisualBrief(
  automatic: CoverVisualBrief,
  overrides?: CoverVisualBriefOverrides | null,
): CoverVisualBrief {
  const overrideTitle = overrides?.title?.trim();
  return {
    ...automatic,
    title: overrideTitle?.length ? overrideTitle : automatic.title,
    brands: overrides?.brands?.length
      ? uniqueMatches(overrides.brands)
      : automatic.brands,
    regions: overrides?.regions?.length
      ? uniqueMatches(overrides.regions)
      : automatic.regions,
    productTypes: overrides?.productTypes?.length
      ? uniqueMatches(overrides.productTypes)
      : automatic.productTypes,
    specifications: overrides?.specifications?.length
      ? uniqueMatches(overrides.specifications)
      : automatic.specifications,
    promotionThemes: overrides?.promotionThemes?.length
      ? uniqueMatches(overrides.promotionThemes)
      : automatic.promotionThemes,
    forbiddenElements: uniqueMatches([
      ...automatic.forbiddenElements,
      ...(overrides?.forbiddenElements ?? []),
      ...SYSTEM_FORBIDDEN_ELEMENTS,
    ]),
  };
}

export function formatCoverVisualBrief(brief: CoverVisualBrief) {
  const empty = brief.language === "en" ? "not explicitly stated" : "未明确提供";
  const rows: Array<[string, string | string[]]> = [
    [brief.language === "en" ? "Title" : "标题", brief.title],
    [brief.language === "en" ? "Brands" : "品牌", brief.brands],
    [brief.language === "en" ? "Regions" : "地区", brief.regions],
    [brief.language === "en" ? "Product types" : "产品类型", brief.productTypes],
    [brief.language === "en" ? "Specifications" : "关键规格", brief.specifications],
    [brief.language === "en" ? "Promotion" : "促销主题", brief.promotionThemes],
    [brief.language === "en" ? "Language" : "语言", brief.language],
    [brief.language === "en" ? "Forbidden" : "禁用元素", brief.forbiddenElements],
  ];
  return rows
    .map(([label, value]) => `- ${label}: ${Array.isArray(value) ? value.join(", ") || empty : value || empty}`)
    .join("\n");
}

export function renderCoverPromptTemplate(
  template: string,
  input: {
    title: string;
    description?: string | null;
    keywords?: string | null;
    visualBrief: CoverVisualBrief;
  },
) {
  return template
    .split(/\r?\n/)
    .filter((line) => !REMOVED_COVER_PLACEHOLDER_PATTERN.test(line))
    .join("\n")
    .replaceAll("{title}", input.title.trim())
    .replaceAll("{description}", input.description?.trim() ?? "")
    .replaceAll("{keywords}", input.keywords?.trim() ?? "")
    .replaceAll("{visualBrief}", formatCoverVisualBrief(input.visualBrief))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildArticleCoverPrompt(
  promptTemplate: string,
  englishPromptTemplate: string,
  input: {
    language?: "zh" | "en";
    title: string;
    description?: string | null;
    keywords?: string | null;
    content?: string | null;
    knownBrands?: string[];
    visualBrief?: CoverVisualBrief;
    visualBriefOverrides?: CoverVisualBriefOverrides | null;
  },
) {
  const visualBrief =
    input.visualBrief ??
    mergeCoverVisualBrief(extractCoverVisualBrief(input), input.visualBriefOverrides);
  const renderInput = { ...input, title: visualBrief.title, visualBrief };
  if (input.language === "en") {
    return [
      renderCoverPromptTemplate(englishPromptTemplate, renderInput),
      getMandatoryCoverVisualRules("en"),
    ].join("\n\n");
  }

  return [
    renderCoverPromptTemplate(promptTemplate, renderInput),
    [
      "Chinese article cover rules:",
      "- This cover is for a Chinese article and Chinese public page.",
      "- If readable text appears, use Simplified Chinese only, except standard technical abbreviations such as VPS, CPU, RAM, SSD, GB, and TB.",
    ].join("\n"),
    getMandatoryCoverVisualRules("zh"),
  ].join("\n\n");
}

export function getMandatoryCoverVisualRules(language: "zh" | "en") {
  return language === "en"
    ? "Mandatory visual restriction: Do not depict the Taiwan flag, the Republic of China flag, or visually similar flag elements."
    : "强制画面限制：不要出现台湾旗帜、中华民国旗帜或任何近似旗帜元素。";
}
