export type KnowledgeRankCandidate = {
  title: string;
  categoryName: string;
  summary: string | null;
  keywords: string | null;
  aliases: string | null;
  retrievalTerms: string | null;
  content: string;
};

const priorityTermPattern =
  /\b(?:CN2(?:\s*GIA)?|CMIN2|CMI|CUII|BGP|IPLC|IEPL|NTT|Cogent|HE|GTT|AS\d{3,6}|IPv4|IPv6|KVM|LXC|VPS|VDS|NVMe|SSD|HDD|DDoS|Anycast)\b/gi;
const ignoredTerms = new Set([
  "服务器",
  "套餐",
  "商家",
  "优惠",
  "价格",
  "配置",
  "文章",
  "用户",
  "适合",
  "支持",
  "需要",
]);

function normalizeTerm(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function addTerm(terms: string[], seen: Set<string>, value: string) {
  const normalized = normalizeTerm(value)
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim();
  if (
    normalized.length < 2 ||
    normalized.length > 64 ||
    ignoredTerms.has(normalized) ||
    seen.has(normalized)
  ) {
    return;
  }

  seen.add(normalized);
  terms.push(normalized);
}

export function buildKnowledgeSearchTerms(
  values: Array<string | null | undefined>,
  limit = 18,
) {
  const text = values
    .filter((value): value is string => Boolean(value))
    .join("\n");
  const terms: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(priorityTermPattern)) {
    addTerm(terms, seen, match[0]);
  }

  for (const part of text.split(/[\n,，、;；|/：:（）()\[\]]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    addTerm(terms, seen, trimmed);
    for (const token of trimmed.matchAll(
      /[a-z][a-z0-9.+-]{1,31}|[\u4e00-\u9fff]{2,12}/gi,
    )) {
      addTerm(terms, seen, token[0]);
    }
  }

  return terms.slice(0, Math.max(0, limit));
}

function splitTerms(value: string | null) {
  return (value ?? "")
    .split(/[\n,，、;；|]+/)
    .map(normalizeTerm)
    .filter(Boolean);
}

function textIncludes(value: string | null, term: string) {
  return normalizeTerm(value ?? "").includes(term);
}

export function rankKnowledgeCandidate(
  candidate: KnowledgeRankCandidate,
  searchTerms: string[],
) {
  const aliases = splitTerms(candidate.aliases);
  const retrievalTerms = splitTerms(candidate.retrievalTerms);
  const keywords = splitTerms(candidate.keywords);
  const title = normalizeTerm(candidate.title);
  let score = 0;

  for (const rawTerm of searchTerms) {
    const term = normalizeTerm(rawTerm);
    if (!term) continue;

    if (title === term) score += 36;
    else if (title.includes(term)) score += 22;
    if (aliases.includes(term)) score += 28;
    else if (aliases.some((alias) => alias.includes(term))) score += 16;
    if (retrievalTerms.includes(term)) score += 22;
    else if (retrievalTerms.some((item) => item.includes(term))) score += 12;
    if (keywords.includes(term)) score += 16;
    else if (keywords.some((item) => item.includes(term))) score += 8;
    if (textIncludes(candidate.categoryName, term)) score += 10;
    if (textIncludes(candidate.summary, term)) score += 6;
    if (textIncludes(candidate.content, term)) score += 2;
  }

  return score;
}
