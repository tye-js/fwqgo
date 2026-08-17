import { and, eq, inArray } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { affServiceProviders, categories, posts } from "@fwqgo/db/schema";
import {
  formatProviderDealUsd,
  parseProviderDealMoney,
  renderProviderDealArticle,
  type ProviderDealArticleInput,
  type ProviderDealBillingCycle,
  type ProviderDealProduct,
} from "@fwqgo/core/provider-deal-article";
import { markPostInternalLinksStale } from "@/server/posts/internal-links";

const VPS_CAT_API = "https://vps.cat/api/v1";
const APPLY_FLAG = "--apply";

type VpsCatCategory = {
  id: string;
  slug: string;
  nameZh: string;
  descriptionZh?: string | null;
};

type VpsCatPricing = {
  billingCycle: string;
  basePrice: string;
  isActive?: boolean;
};

type VpsCatProduct = {
  id: string;
  categoryId: string;
  nameZh: string;
  descriptionZh?: string | null;
  specs: {
    cpu: number;
    disk: number;
    memory: number;
    traffic: number;
    bandwidth: number;
  };
  pricing?: VpsCatPricing[];
};

type CategoryArticleConfig = {
  apiSlug: string;
  articleSlug: string;
  displayName: string;
  cmsCategorySlug: string;
  keywords: string[];
  positioningLead: string;
  categoryCautions: string[];
};

const articleConfigs: CategoryArticleConfig[] = [
  {
    apiSlug: "HK_direct",
    articleSlug: "vps-cat-hong-kong-direct-cloud-server",
    displayName: "香港直连",
    cmsCategorySlug: "hk-vps",
    keywords: [
      "VPS.CAT",
      "香港直连云服务器",
      "香港VPS",
      "三网直连",
      "原生IP",
      "FWQGO优惠码",
    ],
    positioningLead: "核心信息是香港三网直连大陆线路和原生 IP。",
    categoryCautions: [
      "产品分类和配置页标注为香港直连；实际线路、IP 属性、库存和开通结果以结算页为准。",
    ],
  },
  {
    apiSlug: "US_ISP",
    articleSlug: "vps-cat-us-isp-cloud-server",
    displayName: "美国 ISP",
    cmsCategorySlug: "usa-vps",
    keywords: [
      "VPS.CAT",
      "美国ISP云服务器",
      "洛杉矶VPS",
      "4837线路",
      "双ISP IP",
      "FWQGO优惠码",
    ],
    positioningLead:
      "核心信息是洛杉矶 4837 线路和双 ISP 属性 NTT IP；该分类不等同于住宅 IP。",
    categoryCautions: [
      "美国 ISP 分类明确不支持以 IP 非住宅属性为由退款，不应把 ISP IP 宣传为住宅 IP。",
      "分类页面说明开通后 24 小时内发现被墙 IP 可以免费更换，申请时应以官网或工单要求为准。",
    ],
  },
  {
    apiSlug: "de_9929",
    articleSlug: "vps-cat-germany-9929-cloud-server",
    displayName: "德国 9929",
    cmsCategorySlug: "vps",
    keywords: [
      "VPS.CAT",
      "德国9929云服务器",
      "法兰克福VPS",
      "9929线路",
      "广播IP",
      "FWQGO优惠码",
    ],
    positioningLead: "核心信息是法兰克福 9929 线路和广播 IP。",
    categoryCautions: [
      "分类页面说明开通后 24 小时内发现被墙 IP 可以免费更换，申请时应以官网或工单要求为准。",
    ],
  },
];

const promotion = {
  code: "FWQGO",
  payablePercent: {
    monthly: 0.7,
    quarterly: 0.68,
    "semi-annually": 0.65,
    annually: 0.6,
  },
  newPurchaseText: "新购可用",
  renewalText: "续费可用",
} as const;

