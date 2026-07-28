export const PROVIDER_OFFER_AFFILIATE_MODES = [
  "query_param",
  "full_replace",
  "product_param",
] as const;

export type ProviderOfferAffiliateMode =
  (typeof PROVIDER_OFFER_AFFILIATE_MODES)[number];

export type ArticleAffiliateConfigInput = {
  affUrl: string;
  affParam: string;
  affValue: string;
};

export type ProviderOfferAffiliateConfigInput = {
  offerAffUrl: string;
  offerAffParam: string;
  offerAffValue: string;
  offerAffiliateMode?: string | null;
  offerAffiliateProductParam?: string | null;
};

/**
 * Compatibility shape for callers created before provider-offer affiliate
 * settings received dedicated database fields. Production business code must
 * use ProviderOfferAffiliateConfigInput or ArticleAffiliateConfigInput.
 */
export type LegacyAffiliateConfigInput = {
  affUrl: string;
  affParam: string;
  affValue: string;
  affiliateMode?: string | null;
  affiliateProductParam?: string | null;
};

export type ProviderOfferAffiliateConfigLike =
  ProviderOfferAffiliateConfigInput | LegacyAffiliateConfigInput;

export type ArticleAffiliateUrlResolution = {
  url: string;
  mode: "param" | "replace";
};

export type ProviderOfferAffiliateUrlResolution = {
  url: string;
  mode: "param" | "replace" | "product-param";
  productId: string | null;
};

const affiliateParameterPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const productQueryKeys = [
  "pid",
  "gid",
  "product",
  "productid",
  "product_id",
  "plan",
  "planid",
  "plan_id",
  "package",
  "packageid",
  "package_id",
  "id",
];

function normalizedValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function getProviderOfferAffiliateMode(
  input: ProviderOfferAffiliateConfigLike,
): ProviderOfferAffiliateMode {
  const config = normalizeProviderOfferAffiliateConfig(input);
  const configured = normalizedValue(config.offerAffiliateMode);
  if (
    configured === "query_param" ||
    configured === "full_replace" ||
    configured === "product_param"
  ) {
    return configured;
  }
  return "query_param";
}

export function normalizeProviderOfferAffiliateConfig(
  input: ProviderOfferAffiliateConfigLike,
): ProviderOfferAffiliateConfigInput {
  if ("offerAffUrl" in input) return input;

  return {
    offerAffUrl: input.affUrl,
    offerAffParam: input.affParam,
    offerAffValue: input.affValue,
    offerAffiliateMode:
      input.affiliateMode ??
      (normalizedValue(input.affParam) === "href"
        ? "full_replace"
        : "query_param"),
    offerAffiliateProductParam: input.affiliateProductParam,
  };
}

export function isAffiliateParameterName(value: string) {
  return affiliateParameterPattern.test(value.trim());
}

export function getArticleAffiliateConfigState(
  input: ArticleAffiliateConfigInput,
): "empty" | "partial" | "complete" {
  const affUrl = normalizedValue(input.affUrl);
  const affParam = normalizedValue(input.affParam);
  const affValue = normalizedValue(input.affValue);

  if (!affUrl && !affParam && !affValue) return "empty";
  if (affParam === "href") return affUrl ? "complete" : "partial";
  return affUrl && affParam && affValue ? "complete" : "partial";
}

export function hasCompleteArticleAffiliateConfig(
  input: ArticleAffiliateConfigInput,
) {
  return getArticleAffiliateConfigState(input) === "complete";
}

export function getProviderOfferAffiliateConfigState(
  input: ProviderOfferAffiliateConfigLike,
): "empty" | "partial" | "complete" {
  const config = normalizeProviderOfferAffiliateConfig(input);
  const affUrl = normalizedValue(config.offerAffUrl);
  const affParam = normalizedValue(config.offerAffParam);
  const affValue = normalizedValue(config.offerAffValue);
  const productParam = normalizedValue(config.offerAffiliateProductParam);
  const mode = getProviderOfferAffiliateMode(config);

  if (mode === "full_replace") {
    return affUrl ? "complete" : "empty";
  }
  if (mode === "product_param") {
    if (!affUrl && !productParam) return "empty";
    return affUrl && productParam ? "complete" : "partial";
  }
  if (!affUrl && !affParam && !affValue) return "empty";
  return affUrl && affParam && affValue ? "complete" : "partial";
}

