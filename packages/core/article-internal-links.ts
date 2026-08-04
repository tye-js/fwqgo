import * as cheerio from "cheerio";

export type ArticleLinkLanguage = "zh" | "en";

export type ArticleRelevanceSource = {
  title: string;
  description?: string | null;
  content?: string | null;
  keywords?: string | null;
  categoryId: number;
  recommendedTagId?: number | null;
  tagIds: number[];
  tagNames: string[];
  primaryKeyword?: string | null;
  secondaryKeywords?: string[];
};

export type RelatedPostRelevanceCandidate = {
  id: number;
  title: string;
  description?: string | null;
  keywords?: string | null;
  categoryId: number;
  recommendedTagId?: number | null;
  tagIds: number[];
  tagNames: string[];
};

export type KnowledgeRelevanceCandidate = {
  id: number;
  title: string;
  summary?: string | null;
  keywords?: string | null;
  aliases?: string | null;
  retrievalTerms?: string | null;
};

export type RelevanceScore = {
  score: number;
  reasons: string[];
};

export type RenderableInlineLink = {
  targetKey: string;
  anchorText: string;
  href: string;
  occurrenceIndex?: number;
};

const genericAnchorTerms = new Set([
  "vps",
  "server",
  "servers",
  "服务器",
  "套餐",
  "优惠",
  "活动",
  "价格",
  "配置",
  "详情",
]);

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function phrases(value: string | null | undefined) {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,，、;；|/\n]/)
        .map((item) => item.trim())
        .filter((item) => {
          const normalized = normalize(item);
          return normalized.length >= 2 && !genericAnchorTerms.has(normalized);
        }),
    ),
  ];
}

