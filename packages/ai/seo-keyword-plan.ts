export const seoKeywordProvenanceValues = [
  "body",
  "table",
  "title",
  "taxonomy",
] as const;

export type SeoKeywordProvenance =
  (typeof seoKeywordProvenanceValues)[number];

export type SeoSearchIntent =
  | "transactional"
  | "informational"
  | "mixed";

export type SeoKeywordEvidence = {
  text: string;
  provenance: SeoKeywordProvenance;
};

export type ValidatedSeoKeywordCandidate = {
  keyword: string;
  evidence: SeoKeywordEvidence[];
  bodyEligible: boolean;
};

export type RejectedSeoKeywordCandidate = {
  keyword: string;
  reason: string;
};

export type ValidatedSeoKeywordPlan = {
  primaryKeyword: ValidatedSeoKeywordCandidate | null;
  secondaryKeywords: ValidatedSeoKeywordCandidate[];
  longTailKeywords: ValidatedSeoKeywordCandidate[];
  searchIntent: SeoSearchIntent;
  rejectedKeywords: RejectedSeoKeywordCandidate[];
};

export type SeoKeywordPlanRaw = Partial<{
  primaryKeyword: unknown;
  secondaryKeywords: unknown;
  longTailKeywords: unknown;
  searchIntent: unknown;
}>;

type KeywordValidationContext = {
  sourceMarkdown: string;
  sourceTitle?: string | null;
  taxonomyTerms?: string[];
};

const genericEnglishTerms = new Set([
  "vps",
  "server",
  "servers",
  "cloud",
  "hosting",
  "deal",
  "deals",
  "offer",
  "offers",
  "promo",
  "review",
  "guide",
  "buy",
]);

const genericChineseTerms = [
  "独立服务器",
  "云服务器",
  "服务器",
  "主机",
  "套餐",
  "优惠",
  "活动",
  "促销",
  "测评",
  "评测",
  "购买",
  "价格",
  "配置",
  "教程",
  "指南",
  "商家",
];

const claimTerms = [
  "高性价比",
  "性价比",
  "最便宜",
  "最低价",
  "低延迟",
  "零丢包",
  "稳定",
  "最佳",
  "最优",
  "首选",
  "推荐",
  "适合建站",
  "适合生产",
  "值得购买",
];

function normalizeComparable(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function normalizeProvenance(value: unknown): SeoKeywordProvenance {
  return typeof value === "string" &&
    seoKeywordProvenanceValues.includes(value as SeoKeywordProvenance)
    ? (value as SeoKeywordProvenance)
    : "body";
}

function normalizeEvidence(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .flatMap((item): SeoKeywordEvidence[] => {
      if (typeof item === "string") {
        const text = normalizeText(item, 240);
        return text ? [{ text, provenance: "body" }] : [];
      }
      if (!item || typeof item !== "object") return [];

      const record = item as Record<string, unknown>;
      const text = normalizeText(record.text ?? record.quote, 240);
      return text
        ? [{ text, provenance: normalizeProvenance(record.provenance) }]
        : [];
    })
    .slice(0, 4);
}

function normalizeCandidate(value: unknown) {
  if (typeof value === "string") {
    return { keyword: normalizeText(value, 120), evidence: [] };
  }
  if (!value || typeof value !== "object") {
    return { keyword: "", evidence: [] };
  }

  const record = value as Record<string, unknown>;
  return {
    keyword: normalizeText(record.keyword ?? record.value, 120),
    evidence: normalizeEvidence(record.evidence),
  };
}

function rawCandidateList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value as unknown[];
  return value === null || value === undefined ? [] : [value];
}

function evidenceExists(
  evidence: SeoKeywordEvidence,
  context: KeywordValidationContext,
) {
  const needle = normalizeComparable(evidence.text);
  if (!needle) return false;

  if (evidence.provenance === "taxonomy") {
    return (context.taxonomyTerms ?? []).some((term) =>
      normalizeComparable(term).includes(needle),
    );
  }

  const corpus =
    evidence.provenance === "title"
      ? context.sourceTitle ?? ""
      : context.sourceMarkdown;
  return normalizeComparable(corpus).includes(needle);
}

function unsupportedKeywordFragment(
  keyword: string,
  evidence: SeoKeywordEvidence[],
) {
  const normalizedEvidence = normalizeComparable(
    evidence.map((item) => item.text).join(" "),
  );
  const normalizedKeyword = normalizeComparable(keyword);

  for (const term of claimTerms) {
    const normalizedTerm = normalizeComparable(term);
    if (
      normalizedKeyword.includes(normalizedTerm) &&
      !normalizedEvidence.includes(normalizedTerm)
    ) {
      return term;
    }
  }

  const englishTokens = keyword.match(/[a-z][a-z0-9.+/_-]{1,}/gi) ?? [];
  for (const token of englishTokens) {
    const normalized = token.toLowerCase();
    if (
      !genericEnglishTerms.has(normalized) &&
      !normalizedEvidence.includes(normalizeComparable(token))
    ) {
      return token;
    }
  }

  const chineseRuns = keyword.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  for (const run of chineseRuns) {
    let factualFragment = run;
    for (const generic of genericChineseTerms) {
      factualFragment = factualFragment.replaceAll(generic, "");
    }
    factualFragment = factualFragment.replace(/[的与和及]/g, "");
    if (
      factualFragment.length >= 2 &&
      !normalizedEvidence.includes(normalizeComparable(factualFragment))
    ) {
      return factualFragment;
    }
  }

  for (const number of keyword.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    if (!normalizedEvidence.includes(normalizeComparable(number))) {
      return number;
    }
  }

  return null;
}

