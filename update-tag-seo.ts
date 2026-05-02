import { eq, sql } from "drizzle-orm";
import { db } from "./src/server/db/index.ts";
import { tags } from "./src/server/db/schema.ts";

const LOCATION_TERMS = [
  "中国香港",
  "中国台湾",
  "洛杉矶",
  "圣何塞",
  "西雅图",
  "新加坡",
  "马来西亚",
  "澳大利亚",
  "西班牙",
  "罗马尼亚",
  "纽约",
  "香港",
  "台湾",
  "美国",
  "日本",
  "韩国",
  "英国",
  "德国",
  "荷兰",
  "欧洲",
  "大陆",
  "中国",
];

const PRODUCT_TERMS = [
  "站群服务器",
  "独立服务器",
  "云服务器",
  "共享VPS",
  "独享VPS",
  "Storage VPS",
  "存储VPS",
  "服务器",
  "VDS",
  "VPS",
  "IP",
];

const NETWORK_TERMS = [
  "CN2 GIA",
  "CN2",
  "AS9929",
  "AS4837",
  "4837",
  "CUII",
  "CMIN2",
  "BGP",
  "HGC",
  "IIJ",
  "LG",
  "优化线路",
  "大陆优化",
  "国际线路",
  "混合线路",
];

const FEATURE_TERMS = [
  "原生IP",
  "住宅IP",
  "住宅VPS",
  "住宅服务器",
  "家庭IP",
  "家庭VPS",
  "双ISP",
  "静态住宅IP",
  "动态IP",
  "高防",
  "DDoS防御",
  "CC拦截",
  "大带宽",
  "不限流量",
  "免费IPv6",
  "免费快照",
  "免费备份",
  "块存储",
  "Windows",
  "ChatGPT",
  "TikTok",
  "流媒体",
  "Shopee",
  "亚马逊电商",
  "海外电商",
  "建站",
  "免备案",
  "免实名",
  "站群",
  "KVM",
];

const MERCHANT_SUFFIXES = [
  "优惠码",
  "优惠",
  "怎么样",
  "好不好",
  "测评",
  "评测",
  "官网",
  "官方网站",
  "机房",
  "测速",
  "测试",
];

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function dedupeKeywords(keywords: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.replace(/\s+/g, " ").trim();

    if (!normalizedKeyword) {
      continue;
    }

    const key = normalizedKeyword.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalizedKeyword);
  }

  return result;
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function containsTerm(name: string, term: string) {
  return name.toLowerCase().includes(term.toLowerCase());
}

function canCombineTerms(left: string, right: string) {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();

  return (
    normalizedLeft !== normalizedRight &&
    !normalizedLeft.includes(normalizedRight) &&
    !normalizedRight.includes(normalizedLeft)
  );
}

function extractTerms(name: string, terms: string[]) {
  return terms.filter((term) => containsTerm(name, term));
}

function getMainProduct(name: string) {
  return PRODUCT_TERMS.find((term) => containsTerm(name, term)) ?? "服务器";
}

function getScenarios(name: string) {
  if (
    ["原生IP", "住宅IP", "住宅VPS", "家庭IP", "家庭VPS", "双ISP"].some((term) =>
      containsTerm(name, term),
    )
  ) {
    return "跨境电商、社媒运营、广告投放和账号环境隔离";
  }

  if (
    ["高防", "DDoS防御", "CC拦截"].some((term) => containsTerm(name, term))
  ) {
    return "高防防护、游戏业务和易受攻击站点";
  }

  if (
    ["TikTok", "ChatGPT", "流媒体", "Shopee", "亚马逊电商", "海外电商"].some(
      (term) => containsTerm(name, term),
    )
  ) {
    return "跨境运营、流媒体访问、AI服务访问和电商业务";
  }

  if (
    ["CN2", "AS9929", "CUII", "CMIN2", "BGP", "优化线路", "国际线路"].some(
      (term) => containsTerm(name, term),
    )
  ) {
    return "大陆优化访问、低延迟建站和国际线路业务";
  }

  if (
    ["大带宽", "不限流量", "Storage VPS", "存储VPS", "块存储"].some((term) =>
      containsTerm(name, term),
    )
  ) {
    return "下载分发、备份存储和高并发访问";
  }

  if (["站群", "多IP"].some((term) => containsTerm(name, term))) {
    return "站群项目、多站点部署和 SEO 业务";
  }

  return "建站部署、跨境业务和日常服务器选购";
}

