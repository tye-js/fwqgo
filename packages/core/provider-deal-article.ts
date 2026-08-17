export const providerDealBillingCycles = [
  "monthly",
  "quarterly",
  "semi-annually",
  "annually",
] as const;

export type ProviderDealBillingCycle =
  (typeof providerDealBillingCycles)[number];

export type ProviderDealMoney = number | string;

export type ProviderDealProduct = {
  id: string;
  name: string;
  cpu: string;
  memory: string;
  storage: string;
  traffic: string;
  bandwidth: string;
  prices: Record<ProviderDealBillingCycle, ProviderDealMoney>;
  purchaseUrl: string;
  sourceDescription?: string;
};

export type ProviderDealCategory = {
  name: string;
  location: string;
  introFacts: string;
  positioningFacts: string[];
  selectionNotes: string[];
  fitFacts: string[];
  cautions: string[];
};

export type ProviderDealMerchant = {
  name: string;
  officialUrl: string;
  shortSummary: string;
  refundPolicy: string;
  refundPolicyUrl: string;
  prohibitedUses: string;
  prohibitedUsesUrl: string;
};

export type ProviderDealPromotion = {
  code: string;
  payablePercent: Record<ProviderDealBillingCycle, number>;
  newPurchaseText: string;
  renewalText: string;
};

export type ProviderDealArticleInput = {
  merchant: ProviderDealMerchant;
  category: ProviderDealCategory;
  promotion: ProviderDealPromotion;
  products: ProviderDealProduct[];
  keywords: string[];
  slug: string;
};

export type ProviderDealArticle = {
  title: string;
  slug: string;
  description: string;
  keywords: string;
  content: string;
};

export type ProviderDealArticleIssue = {
  code:
    | "empty_content"
    | "title_in_body"
    | "h1_in_body"
    | "missing_heading"
    | "heading_order"
    | "invalid_official_link"
    | "invalid_policy_link"
    | "missing_official_link"
    | "missing_promo_code"
    | "invalid_purchase_link"
    | "duplicate_purchase_link"
    | "missing_purchase_link"
    | "unsupported_link";
  message: string;
};

export type ProviderDealArticleValidation = {
  valid: boolean;
  issues: ProviderDealArticleIssue[];
};

const cycleLabels: Record<ProviderDealBillingCycle, string> = {
  monthly: "月付",
  quarterly: "季付",
  "semi-annually": "半年付",
  annually: "年付",
};

export function parseProviderDealMoney(value: ProviderDealMoney) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value.replace(/[$,\s]/g, "").trim());

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`无效的套餐价格：${String(value)}`);
  }

  return parsed;
}

export function formatProviderDealUsd(value: ProviderDealMoney) {
  const rounded =
    Math.round((parseProviderDealMoney(value) + Number.EPSILON) * 100) / 100;
  return `$${rounded.toFixed(2).replace(/\.00$/, "")}`;
}

export function calculateProviderDealPromoPrice(
  value: ProviderDealMoney,
  payablePercent: number,
) {
  if (
    !Number.isFinite(payablePercent) ||
    payablePercent <= 0 ||
    payablePercent > 1
  ) {
    throw new Error(`优惠比例必须大于 0 且不超过 1：${payablePercent}`);
  }

  const amount =
    Math.round(
      (parseProviderDealMoney(value) * payablePercent + Number.EPSILON) * 100,
    ) / 100;
  return formatProviderDealUsd(amount);
}

function formatPayablePercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatFold(value: number) {
  const fold = Math.round(value * 10 * 10) / 10;
  const discount = Math.round((1 - value) * 100);
  return `${fold}折，优惠${discount}%`;
}

function formatPromotion(input: ProviderDealPromotion) {
  const cycles = providerDealBillingCycles.map((cycle) => {
    const payablePercent = input.payablePercent[cycle];
    return `${cycleLabels[cycle]} ${formatPayablePercent(payablePercent)}（${formatFold(payablePercent)}）`;
  });

  return `在结算页输入 **${input.code}**：${cycles.join(" / ")}。${input.newPurchaseText}，${input.renewalText}。百分比表示支付原价的比例，最终适用范围和金额以结算页为准。`;
}