function getList<T>(value: unknown, label: string): T[] {
  if (Array.isArray(value)) return value as T[];

  if (value && typeof value === "object") {
    const response = value as { items?: unknown; data?: unknown };
    if (Array.isArray(response.items)) return response.items as T[];
    if (Array.isArray(response.data)) return response.data as T[];
  }

  throw new Error(`VPS.CAT ${label} API 响应格式不正确`);
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    throw new Error(`VPS.CAT API 请求失败：${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

function formatStorage(mb: number) {
  const gb = mb / 1024;
  return Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`;
}

function formatTraffic(gb: number) {
  const tb = gb / 1024;
  return Number.isInteger(tb) ? `${tb} TB/月` : `${gb} GB/月`;
}

function formatBandwidth(mbps: number) {
  return mbps >= 1_000 && mbps % 1_000 === 0
    ? `${mbps / 1_000} Gbps`
    : `${mbps} Mbps`;
}

function normalizePricing(product: VpsCatProduct) {
  const prices = new Map<ProviderDealBillingCycle, string>();
  for (const price of product.pricing ?? []) {
    if (!price.isActive && price.isActive !== undefined) continue;
    const cycle =
      price.billingCycle === "semi-annually"
        ? "semi-annually"
        : price.billingCycle === "annually"
          ? "annually"
          : price.billingCycle === "quarterly"
            ? "quarterly"
            : price.billingCycle === "monthly"
              ? "monthly"
              : null;
    if (cycle && !prices.has(cycle)) prices.set(cycle, price.basePrice);
  }

  const requiredCycles: ProviderDealBillingCycle[] = [
    "monthly",
    "quarterly",
    "semi-annually",
    "annually",
  ];
  for (const cycle of requiredCycles) {
    if (!prices.has(cycle)) {
      throw new Error(`${product.nameZh} 缺少${cycle}价格`);
    }
  }

  return {
    monthly: prices.get("monthly")!,
    quarterly: prices.get("quarterly")!,
    "semi-annually": prices.get("semi-annually")!,
    annually: prices.get("annually")!,
  };
}

function normalizeProduct(product: VpsCatProduct): ProviderDealProduct {
  return {
    id: product.id,
    name: product.nameZh,
    cpu: `${product.specs.cpu} 核`,
    memory: formatStorage(product.specs.memory),
    storage: formatStorage(product.specs.disk),
    traffic: formatTraffic(product.specs.traffic),
    bandwidth: formatBandwidth(product.specs.bandwidth),
    prices: normalizePricing(product),
    purchaseUrl: `https://vps.cat/products/${product.id}/configure`,
    sourceDescription: product.descriptionZh ?? undefined,
  };
}

function getMonthlyPrice(product: ProviderDealProduct) {
  return parseProviderDealMoney(product.prices.monthly);
}

function trimmedOrFallback(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : fallback;
}

function buildSelectionNotes(products: ProviderDealProduct[]) {
  const byMonthlyPrice = [...products].sort(
    (left, right) => getMonthlyPrice(left) - getMonthlyPrice(right),
  );
  const lowest = byMonthlyPrice[0];
  const middle = byMonthlyPrice[Math.floor(byMonthlyPrice.length / 2)];
  const highest = byMonthlyPrice.at(-1);
  if (!lowest || !middle || !highest) return [];

  return [
    `预算优先：${lowest.name} 月付 ${formatProviderDealUsd(lowest.prices.monthly)} 起，是当前分类的最低月付档位；适合先验证应用需求和资源用量。`,
    `均衡选择：${middle.name} 位于当前套餐价格区间中段，建议重点对比其内存、SSD、流量和带宽是否满足实际负载。`,
    `资源优先：${highest.name} 提供当前分类最高的配置档位，适合明确需要更多内存、流量或带宽的业务；不建议只因为规格更高就盲目购买。`,
  ];
}

function buildFitFacts(products: ProviderDealProduct[]) {
  const descriptions = [
    ...new Set(
      products
        .map((product) => product.sourceDescription?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) =>
          value
            .replace(/轻量代理、?/g, "")
            .replace(/稳定代理场景/g, "")
            .replace(/、与$/g, "")
            .replace(/与\s*$/g, "")
            .replace(/、\s*$/g, "")
            .trim(),
        )
        .filter(Boolean),
    ),
  ];
  return descriptions.length > 0
    ? [`页面对当前套餐的场景描述包括：${descriptions.join("；")}`]
    : [];
}

