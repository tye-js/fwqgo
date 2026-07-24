export type ProtectedMarkdownBlock = {
  placeholder: string;
  markdown: string;
  kind: "table" | "link";
};

export type ProtectedMarkdownContent = {
  tables: ProtectedMarkdownBlock[];
  links: ProtectedMarkdownBlock[];
};

export type RewriteQualityMetrics = {
  passed: boolean;
  originalityScore: number;
  narrativeSimilarity: number;
  exactSentenceRatio: number;
  headingSimilarity: number;
  criticalFactCoverage: number;
  missingCriticalFacts: string[];
  unsupportedCriticalFacts: string[];
  sourceNarrativeLength: number;
  outputNarrativeLength: number;
  reasons: string[];
};

type MarkdownTableRange = {
  start: number;
  end: number;
  markdown: string;
};

const markdownLinkPattern =
  /\[([^\]]+)]\((<([^>]+)>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
const standaloneUrlPattern = /(?:https?:\/\/|\/go\/)[^\s)<>'"]+/gi;
const tableRowPattern = /^\s*\|.*\|\s*$/;
const tableSeparatorPattern =
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function markdownTableRanges(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const ranges: MarkdownTableRange[] = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (
      !tableRowPattern.test(lines[index] ?? "") ||
      !tableSeparatorPattern.test(lines[index + 1] ?? "")
    ) {
      continue;
    }

    let end = index + 2;
    while (end < lines.length && tableRowPattern.test(lines[end] ?? "")) {
      end += 1;
    }

    ranges.push({
      start: index,
      end,
      markdown: lines.slice(index, end).join("\n").trim(),
    });
    index = end - 1;
  }

  return { lines, ranges };
}

function removeMarkdownTableRanges(markdown: string) {
  const { lines, ranges } = markdownTableRanges(markdown);
  const tableLines = new Set<number>();

  ranges.forEach((range) => {
    for (let index = range.start; index < range.end; index += 1) {
      tableLines.add(index);
    }
  });

  return lines
    .map((line, index) => (tableLines.has(index) ? "" : line))
    .join("\n");
}

function normalizeHref(value: string) {
  return value
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/[.,，。；;]+$/g, "");
}

export function protectMarkdownContent(
  markdown: string,
): ProtectedMarkdownContent {
  const { ranges } = markdownTableRanges(markdown);
  const withoutTables = removeMarkdownTableRanges(markdown);
  const tables = ranges.map((range, index) => ({
    placeholder: `{{SOURCE_TABLE_${index + 1}}}`,
    markdown: range.markdown,
    kind: "table" as const,
  }));
  const links: ProtectedMarkdownBlock[] = [];

  for (const match of withoutTables.matchAll(markdownLinkPattern)) {
    const label = match[1]?.trim();
    const href = normalizeHref(match[3] ?? match[2] ?? "");
    if (!label || !href) continue;

    links.push({
      placeholder: `{{SOURCE_LINK_${links.length + 1}}}`,
      markdown: `[${label}](${href})`,
      kind: "link",
    });
  }

  const withoutMarkdownLinks = withoutTables.replace(markdownLinkPattern, " ");
  for (const match of withoutMarkdownLinks.matchAll(standaloneUrlPattern)) {
    const href = normalizeHref(match[0]);
    if (!href) continue;
    links.push({
      placeholder: `{{SOURCE_LINK_${links.length + 1}}}`,
      markdown: href,
      kind: "link",
    });
  }

  return { tables, links };
}

export function replaceProtectedMarkdown(
  markdown: string,
  protectedContent: ProtectedMarkdownContent,
) {
  let prepared = markdown;

  for (const table of protectedContent.tables) {
    prepared = prepared.replace(table.markdown, table.placeholder);
  }
  for (const link of protectedContent.links) {
    prepared = prepared.replace(link.markdown, link.placeholder);
  }

  return prepared;
}

export function restoreProtectedMarkdown(
  markdown: string,
  protectedContent: ProtectedMarkdownContent,
) {
  let restored = markdown;
  const missingPlaceholders: string[] = [];

  for (const block of [...protectedContent.tables, ...protectedContent.links]) {
    const placeholderCount = restored.split(block.placeholder).length - 1;

    if (placeholderCount !== 1) {
      missingPlaceholders.push(block.placeholder);
    }
    if (placeholderCount === 0) {
      continue;
    }

    restored = restored.replace(block.placeholder, block.markdown);
    restored = restored.split(block.placeholder).join("");
  }

  return {
    markdown: restored.replace(/\n{3,}/g, "\n\n").trim(),
    missingPlaceholders,
  };
}

