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