function getMerchantSuffix(name: string) {
  return MERCHANT_SUFFIXES.find((suffix) => name.endsWith(suffix)) ?? null;
}

function getMerchantBase(name: string) {
  const suffix = getMerchantSuffix(name);

  if (!suffix) {
    return null;
  }

  return normalizeName(name.slice(0, -suffix.length)).replace(/[-/]+$/g, "").trim();
}

function isMerchantTag(name: string) {
  const normalizedName = normalizeName(name);
  const hasMerchantSuffix = getMerchantBase(normalizedName);

  if (hasMerchantSuffix) {
    return true;
  }

  const hasAsciiBrand = /[a-z]/i.test(normalizedName);
  const hasGenericTopic = [...PRODUCT_TERMS, ...NETWORK_TERMS, ...FEATURE_TERMS].some(
    (term) => containsTerm(normalizedName, term),
  );

  if (hasAsciiBrand && !hasGenericTopic) {
    return true;
  }

  if (
    !hasGenericTopic &&
    normalizedName.length <= 10 &&
    !LOCATION_TERMS.some((term) => containsTerm(normalizedName, term))
  ) {
    return true;
  }

  return false;
}

function buildMerchantSeo(name: string) {
  const normalizedName = normalizeName(name);
  const suffix = getMerchantSuffix(normalizedName);
  const baseName = getMerchantBase(normalizedName) ?? normalizedName;

  let description = `${baseName} 标签页汇总 ${baseName} 商家介绍、产品方案、优惠活动、优惠码、购买入口与用户口碑内容，方便快速了解 ${baseName} 的 VPS、云服务器和独立服务器动态。`;

  if (suffix === "优惠码") {
    description = `${normalizedName} 标签页聚合 ${baseName} 最新优惠码、折扣码、促销活动、购买教程与产品推荐，方便及时获取 ${baseName} VPS、云服务器和独立服务器优惠信息。`;
  } else if (suffix === "优惠") {
    description = `${normalizedName} 标签页汇总 ${baseName} 最新优惠活动、折扣方案、促销套餐和热门产品配置，适合关注 ${baseName} 服务器性价比与购买时机的用户。`;
  } else if (suffix === "官网" || suffix === "官方网站") {
    description = `${normalizedName} 标签页整理 ${baseName} 官网入口、产品介绍、套餐信息、优惠活动和购买指引，方便快速访问 ${baseName} 官方页面并了解服务器方案。`;
  } else if (
    suffix === "测评" ||
    suffix === "评测" ||
    suffix === "测试" ||
    suffix === "测速" ||
    suffix === "机房" ||
    suffix === "怎么样" ||
    suffix === "好不好"
  ) {
    description = `${normalizedName} 标签页聚合 ${baseName} 测评、线路测试、机房信息、性能表现、稳定性分析和真实使用体验，方便判断 ${baseName} 是否适合当前业务需求。`;
  }

  const keywords = dedupeKeywords([
    normalizedName,
    baseName,
    `${baseName}优惠码`,
    `${baseName}优惠`,
    `${baseName}促销`,
    `${baseName}官网`,
    `${baseName}评测`,
    `${baseName}测评`,
    `${baseName} VPS`,
    `${baseName}云服务器`,
    `${baseName}服务器`,
    `${baseName}独立服务器`,
  ]);

  return {
    description: truncateText(description, 780),
    keywords: truncateText(keywords.join(","), 780),
  };
}