function normalizeHttpUrl(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label}不能为空`);
  }

  const hasHierarchicalScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  const hasNonHierarchicalScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  const looksLikeHostWithPort = /^[^/?#]+:\d+(?:[/?#]|$)/.test(trimmed);
  if (
    hasNonHierarchicalScheme &&
    !hasHierarchicalScheme &&
    !looksLikeHostWithPort
  ) {
    throw new Error(`${label}必须使用 HTTP 或 HTTPS：${value}`);
  }

  const candidate = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : hasHierarchicalScheme
      ? trimmed
      : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${label}不是有效的 HTTP 或 HTTPS URL：${value}`);
  }

  if (!/^https?:$/.test(url.protocol) || !url.hostname) {
    throw new Error(`${label}必须使用 HTTP 或 HTTPS：${value}`);
  }
  if (url.username || url.password) {
    throw new Error(`${label}不能包含用户名或密码：${value}`);
  }

  return url.toString();
}

function tryNormalizeHttpUrl(value: string) {
  try {
    return normalizeHttpUrl(value, "链接");
  } catch {
    return null;
  }
}

function normalizeProviderDealInput(input: ProviderDealArticleInput) {
  return {
    ...input,
    merchant: {
      ...input.merchant,
      officialUrl: normalizeHttpUrl(input.merchant.officialUrl, "官网链接"),
      refundPolicyUrl: normalizeHttpUrl(
        input.merchant.refundPolicyUrl,
        "退款政策链接",
      ),
      prohibitedUsesUrl: normalizeHttpUrl(
        input.merchant.prohibitedUsesUrl,
        "使用限制链接",
      ),
    },
    products: input.products.map((product, index) => ({
      ...product,
      purchaseUrl: normalizeHttpUrl(
        product.purchaseUrl,
        `第 ${index + 1} 个套餐购买链接`,
      ),
    })),
  };
}

function renderProductPrices(
  product: ProviderDealProduct,
  promotion: ProviderDealPromotion,
) {
  return providerDealBillingCycles
    .map((cycle) => {
      const original = formatProviderDealUsd(product.prices[cycle]);
      const promo = calculateProviderDealPromoPrice(
        product.prices[cycle],
        promotion.payablePercent[cycle],
      );
      return `${cycleLabels[cycle]} ${original} / ${promo}`;
    })
    .join("；");
}

function renderProductTable(
  products: ProviderDealProduct[],
  promotion: ProviderDealPromotion,
) {
  const escapeTableCell = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/[\r\n]+/g, " ");

  const rows = products.map((product) => {
    const configuration = [
      `${product.cpu} CPU`,
      `${product.memory} 内存`,
      `${product.storage} SSD`,
    ]
      .filter(Boolean)
      .join("；");

    return `| ${escapeTableCell(product.name)} | ${escapeTableCell(configuration)} | ${escapeTableCell(`${product.traffic} / ${product.bandwidth}`)} | ${escapeTableCell(renderProductPrices(product, promotion))} | [购买](<${product.purchaseUrl}>) |`;
  });

  return [
    "| 套餐 | 配置 | 流量 / 带宽 | 价格（原价 / FWQGO 后参考价） | 购买 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderBulletSection(title: string, values: string[]) {
  if (values.length === 0) return "";
  return `## ${title}\n\n${values.map((value) => `- ${value}`).join("\n")}`;
}

function getPriceRange(products: ProviderDealProduct[]) {
  const monthlyPrices = products.map((product) =>
    parseProviderDealMoney(product.prices.monthly),
  );
  const minimum = Math.min(...monthlyPrices);
  const maximum = Math.max(...monthlyPrices);
  return minimum === maximum
    ? formatProviderDealUsd(minimum)
    : `${formatProviderDealUsd(minimum)}-${formatProviderDealUsd(maximum)}`;
}