function narrativeMarkdown(markdown: string) {
  const lines = removeMarkdownTableRanges(markdown).split(/\r?\n/);
  const narrativeLines: string[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence || /^\s*#{1,6}\s+/.test(line)) continue;

    narrativeLines.push(line);
  }

  return narrativeLines
    .join("\n")
    .replace(markdownLinkPattern, "$1")
    .replace(/(?:https?:\/\/|\/go\/)[^\s)<>'"]+/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[`*_>|~]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeNarrative(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b[a-z][a-z0-9.+/_-]*\b/gi, " ")
    .replace(/\d+(?:[.,]\d+)?/g, " ")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function characterShingles(value: string, width = 8) {
  const characters = Array.from(value);
  const result = new Set<string>();

  for (let index = 0; index + width <= characters.length; index += 1) {
    result.add(characters.slice(index, index + width).join(""));
  }

  return result;
}

function containmentPercent(source: Set<string>, output: Set<string>) {
  if (output.size === 0) return 0;

  let overlap = 0;
  output.forEach((item) => {
    if (source.has(item)) overlap += 1;
  });

  return clampPercent((overlap / output.size) * 100);
}

function exactSentenceRatio(source: string, output: string) {
  const normalizedSource = normalizeNarrative(source);
  const outputSentences = output
    .split(/[。！？!?\n]+/)
    .map(normalizeNarrative)
    .filter((sentence) => Array.from(sentence).length >= 18);

  if (outputSentences.length === 0) return 0;

  const totalLength = outputSentences.reduce(
    (total, sentence) => total + Array.from(sentence).length,
    0,
  );
  const copiedLength = outputSentences.reduce(
    (total, sentence) =>
      total +
      (normalizedSource.includes(sentence) ? Array.from(sentence).length : 0),
    0,
  );

  return clampPercent((copiedLength / totalLength) * 100);
}

function markdownHeadings(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => /^\s*#{1,6}\s+(.+)$/.exec(line)?.[1] ?? "")
    .map(normalizeNarrative)
    .filter(Boolean);
}

function headingSimilarity(source: string, output: string) {
  const sourceHeadings = new Set(markdownHeadings(source));
  const outputHeadings = markdownHeadings(output);
  if (sourceHeadings.size < 3 || outputHeadings.length < 3) return 0;

  const copied = outputHeadings.filter((heading) =>
    sourceHeadings.has(heading),
  ).length;
  return clampPercent((copied / outputHeadings.length) * 100);
}

function canonicalNumber(value: string) {
  const normalized = /^\d{1,3},\d{3}(?:,\d{3})*$/.test(value)
    ? value.replace(/,/g, "")
    : value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? String(parsed) : normalized.toLowerCase();
}

function addOperatorTokens(tokens: Set<string>, markdown: string) {
  const operatorKeys: Record<string, string> = {
    电信: "telecom",
    联通: "unicom",
    移动: "mobile",
  };
  const operatorContext =
    /用户|线路|网络|宽带|回程|去程|运营商|访问|延迟|丢包|路由|效果/;

  for (const match of markdown.matchAll(/(?:中国)?(电信|联通|移动)/g)) {
    const operator = match[1];
    if (!operator) continue;

    const index = match.index ?? 0;
    const context = markdown.slice(
      Math.max(0, index - 10),
      Math.min(markdown.length, index + match[0].length + 10),
    );
    if (
      operator === "移动" &&
      !match[0].startsWith("中国") &&
      !operatorContext.test(context)
    ) {
      continue;
    }

    tokens.add(`operator:${operatorKeys[operator]}`);
  }
}

function addAttributionTokens(tokens: Set<string>, markdown: string) {
  const patterns: Array<[string, RegExp]> = [
    [
      "community-feedback",
      /(?:官方)?社区[^。！？\n]{0,16}(?:反馈|评价|讨论|显示)|(?:用户|网友)[^。！？\n]{0,12}(?:反馈|评价)/,
    ],
    [
      "test-result",
      /实测|测速结果|测试(?:显示|表明|结果)|(?:延迟|丢包)[^。！？\n]{0,10}(?:测试|实测)/,
    ],
    [
      "official-claim",
      /(?:官方|商家|供应商)[^。！？\n]{0,12}(?:表示|宣称|确认|承诺|公告)/,
    ],
  ];

  for (const [key, pattern] of patterns) {
    if (pattern.test(markdown)) tokens.add(`attribution:${key}`);
  }
}

function criticalFactTokens(markdown: string) {
  const tokens = new Set<string>();
  const normalized = markdown.normalize("NFKC");
  const numericContext =
    /[$€£¥￥%％折元美金美元加元欧元英镑日元年月日核]|\b(?:gb|tb|mb|gib|tib|mbps|gbps|ghz|mhz|ipv4|ipv6|ip|as)\b/i;

  for (const match of normalized.matchAll(/(?<![a-z])\d+(?:[.,]\d+)?/gi)) {
    const index = match.index ?? 0;
    const context = normalized.slice(
      Math.max(0, index - 12),
      Math.min(normalized.length, index + match[0].length + 12),
    );
    const followingText = normalized.slice(
      index + match[0].length,
      index + match[0].length + 6,
    );
    if (
      numericContext.test(context) ||
      /^\s*(?:天|小时)/.test(followingText)
    ) {
      tokens.add(`number:${canonicalNumber(match[0])}`);
    }
  }

  for (const match of normalized.matchAll(
    /\b(?:AS\d{3,6}|CN2(?:\s*GIA)?|CMIN2|CUII|BGP|NTT|Cogent)\b/gi,
  )) {
    tokens.add(`term:${match[0].replace(/\s+/g, "").toLowerCase()}`);
  }

  for (const match of normalized.matchAll(
    /(?:优惠码|折扣码|coupon|promo(?:\s*code)?)[^\n：:]{0,16}[：:\s]+([a-z0-9][a-z0-9_-]{3,})/gi,
  )) {
    if (match[1]) tokens.add(`code:${match[1].toLowerCase()}`);
  }

  for (const match of normalized.matchAll(
    /(?:https?:\/\/|\/go\/)[^\s)<>'"]+/gi,
  )) {
    tokens.add(`url:${normalizeHref(match[0]).toLowerCase()}`);
  }

  addOperatorTokens(tokens, normalized);
  addAttributionTokens(tokens, normalized);

  return tokens;
}

function displayCriticalFactToken(token: string) {
  const labels: Record<string, string> = {
    "operator:telecom": "电信",
    "operator:unicom": "联通",
    "operator:mobile": "移动",
    "attribution:community-feedback": "社区或用户反馈归因",
    "attribution:test-result": "实测或测试结果归因",
    "attribution:official-claim": "官方或商家声明归因",
  };

  return labels[token] ?? token.replace(/^(?:number|term|code|url):/, "");
}

function criticalFactComparison(
  source: string,
  output: string,
  allowedFactsMarkdown = "",
) {
  const sourceFacts = criticalFactTokens(source);
  const allowedFacts = criticalFactTokens(
    allowedFactsMarkdown ? `${source}\n${allowedFactsMarkdown}` : source,
  );
  const outputFacts = criticalFactTokens(output);
  const missing = [...sourceFacts].filter((fact) => !outputFacts.has(fact));
  const unsupported = [...outputFacts].filter(
    (fact) => !allowedFacts.has(fact),
  );
  const coverage =
    sourceFacts.size === 0
      ? 100
      : clampPercent(
          ((sourceFacts.size - missing.length) / sourceFacts.size) * 100,
        );

  return {
    coverage,
    missing: missing.map(displayCriticalFactToken),
    unsupported: unsupported.map(displayCriticalFactToken),
    sourceFactCount: sourceFacts.size,
  };
}

export function evaluateRewriteQuality(
  sourceMarkdown: string,
  outputMarkdown: string,
  options: { allowedFactsMarkdown?: string } = {},
): RewriteQualityMetrics {
  const sourceNarrative = narrativeMarkdown(sourceMarkdown);
  const outputNarrative = narrativeMarkdown(outputMarkdown);
  const normalizedSource = normalizeNarrative(sourceNarrative);
  const normalizedOutput = normalizeNarrative(outputNarrative);
  const sourceNarrativeLength = Array.from(normalizedSource).length;
  const outputNarrativeLength = Array.from(normalizedOutput).length;
  const narrativeSimilarity = containmentPercent(
    characterShingles(normalizedSource),
    characterShingles(normalizedOutput),
  );
  const sentenceRatio = exactSentenceRatio(sourceNarrative, outputNarrative);
  const headings = headingSimilarity(sourceMarkdown, outputMarkdown);
  const criticalFacts = criticalFactComparison(
    sourceMarkdown,
    outputMarkdown,
    options.allowedFactsMarkdown,
  );
  const maxNarrativeSimilarity =
    sourceNarrativeLength < 200 ? 60 : sourceNarrativeLength < 500 ? 50 : 42;
  const requiredFactCoverage = criticalFacts.sourceFactCount <= 4 ? 100 : 90;
  const reasons: string[] = [];

  if (narrativeSimilarity > maxNarrativeSimilarity) {
    reasons.push(
      `叙述片段重合率 ${narrativeSimilarity}% 超过 ${maxNarrativeSimilarity}%`,
    );
  }
  if (sentenceRatio > 25) {
    reasons.push(`完整长句复用率 ${sentenceRatio}% 超过 25%`);
  }
  if (headings > 75) {
    reasons.push(`小标题结构重合率 ${headings}% 超过 75%`);
  }
  if (criticalFacts.coverage < requiredFactCoverage) {
    reasons.push(
      `关键事实覆盖率 ${criticalFacts.coverage}% 低于 ${requiredFactCoverage}%`,
    );
  }
  if (criticalFacts.unsupported.length > 0) {
    reasons.push(
      `正文出现原文不存在的关键值：${criticalFacts.unsupported.slice(0, 6).join("、")}`,
    );
  }

  const originalityPenalty = Math.max(
    narrativeSimilarity,
    sentenceRatio,
    headings * 0.65,
  );

  return {
    passed: reasons.length === 0,
    originalityScore: clampPercent(100 - originalityPenalty),
    narrativeSimilarity,
    exactSentenceRatio: sentenceRatio,
    headingSimilarity: headings,
    criticalFactCoverage: criticalFacts.coverage,
    missingCriticalFacts: criticalFacts.missing,
    unsupportedCriticalFacts: criticalFacts.unsupported,
    sourceNarrativeLength,
    outputNarrativeLength,
    reasons,
  };
}