function buildTopicSeo(name: string) {
  const normalizedName = normalizeName(name);
  const locations = extractTerms(normalizedName, LOCATION_TERMS);
  const networks = extractTerms(normalizedName, NETWORK_TERMS);
  const features = extractTerms(normalizedName, FEATURE_TERMS);
  const mainProduct = getMainProduct(normalizedName);
  const scenarios = getScenarios(normalizedName);

  const focusParts = dedupeKeywords([
    ...locations,
    ...networks,
    ...features,
    mainProduct,
  ]);

  const focusText =
    focusParts.length > 0
      ? focusParts.join("、")
      : `${normalizedName} 相关服务器与线路方案`;

  const description = truncateText(
    `${normalizedName} 标签页汇总与 ${focusText} 相关的最新优惠活动、配置方案、线路特点、性能测试和选购建议，适合关注 ${scenarios} 的用户快速筛选相关产品。`,
    780,
  );

  const keywordCandidates = [
    normalizedName,
    normalizedName.toLowerCase(),
    `${normalizedName}推荐`,
    `${normalizedName}优惠`,
    `${normalizedName}评测`,
    `${normalizedName}怎么选`,
  ];

  for (const location of locations) {
    keywordCandidates.push(`${location}${mainProduct}`);
    keywordCandidates.push(`${location}服务器`);
    keywordCandidates.push(`${location}云服务器`);
    keywordCandidates.push(`${location}VPS`);
  }

  for (const network of networks) {
    keywordCandidates.push(network);
    if (canCombineTerms(network, mainProduct)) {
      keywordCandidates.push(`${network}${mainProduct}`);
    }

    for (const location of locations) {
      if (canCombineTerms(network, mainProduct)) {
        keywordCandidates.push(`${location}${network}${mainProduct}`);
      } else {
        keywordCandidates.push(`${location}${network}`);
      }
    }
  }

  for (const feature of features) {
    keywordCandidates.push(feature);
    if (canCombineTerms(feature, mainProduct)) {
      keywordCandidates.push(`${feature}${mainProduct}`);
    }

    for (const location of locations) {
      if (canCombineTerms(feature, mainProduct)) {
        keywordCandidates.push(`${location}${feature}${mainProduct}`);
      } else {
        keywordCandidates.push(`${location}${feature}`);
      }
    }
  }

  if (containsTerm(normalizedName, "便宜") || containsTerm(normalizedName, "低价")) {
    keywordCandidates.push(`便宜${mainProduct}`);
    keywordCandidates.push(`低价${mainProduct}`);
    keywordCandidates.push(`${normalizedName}优惠码`);
  }

  if (containsTerm(normalizedName, "优惠码")) {
    keywordCandidates.push(`${normalizedName.replace("优惠码", "").trim()}优惠码`);
    keywordCandidates.push(`${normalizedName.replace("优惠码", "").trim()}折扣码`);
  }

  if (containsTerm(normalizedName, "Windows")) {
    keywordCandidates.push("Windows VPS");
    keywordCandidates.push("Windows云服务器");
  }

  const keywords = truncateText(
    dedupeKeywords(keywordCandidates).join(","),
    780,
  );

  return {
    description,
    keywords,
  };
}

function generateSeo(name: string) {
  return isMerchantTag(name) ? buildMerchantSeo(name) : buildTopicSeo(name);
}

async function main() {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
    })
    .from(tags)
    .orderBy(tags.id);

  for (const row of rows) {
    const seo = generateSeo(row.name);

    await db
      .update(tags)
      .set({
        description: seo.description,
        keywords: seo.keywords,
        updatedAt: sql`now()`,
      })
      .where(eq(tags.id, row.id));

    console.log(`Updated tag #${row.id}: ${row.name}`);
  }
}

await main();