function sourceCorpus(source: ArticleRelevanceSource) {
  return normalize(
    [
      source.title,
      source.description,
      source.content,
      source.keywords,
      ...source.tagNames,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function scoreRelatedPost(
  source: ArticleRelevanceSource,
  candidate: RelatedPostRelevanceCandidate,
): RelevanceScore {
  const reasons: string[] = [];
  let score = 0;

  if (
    source.recommendedTagId &&
    candidate.recommendedTagId === source.recommendedTagId
  ) {
    score += 40;
    reasons.push("同一商家");
  }

  const candidateTags = new Set(candidate.tagIds);
  const sharedTagCount = source.tagIds.filter((id) =>
    candidateTags.has(id),
  ).length;
  if (sharedTagCount > 0) {
    score += Math.min(30, sharedTagCount * 15);
    reasons.push(`共享 ${sharedTagCount} 个标签`);
  }

  if (candidate.categoryId === source.categoryId) {
    score += 15;
    reasons.push("同一分类");
  }

  const candidateCorpus = normalize(
    [
      candidate.title,
      candidate.description,
      candidate.keywords,
      ...candidate.tagNames,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (
    source.primaryKeyword &&
    candidateCorpus.includes(normalize(source.primaryKeyword))
  ) {
    score += 20;
    reasons.push("命中主关键词");
  }

  const secondaryMatches = (source.secondaryKeywords ?? []).filter(
    (keyword) => candidateCorpus.includes(normalize(keyword)),
  ).length;
  if (secondaryMatches > 0) {
    score += secondaryMatches * 5;
    reasons.push(`命中 ${secondaryMatches} 个次要关键词`);
  }

  return { score: boundedScore(score), reasons };
}

export function knowledgeCandidatePhrases(
  candidate: KnowledgeRelevanceCandidate,
) {
  return [
    ...new Set([
      candidate.title.trim(),
      ...phrases(candidate.aliases),
      ...phrases(candidate.keywords),
      ...phrases(candidate.retrievalTerms),
    ]),
  ].filter((item) => {
    const normalized = normalize(item);
    return normalized.length >= 2 && !genericAnchorTerms.has(normalized);
  });
}

export function findKnowledgeAnchor(
  source: ArticleRelevanceSource,
  candidate: KnowledgeRelevanceCandidate,
) {
  const corpus = sourceCorpus(source);
  return knowledgeCandidatePhrases(candidate)
    .filter((phrase) => corpus.includes(normalize(phrase)))
    .sort((left, right) => right.length - left.length)[0] ?? null;
}

export function findKnowledgeAnchorInContent(
  content: string,
  candidate: KnowledgeRelevanceCandidate,
) {
  const corpus = normalize(content);
  return (
    knowledgeCandidatePhrases(candidate)
      .filter((phrase) => corpus.includes(normalize(phrase)))
      .sort((left, right) => right.length - left.length)[0] ?? null
  );
}

export function scoreKnowledgeArticle(
  source: ArticleRelevanceSource,
  candidate: KnowledgeRelevanceCandidate,
): RelevanceScore {
  const corpus = sourceCorpus(source);
  const matchedPhrases = knowledgeCandidatePhrases(candidate).filter((phrase) =>
    corpus.includes(normalize(phrase)),
  );
  const reasons: string[] = [];
  let score = 0;

  if (matchedPhrases.length > 0) {
    score += Math.min(60, matchedPhrases.length * 30);
    reasons.push(`正文命中：${matchedPhrases.slice(0, 2).join("、")}`);
  }

  const plannedKeywords = [
    source.primaryKeyword,
    ...(source.secondaryKeywords ?? []),
  ].filter((item): item is string => Boolean(item));
  const candidateCorpus = normalize(
    [
      candidate.title,
      candidate.summary,
      candidate.keywords,
      candidate.aliases,
      candidate.retrievalTerms,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const planMatches = plannedKeywords.filter(
    (keyword) =>
      candidateCorpus.includes(normalize(keyword)) ||
      normalize(keyword).includes(normalize(candidate.title)),
  ).length;
  if (planMatches > 0) {
    score += 20;
    reasons.push("命中已验证关键词规划");
  }

  return { score: boundedScore(score), reasons };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeInternalHref(value: string) {
  const href = value.trim();
  return href.startsWith("/") && !href.startsWith("//") && !/[\u0000-\u001f]/.test(href)
    ? href
    : null;
}

export function applyInternalLinksToArticleHtml(
  html: string,
  links: RenderableInlineLink[],
) {
  const $ = cheerio.load(html, null, false);
  const appliedTargetKeys: string[] = [];
  const linkedContainers = new Set<object>();
  const orderedLinks = [...links]
    .filter((link) => link.anchorText.trim().length >= 2)
    .sort((left, right) => right.anchorText.length - left.anchorText.length)
    .slice(0, 4);

  for (const link of orderedLinks) {
    const href = safeInternalHref(link.href);
    const alreadyLinked = $("a[href]")
      .toArray()
      .some((element) => $(element).attr("href") === href);
    if (!href || alreadyLinked) {
      continue;
    }

    const anchor = link.anchorText.trim();
    const normalizedAnchor = normalize(anchor);
    const requestedOccurrence = Math.max(0, link.occurrenceIndex ?? 0);
    let occurrence = 0;
    let applied = false;

    $("p, li").each((_, container) => {
      if (applied || linkedContainers.has(container)) return;
      const $container = $(container);
      if ($container.closest("table, pre, code, a, h1, h2, h3, h4, h5, h6").length > 0) {
        return;
      }

      $container.contents().each((__, node) => {
        if (applied || String(node.type) !== "text" || !("data" in node)) return;
        const text = node.data;
        const normalizedText = normalize(text);
        const normalizedIndex = normalizedText.indexOf(normalizedAnchor);
        if (normalizedIndex < 0) return;

        const exactIndex = text.toLowerCase().indexOf(anchor.toLowerCase());
        if (exactIndex < 0) return;
        if (occurrence < requestedOccurrence) {
          occurrence += 1;
          return;
        }

        const before = text.slice(0, exactIndex);
        const matched = text.slice(exactIndex, exactIndex + anchor.length);
        const after = text.slice(exactIndex + anchor.length);
        $(node).replaceWith(
          `${escapeHtml(before)}<a href="${escapeHtml(href)}" data-internal-link="${escapeHtml(link.targetKey)}">${escapeHtml(matched)}</a>${escapeHtml(after)}`,
        );
        linkedContainers.add(container);
        appliedTargetKeys.push(link.targetKey);
        applied = true;
      });
    });
  }

  return { html: $.html(), appliedTargetKeys };
}