function validateCandidate(
  value: unknown,
  context: KeywordValidationContext,
):
  | { candidate: ValidatedSeoKeywordCandidate; rejection: null }
  | { candidate: null; rejection: RejectedSeoKeywordCandidate | null } {
  const normalized = normalizeCandidate(value);
  if (!normalized.keyword) return { candidate: null, rejection: null };
  if (normalized.evidence.length === 0) {
    return {
      candidate: null,
      rejection: { keyword: normalized.keyword, reason: "没有提供原文证据" },
    };
  }

  const missingEvidence = normalized.evidence.find(
    (evidence) => !evidenceExists(evidence, context),
  );
  if (missingEvidence) {
    return {
      candidate: null,
      rejection: {
        keyword: normalized.keyword,
        reason: `证据无法在${missingEvidence.provenance === "taxonomy" ? "分类信息" : "清洗原文"}中定位：${missingEvidence.text}`,
      },
    };
  }

  const unsupportedFragment = unsupportedKeywordFragment(
    normalized.keyword,
    normalized.evidence,
  );
  if (unsupportedFragment) {
    return {
      candidate: null,
      rejection: {
        keyword: normalized.keyword,
        reason: `关键词中的“${unsupportedFragment}”缺少对应证据`,
      },
    };
  }

  return {
    candidate: {
      keyword: normalized.keyword,
      evidence: normalized.evidence,
      bodyEligible: normalized.evidence.some(
        (item) => item.provenance !== "taxonomy",
      ),
    },
    rejection: null,
  };
}

function normalizeIntent(value: unknown): SeoSearchIntent {
  return value === "transactional" || value === "informational"
    ? value
    : "mixed";
}

export function validateSeoKeywordPlan(
  raw: SeoKeywordPlanRaw | null | undefined,
  context: KeywordValidationContext,
): ValidatedSeoKeywordPlan {
  const rejectedKeywords: RejectedSeoKeywordCandidate[] = [];
  const seen = new Set<string>();

  const validateList = (values: unknown[], limit: number) => {
    const accepted: ValidatedSeoKeywordCandidate[] = [];
    for (const value of values) {
      const result = validateCandidate(value, context);
      if (result.rejection) rejectedKeywords.push(result.rejection);
      if (!result.candidate) continue;

      const key = normalizeComparable(result.candidate.keyword);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      accepted.push(result.candidate);
      if (accepted.length >= limit) break;
    }
    return accepted;
  };

  const primaryKeyword = validateList(
    rawCandidateList(raw?.primaryKeyword),
    1,
  )[0] ?? null;
  const secondaryKeywords = validateList(
    rawCandidateList(raw?.secondaryKeywords),
    4,
  );
  const longTailKeywords = validateList(
    rawCandidateList(raw?.longTailKeywords),
    3,
  );

  return {
    primaryKeyword,
    secondaryKeywords,
    longTailKeywords,
    searchIntent: normalizeIntent(raw?.searchIntent),
    rejectedKeywords: rejectedKeywords.slice(0, 20),
  };
}

export function validSeoKeywordCandidates(plan: ValidatedSeoKeywordPlan) {
  return [
    ...(plan.primaryKeyword ? [plan.primaryKeyword] : []),
    ...plan.secondaryKeywords,
    ...plan.longTailKeywords,
  ];
}

export function bodySeoKeywordCandidates(plan: ValidatedSeoKeywordPlan) {
  return validSeoKeywordCandidates(plan).filter(
    (candidate) => candidate.bodyEligible,
  );
}

export function reconcileSeoKeywords(input: {
  generatedKeywords: string[];
  plan: ValidatedSeoKeywordPlan;
  acceptedMarkdown: string;
}) {
  const planned = validSeoKeywordCandidates(input.plan);
  const plannedByKey = new Map(
    planned.map((candidate) => [
      normalizeComparable(candidate.keyword),
      candidate.keyword,
    ]),
  );
  const acceptedComparable = normalizeComparable(input.acceptedMarkdown);
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (keyword: string) => {
    const trimmed = keyword.trim();
    const key = normalizeComparable(trimmed);
    if (!key || seen.has(key)) return;

    const plannedKeyword = plannedByKey.get(key);
    const supportedByAcceptedBody =
      acceptedComparable.includes(key) ||
      unsupportedKeywordFragment(trimmed, [
        { text: input.acceptedMarkdown, provenance: "body" },
      ]) === null;
    if (!plannedKeyword && !supportedByAcceptedBody) return;
    seen.add(key);
    result.push(plannedKeyword ?? trimmed);
  };

  input.generatedKeywords.forEach(add);
  planned.forEach((candidate) => add(candidate.keyword));

  return result.slice(0, 6);
}