function buildArticleInput(
  provider: typeof affServiceProviders.$inferSelect,
  category: VpsCatCategory,
  products: VpsCatProduct[],
  config: CategoryArticleConfig,
): ProviderDealArticleInput {
  const normalizedProducts = products.map(normalizeProduct);
  const monthlyPrices = normalizedProducts.map(getMonthlyPrice);
  const minPrice = Math.min(...monthlyPrices);
  const maxPrice = Math.max(...monthlyPrices);
  const sourceDescription = (category.descriptionZh ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const priceRange = `${formatProviderDealUsd(minPrice)}-${formatProviderDealUsd(maxPrice)}`;

  return {
    slug: config.articleSlug,
    merchant: {
      name: provider.name,
      officialUrl: provider.officialUrl.trim(),
      shortSummary: trimmedOrFallback(
        provider.summary,
        "商家档案未提供摘要，请以官网公开信息为准。",
      ),
      refundPolicy: trimmedOrFallback(
        provider.refundPolicy,
        "退款规则未在商家档案中记录，请以官网条款为准。",
      ),
      refundPolicyUrl: trimmedOrFallback(
        provider.refundPolicySourceUrl,
        "https://vps.cat/tos",
      ),
      prohibitedUses: trimmedOrFallback(
        provider.prohibitedUses,
        "使用限制未在商家档案中记录，请以官网 AUP 为准。",
      ),
      prohibitedUsesUrl: trimmedOrFallback(
        provider.prohibitedUsesSourceUrl,
        "https://vps.cat/aup",
      ),
    },
    category: {
      name: config.displayName,
      location: category.nameZh.includes("香港")
        ? "香港"
        : category.nameZh.includes("美国")
          ? "美国洛杉矶"
          : category.nameZh.includes("德国")
            ? "德国法兰克福"
            : "当前分类地区",
      introFacts: `页面标注${config.positioningLead.replace(/^核心信息是/, "")} 当前列出 ${normalizedProducts.length} 档固定套餐，月付 ${priceRange}。`,
      positioningFacts: [
        config.positioningLead,
        sourceDescription
          ? `分类页面说明：${sourceDescription}`
          : "分类页面未提供额外线路说明。",
      ],
      selectionNotes: buildSelectionNotes(normalizedProducts),
      fitFacts: buildFitFacts(normalizedProducts),
      cautions: config.categoryCautions,
    },
    promotion,
    products: normalizedProducts,
    keywords: config.keywords,
  };
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const [provider] = await db
    .select()
    .from(affServiceProviders)
    .where(eq(affServiceProviders.name, "vps.cat"))
    .limit(1);
  if (!provider) throw new Error("找不到 vps.cat 商家档案");

  const cmsCategoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(
      inArray(categories.slug, [
        ...new Set(articleConfigs.map((config) => config.cmsCategorySlug)),
      ]),
    );
  const cmsCategoryBySlug = new Map(
    cmsCategoryRows.map((category) => [category.slug, category]),
  );

  const [categoriesResponse, productsResponse] = await Promise.all([
    fetchJson<unknown>(`${VPS_CAT_API}/products/categories`),
    fetchJson<unknown>(`${VPS_CAT_API}/products?isActive=true&pageSize=100`),
  ]);
  const apiCategories = getList<VpsCatCategory>(categoriesResponse, "分类");
  const apiProducts = getList<VpsCatProduct>(productsResponse, "套餐");

  for (const config of articleConfigs) {
    const cmsCategory = cmsCategoryBySlug.get(config.cmsCategorySlug);
    if (!cmsCategory) {
      throw new Error(`找不到 CMS 分类：${config.cmsCategorySlug}`);
    }

    const category = apiCategories.find((item) => item.slug === config.apiSlug);
    if (!category) throw new Error(`找不到 VPS.CAT 分类：${config.apiSlug}`);
    const products = apiProducts.filter(
      (product) => product.categoryId === category.id,
    );
    if (products.length === 0) {
      throw new Error(`分类没有套餐：${config.apiSlug}`);
    }

    const articleInput = buildArticleInput(
      provider,
      category,
      products,
      config,
    );
    const article = renderProviderDealArticle(articleInput);
    const [post] = await db
      .select({ id: posts.id, title: posts.title, published: posts.published })
      .from(posts)
      .where(
        and(
          eq(posts.slug, article.slug),
          eq(posts.language, "zh"),
          eq(posts.published, false),
          eq(posts.categoryId, cmsCategory.id),
        ),
      )
      .limit(1);
    if (!post) {
      console.warn(`未找到未发布草稿，跳过：${article.slug}`);
      continue;
    }

    if (apply) {
      await db
        .update(posts)
        .set({
          title: article.title,
          content: article.content,
          keywords: article.keywords,
          description: article.description,
          affiliateReviewStatus: "pending",
          affiliateReviewDetails: null,
          affiliateReviewUpdatedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, post.id));
      await markPostInternalLinksStale(post.id);

      console.log(
        JSON.stringify(
          {
            action: "stored",
            postId: post.id,
            slug: article.slug,
            title: article.title,
            contentLength: article.content.length,
            purchaseLinks: products.length,
          },
          null,
          2,
        ),
      );
      continue;
    }

    console.log(
      JSON.stringify(
        {
          action: apply ? "updated" : "preview",
          postId: post.id,
          slug: article.slug,
          title: article.title,
          contentLength: article.content.length,
          purchaseLinks: products.length,
        },
        null,
        2,
      ),
    );
  }

  if (!apply) {
    console.log("预览模式：未写入文章。确认后使用 --apply 更新未发布草稿。 ");
  }
}

await main();
