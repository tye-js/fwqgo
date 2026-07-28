export const AFFILIATE_MODES = [
  "query_param",
  "full_replace",
  "product_param",
] as const;

export type AffiliateMode = (typeof AFFILIATE_MODES)[number];

export type AffiliateConfigInput = {
  affUrl: string;
  affParam: string;
  affValue: string;
  affiliateMode?: string | null;
  affiliateProductParam?: string | null;
};

export type AffiliateUrlResolution = {
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

export function getAffiliateMode(input: AffiliateConfigInput): AffiliateMode {
  const configured = normalizedValue(input.affiliateMode);
  if (
    configured === "query_param" ||
    configured === "full_replace" ||
    configured === "product_param"
  ) {
    return configured;
  }
  return normalizedValue(input.affParam) === "href"
    ? "full_replace"
    : "query_param";
}

export function isAffiliateParameterName(value: string) {
  return affiliateParameterPattern.test(value.trim());
}

export function getAffiliateConfigState(
  input: AffiliateConfigInput,
): "empty" | "partial" | "complete" {
  const affUrl = normalizedValue(input.affUrl);
  const affParam = normalizedValue(input.affParam);
  const affValue = normalizedValue(input.affValue);
  const productParam = normalizedValue(input.affiliateProductParam);
  const mode = getAffiliateMode(input);

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

export function hasCompleteAffiliateConfig(input: AffiliateConfigInput) {
  return getAffiliateConfigState(input) === "complete";
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

export function resolveAffiliateUrl(input: {
  rawUrl: string;
  affiliate: AffiliateConfigInput;
  externalProductId?: string | null;
}): AffiliateUrlResolution | null {
  if (!hasCompleteAffiliateConfig(input.affiliate)) return null;

  const mode = getAffiliateMode(input.affiliate);
  const affUrl = normalizedValue(input.affiliate.affUrl);
  if (mode === "full_replace") {
    return {
      url: parseHttpUrl(affUrl, "返利链接").toString(),
      mode: "replace",
      productId: null,
    };
  }

  if (mode === "product_param") {
    const productParam = normalizedValue(input.affiliate.affiliateProductParam);
    if (!isAffiliateParameterName(productParam)) {
      throw new Error("产品 ID 参数格式不正确");
    }
    const productId = extractAffiliateProductId({
      externalProductId: input.externalProductId,
      purchaseUrl: input.rawUrl,
      productParam,
    });
    if (!productId) return null;
    const url = parseHttpUrl(affUrl, "返利链接");
    url.searchParams.set(productParam, productId);
    return { url: url.toString(), mode: "product-param", productId };
  }

  const affParam = normalizedValue(input.affiliate.affParam);
  const affValue = normalizedValue(input.affiliate.affValue);
  if (!isAffiliateParameterName(affParam)) {
    throw new Error("返利参数格式不正确");
  }
  const url = parseHttpUrl(input.rawUrl, "供应商购买链接");
  url.searchParams.set(affParam, affValue);
  return { url: url.toString(), mode: "param", productId: null };
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
