export type AffiliateConfigInput = {
  affUrl: string;
  affParam: string;
  affValue: string;
};

export function getAffiliateConfigState(
  input: AffiliateConfigInput,
): "empty" | "partial" | "complete" {
  const values = [input.affUrl, input.affParam, input.affValue].map((value) =>
    value.trim(),
  );
  const configuredCount = values.filter(Boolean).length;

  if (configuredCount === 0) return "empty";
  if (configuredCount === values.length) return "complete";
  return "partial";
}

export function hasCompleteAffiliateConfig(input: AffiliateConfigInput) {
  return getAffiliateConfigState(input) === "complete";
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