export function hasCompleteProviderOfferAffiliateConfig(
  input: ProviderOfferAffiliateConfigLike,
) {
  return getProviderOfferAffiliateConfigState(input) === "complete";
}

function normalizedProductId(value: string | null | undefined) {
  const normalized = normalizedValue(value);
  return normalized && normalized.length <= 512 ? normalized : null;
}

function productParameterNames(preferredParameter?: string | null) {
  const preferred = normalizedValue(preferredParameter).toLowerCase();
  return [...new Set([preferred, ...productQueryKeys].filter(Boolean))];
}

function strictProductParameterNames(preferredParameter?: string | null) {
  const preferred = normalizedValue(preferredParameter).toLowerCase();
  return preferred ? [preferred] : productQueryKeys;
}

export function extractProductIdReference(
  value: string,
  preferredParameter?: string | null,
  options?: { strictPreferred?: boolean },
) {
  const parameterNames = options?.strictPreferred
    ? strictProductParameterNames(preferredParameter)
    : productParameterNames(preferredParameter);
  const prefixed = /^([A-Za-z][A-Za-z0-9_.-]{0,79}):(.+)$/i.exec(value.trim());
  const prefixedName = prefixed?.[1]?.toLowerCase() ?? "";
  const prefixedValue = normalizedProductId(prefixed?.[2]);
  if (prefixedValue && parameterNames.includes(prefixedName)) {
    return { parameter: prefixedName, value: prefixedValue };
  }

  try {
    const url = new URL(value);
    for (const expectedName of parameterNames) {
      for (const [name, rawValue] of url.searchParams) {
        if (name.toLowerCase() !== expectedName) continue;
        const productId = normalizedProductId(rawValue);
        if (productId) {
          return { parameter: name.toLowerCase(), value: productId };
        }
      }
    }
  } catch {
    // An external product ID may be a simple value instead of a URL.
  }
  return null;
}

export function extractAffiliateProductId(input: {
  externalProductId?: string | null;
  purchaseUrl?: string | null;
  productParam?: string | null;
}) {
  const externalProductId = normalizedValue(input.externalProductId);
  const fromExternalUrl = extractProductIdReference(
    externalProductId,
    input.productParam,
    { strictPreferred: true },
  );
  if (fromExternalUrl) return fromExternalUrl.value;
  if (/^[A-Za-z0-9._~-]{1,160}$/.test(externalProductId)) {
    return externalProductId;
  }

  return (
    extractProductIdReference(
      normalizedValue(input.purchaseUrl),
      input.productParam,
      { strictPreferred: true },
    )?.value ?? null
  );
}

function parseHttpUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}不是有效的 http/https URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label}不是有效的 http/https URL`);
  }
  if (url.username || url.password) {
    throw new Error(`${label}不能包含用户名或密码`);
  }
  return url;
}

export function resolveArticleAffiliateUrl(input: {
  rawUrl: string;
  affiliate: ArticleAffiliateConfigInput;
}): ArticleAffiliateUrlResolution | null {
  if (!hasCompleteArticleAffiliateConfig(input.affiliate)) return null;

  const affUrl = normalizedValue(input.affiliate.affUrl);
  const affParam = normalizedValue(input.affiliate.affParam);
  if (affParam === "href") {
    return {
      url: parseHttpUrl(affUrl, "返利链接").toString(),
      mode: "replace",
    };
  }

  const affValue = normalizedValue(input.affiliate.affValue);
  if (!isAffiliateParameterName(affParam)) {
    throw new Error("返利参数格式不正确");
  }
  const url = parseHttpUrl(input.rawUrl, "供应商购买链接");
  url.searchParams.set(affParam, affValue);
  return { url: url.toString(), mode: "param" };
}

export function resolveProviderOfferAffiliateUrl(input: {
  rawUrl: string;
  affiliate: ProviderOfferAffiliateConfigLike;
  externalProductId?: string | null;
}): ProviderOfferAffiliateUrlResolution | null {
  if (!hasCompleteProviderOfferAffiliateConfig(input.affiliate)) return null;

  const affiliate = normalizeProviderOfferAffiliateConfig(input.affiliate);
  const mode = getProviderOfferAffiliateMode(affiliate);
  const affUrl = normalizedValue(affiliate.offerAffUrl);
  if (mode === "full_replace") {
    return {
      url: parseHttpUrl(affUrl, "套餐采集返利链接").toString(),
      mode: "replace",
      productId: null,
    };
  }

  if (mode === "product_param") {
    const productParam = normalizedValue(affiliate.offerAffiliateProductParam);
    if (!isAffiliateParameterName(productParam)) {
      throw new Error("产品 ID 参数格式不正确");
    }
    const productId = extractAffiliateProductId({
      externalProductId: input.externalProductId,
      purchaseUrl: input.rawUrl,
      productParam,
    });
    if (!productId) return null;
    const url = parseHttpUrl(affUrl, "套餐采集返利链接");
    url.searchParams.set(productParam, productId);
    return { url: url.toString(), mode: "product-param", productId };
  }

  const affParam = normalizedValue(affiliate.offerAffParam);
  const affValue = normalizedValue(affiliate.offerAffValue);
  if (!isAffiliateParameterName(affParam)) {
    throw new Error("返利参数格式不正确");
  }
  const url = parseHttpUrl(input.rawUrl, "供应商购买链接");
  url.searchParams.set(affParam, affValue);
  return { url: url.toString(), mode: "param", productId: null };
}

/** @deprecated Use the business-specific article or provider-offer helper. */
export function getAffiliateMode(input: LegacyAffiliateConfigInput) {
  return getProviderOfferAffiliateMode(input);
}

/** @deprecated Use getArticleAffiliateConfigState or getProviderOfferAffiliateConfigState. */
export function getAffiliateConfigState(input: LegacyAffiliateConfigInput) {
  return getProviderOfferAffiliateConfigState(input);
}

/** @deprecated Use the business-specific completeness helper. */
export function hasCompleteAffiliateConfig(input: LegacyAffiliateConfigInput) {
  return hasCompleteProviderOfferAffiliateConfig(input);
}

/** @deprecated Use resolveArticleAffiliateUrl or resolveProviderOfferAffiliateUrl. */
export function resolveAffiliateUrl(input: {
  rawUrl: string;
  affiliate: LegacyAffiliateConfigInput;
  externalProductId?: string | null;
}) {
  return resolveProviderOfferAffiliateUrl(input);
}

export function normalizeAffiliateProviderDomain(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  const hasHierarchicalScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(normalized);
  const looksLikeHostWithPort = /^[^/?#]+:\d+(?:[/?#]|$)/.test(normalized);
  if (
    !hasHierarchicalScheme &&
    !looksLikeHostWithPort &&
    /^[a-z][a-z\d+.-]*:/i.test(normalized)
  ) {
    return null;
  }

  try {
    const parsedUrl = new URL(
      normalized.startsWith("//")
        ? `https:${normalized}`
        : hasHierarchicalScheme
          ? normalized
          : `https://${normalized}`,
    );
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;

    const hostname = parsedUrl.hostname
      .toLowerCase()
      .replace(/\.+$/, "")
      .replace(/^www\./, "");
    return hostname.includes(".") ? hostname : null;
  } catch {
    return null;
  }
}

export function affiliateProviderDomainsMatch(left: string, right: string) {
  const leftDomain = normalizeAffiliateProviderDomain(left);
  const rightDomain = normalizeAffiliateProviderDomain(right);
  if (!leftDomain || !rightDomain) return false;
  return (
    leftDomain === rightDomain ||
    leftDomain.endsWith(`.${rightDomain}`) ||
    rightDomain.endsWith(`.${leftDomain}`)
  );
}