function getMinimumMonthlyPrice(products: ProviderDealProduct[]) {
  return Math.min(
    ...products.map((product) =>
      parseProviderDealMoney(product.prices.monthly),
    ),
  );
}

function extractMarkdownLinkTargets(content: string) {
  const markdownLinkPattern =
    /\[[^\]\n]+\]\((?:<([^>\n]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g;

  return [...content.matchAll(markdownLinkPattern)]
    .map((match) => match[1] ?? match[2] ?? "")
    .filter((target) => /^https?:\/\//i.test(target));
}

export function validateProviderDealArticle(
  input: ProviderDealArticleInput,
  article: Pick<ProviderDealArticle, "title" | "content">,
): ProviderDealArticleValidation {
  const issues: ProviderDealArticleIssue[] = [];
  const content = article.content.trim();
  const targets = extractMarkdownLinkTargets(content)
    .map(tryNormalizeHttpUrl)
    .filter((target): target is string => Boolean(target));

  if (!content) {
    issues.push({ code: "empty_content", message: "正文不能为空" });
  }
  if (content.includes(article.title)) {
    issues.push({ code: "title_in_body", message: "文章标题不能写入正文" });
  }
  if (/^#\s/m.test(content)) {
    issues.push({ code: "h1_in_body", message: "正文不能包含一级标题" });
  }

  const headings = ["## 官网链接", "## 优惠码", "## 注意事项"];
  const headingPositions = headings.map((heading) => content.indexOf(heading));
  for (const [index, heading] of headings.entries()) {
    if (headingPositions[index] === -1) {
      issues.push({
        code: "missing_heading",
        message: `缺少必需小标题：${heading}`,
      });
    }
  }
  if (
    headingPositions.every((position) => position >= 0) &&
    headingPositions.some(
      (position, index) =>
        index > 0 && position <= (headingPositions[index - 1] ?? -1),
    )
  ) {
    issues.push({
      code: "heading_order",
      message: "官网链接、优惠码、注意事项小标题必须按顺序出现",
    });
  }

  const officialUrl = tryNormalizeHttpUrl(input.merchant.officialUrl);
  if (!officialUrl) {
    issues.push({
      code: "invalid_official_link",
      message: "官网链接必须是有效的 HTTP 或 HTTPS URL",
    });
  } else if (!targets.includes(officialUrl)) {
    issues.push({
      code: "missing_official_link",
      message: "正文缺少官网链接",
    });
  }
  if (!content.includes(`**${input.promotion.code}**`)) {
    issues.push({
      code: "missing_promo_code",
      message: "正文缺少加粗优惠码",
    });
  }

  const purchaseUrls = input.products.map((product) =>
    tryNormalizeHttpUrl(product.purchaseUrl),
  );
  for (const [index, purchaseUrl] of purchaseUrls.entries()) {
    if (!purchaseUrl) {
      issues.push({
        code: "invalid_purchase_link",
        message: `第 ${index + 1} 个套餐购买链接必须是有效的 HTTP 或 HTTPS URL`,
      });
    }
  }
  const validPurchaseUrls = purchaseUrls.filter(
    (purchaseUrl): purchaseUrl is string => Boolean(purchaseUrl),
  );
  const uniquePurchaseUrls = new Set(validPurchaseUrls);
  if (uniquePurchaseUrls.size !== validPurchaseUrls.length) {
    issues.push({
      code: "duplicate_purchase_link",
      message: "输入套餐存在重复购买链接",
    });
  }
  for (const purchaseUrl of validPurchaseUrls) {
    const count = targets.filter((target) => target === purchaseUrl).length;
    if (count === 0) {
      issues.push({
        code: "missing_purchase_link",
        message: `缺少套餐购买链接：${purchaseUrl}`,
      });
    } else if (count > 1) {
      issues.push({
        code: "duplicate_purchase_link",
        message: `套餐购买链接重复：${purchaseUrl}`,
      });
    }
  }

  const policyUrls = [
    input.merchant.refundPolicyUrl,
    input.merchant.prohibitedUsesUrl,
  ].map(tryNormalizeHttpUrl);
  if (policyUrls.some((policyUrl) => !policyUrl)) {
    issues.push({
      code: "invalid_policy_link",
      message: "退款政策和使用限制链接必须是有效的 HTTP 或 HTTPS URL",
    });
  }

  const allowedTargets = new Set(
    [
      officialUrl,
      ...validPurchaseUrls,
      ...policyUrls.filter((url): url is string => Boolean(url)),
    ].filter((target): target is string => Boolean(target)),
  );
  for (const target of targets) {
    if (!allowedTargets.has(target)) {
      issues.push({
        code: "unsupported_link",
        message: `正文包含未声明的外部链接：${target}`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function renderProviderDealArticle(
  input: ProviderDealArticleInput,
): ProviderDealArticle {
  const normalizedInput = normalizeProviderDealInput(input);
  if (normalizedInput.products.length === 0) {
    throw new Error("至少需要一个供应商套餐");
  }

  const officialUrl = normalizedInput.merchant.officialUrl;
  const priceRange = getPriceRange(normalizedInput.products);
  const minimumPrice = formatProviderDealUsd(
    getMinimumMonthlyPrice(normalizedInput.products),
  );
  const title = `${normalizedInput.merchant.name} ${normalizedInput.category.name} 云服务器套餐：${minimumPrice}/月起，${normalizedInput.promotion.code}优惠码`;
  const slug = normalizedInput.slug.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    throw new Error(`供应商文章 slug 无效：${normalizedInput.slug}`);
  }
  const description = `${normalizedInput.merchant.name} ${normalizedInput.category.name}云服务器，${normalizedInput.category.location}，${normalizedInput.products.length}档套餐${priceRange}/月起，整理 CPU、内存、SSD、流量、带宽、优惠后参考价和${normalizedInput.promotion.code}活动。`;
  const keywords = [
    ...new Set(
      normalizedInput.keywords.map((keyword) => keyword.trim()).filter(Boolean),
    ),
  ]
    .slice(0, 6)
    .join(",");

  const contentSections = [
    `${normalizedInput.merchant.name} ${normalizedInput.merchant.shortSummary.trim()} 当前产品页的“${normalizedInput.category.name}”分类位于${normalizedInput.category.location}，${normalizedInput.category.introFacts.trim()} 本文按当前产品页面和活动整理，价格、配置、库存和开通结果以官网配置页为准。`,
    `## 官网链接\n\n[${officialUrl}](<${officialUrl}>)`,
    `## 优惠码\n\n${formatPromotion(normalizedInput.promotion)}`,
    renderBulletSection("产品定位", normalizedInput.category.positioningFacts),
    `## 套餐表\n\n${renderProductTable(normalizedInput.products, normalizedInput.promotion)}`,
    renderBulletSection(
      "套餐选择建议",
      normalizedInput.category.selectionNotes,
    ),
    renderBulletSection("适用信息", normalizedInput.category.fitFacts),
    `## 注意事项\n\n${[
      ...normalizedInput.category.cautions,
      `商家退款规则：${normalizedInput.merchant.refundPolicy.trim()} 详见 [退款与服务条款](<${normalizedInput.merchant.refundPolicyUrl}>)。`,
      `使用限制：${normalizedInput.merchant.prohibitedUses.trim()} 详见 [可接受使用政策](<${normalizedInput.merchant.prohibitedUsesUrl}>)。`,
      "请自行做好异地备份，不要把单台云服务器作为唯一存储；重装、终止、退款或违反服务条款可能导致数据不可恢复。",
    ]
      .filter(Boolean)
      .map((value) => `- ${value}`)
      .join("\n")}`,
  ].filter(Boolean);

  const article = {
    title,
    slug,
    description: description.slice(0, 800),
    keywords,
    content: contentSections.join("\n\n").trim(),
  } satisfies ProviderDealArticle;
  const validation = validateProviderDealArticle(normalizedInput, article);
  if (!validation.valid) {
    throw new Error(
      `供应商文章生成校验失败：${validation.issues.map((issue) => issue.message).join("；")}`,
    );
  }

  return article;
}
