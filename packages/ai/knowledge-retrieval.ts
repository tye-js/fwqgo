import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  buildKnowledgeSearchTerms,
  rankKnowledgeCandidate,
} from "@fwqgo/core/knowledge-retrieval";
import { readDb } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";

export type RewriteKnowledgeReference = {
  id: number;
  title: string;
  slug: string;
  categoryName: string;
  summary: string | null;
  definition: string | null;
  highlights: string[] | null;
  quickTip: string | null;
  content: string;
  keywords: string | null;
  aliases: string | null;
  retrievalTerms: string | null;
  score: number;
};

export type RewriteKnowledgeSection = {
  heading: string;
  trigger: string;
  referenceId: number | null;
  referenceTitle: string;
  definition: string;
  highlights: string[];
  quickTip: string;
};

const ignoredSectionTerms = new Set([
  "服务器",
  "套餐",
  "商家",
  "优惠",
  "价格",
  "配置",
  "文章",
]);

const fallbackKnowledgeSections: Array<{
  pattern: RegExp;
  section: RewriteKnowledgeSection;
}> = [
  {
    pattern: /原生\s*IP/i,
    section: {
      heading: "原生IP",
      trigger: "原生IP",
      referenceId: null,
      referenceTitle: "原生 IP 基础知识",
      definition:
        "原生 IP 是主机市场中的常见标签，通常用于描述 IP 注册信息与实际使用地区较一致的情况，但它不是统一的协议分类。",
      highlights: [
        "判断时应分别核对 RDAP 注册信息、起源 ASN、实际路由和目标服务的识别结果。",
        "单一地理数据库或商家标签不能保证第三方平台长期识别一致。",
      ],
      quickTip:
        "购买前使用目标业务进行合规测试，并以目标服务条款和当前识别结果为准。",
    },
  },
];

function normalizeKnowledgeTerm(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizeKnowledgeHeading(value: string) {
  const canonical = fallbackKnowledgeSections.find((fallback) =>
    fallback.pattern.test(value),
  )?.section.heading;
  if (canonical) return canonical;

  return value
    .replace(/[*_`#<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function splitKnowledgeTerms(value: string | null) {
  return (value ?? "")
    .split(/[\n,，、;；|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sectionTermCandidates(reference: RewriteKnowledgeReference) {
  const groups = [
    splitKnowledgeTerms(reference.keywords),
    splitKnowledgeTerms(reference.aliases),
    [reference.title],
    splitKnowledgeTerms(reference.retrievalTerms),
  ];

  return groups.map((terms) =>
    [...new Set(terms)]
      .filter((term) => {
        const normalized = normalizeKnowledgeTerm(term);
        return (
          normalized.length >= 2 &&
          normalized.length <= 48 &&
          !ignoredSectionTerms.has(normalized)
        );
      })
      .sort(
        (left, right) =>
          normalizeKnowledgeTerm(right).length -
          normalizeKnowledgeTerm(left).length,
      ),
  );
}

function conciseKnowledgeValue(value: string | null | undefined, max = 600) {
  return (value ?? "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function selectRewriteKnowledgeSections(
  sourceMarkdown: string,
  references: RewriteKnowledgeReference[],
  limit = 6,
) {
  const normalizedSource = normalizeKnowledgeTerm(sourceMarkdown);
  const sections: RewriteKnowledgeSection[] = [];
  const seenHeadings = new Set<string>();

  for (const reference of references) {
    const trigger = sectionTermCandidates(reference)
      .map((terms) =>
        terms.find((term) => {
          const normalized = normalizeKnowledgeTerm(term);
          return normalized.length >= 2 && normalizedSource.includes(normalized);
        }),
      )
      .find(Boolean);
    if (!trigger) continue;

    const heading = normalizeKnowledgeHeading(trigger);
    const normalizedHeading = normalizeKnowledgeTerm(heading);
    if (!heading || seenHeadings.has(normalizedHeading)) continue;

    const definition = conciseKnowledgeValue(
      reference.definition?.trim() ? reference.definition : reference.summary,
    );
    const highlights = (reference.highlights ?? [])
      .map((item) => conciseKnowledgeValue(item, 320))
      .filter(Boolean)
      .slice(0, 3);
    const quickTip = conciseKnowledgeValue(reference.quickTip, 600);
    if (!definition && highlights.length === 0 && !quickTip) continue;

    sections.push({
      heading,
      trigger,
      referenceId: reference.id,
      referenceTitle: reference.title,
      definition,
      highlights,
      quickTip,
    });
    seenHeadings.add(normalizedHeading);
    if (sections.length >= Math.max(1, limit)) break;
  }

  for (const fallback of fallbackKnowledgeSections) {
    if (
      sections.length >= Math.max(1, limit) ||
      !fallback.pattern.exec(sourceMarkdown)
    ) {
      continue;
    }
    const normalizedHeading = normalizeKnowledgeTerm(fallback.section.heading);
    if (seenHeadings.has(normalizedHeading)) continue;
    sections.push(fallback.section);
    seenHeadings.add(normalizedHeading);
  }

  return sections;
}

export function formatRewriteKnowledgeSections(
  sections: RewriteKnowledgeSection[],
) {
  if (sections.length === 0) {
    return "未匹配到需要新增的基础知识章节。";
  }

  return sections
    .map((section) =>
      [
        `- 必须使用二级标题：## ${section.heading}`,
        `  原文触发词：${section.trigger}`,
        `  知识来源：${section.referenceTitle}`,
        `  基础定义：${section.definition}`,
        ...section.highlights.map((item) => `  核心要点：${item}`),
        section.quickTip ? `  核验提示：${section.quickTip}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

function renderedKnowledgeSection(section: RewriteKnowledgeSection) {
  const body = [
    section.definition,
    ...section.highlights.map((item) => `- ${item}`),
    section.quickTip ? `> 提示：${section.quickTip}` : "",
  ].filter(Boolean);
  return [`## ${section.heading}`, "", ...body].join("\n");
}

export function ensureRewriteKnowledgeSections(
  markdown: string,
  sections: RewriteKnowledgeSection[],
) {
  if (sections.length === 0) return markdown;

  const lines = markdown.split(/\r?\n/);
  const headingPattern = /^\s*#{2,6}\s+(.+?)\s*#*\s*$/;
  const requiredHeadings = new Map(
    sections.map((section) => [
      normalizeKnowledgeTerm(section.heading),
      section.heading,
    ]),
  );
  for (const [index, line] of lines.entries()) {
    const match = headingPattern.exec(line);
    const heading = match?.[1]
      ? requiredHeadings.get(normalizeKnowledgeTerm(match[1]))
      : undefined;
    if (heading) lines[index] = `## ${heading}`;
  }
  const existingHeadings = new Set(
    lines.flatMap((line) => {
      const match = headingPattern.exec(line);
      return match?.[1] ? [normalizeKnowledgeTerm(match[1])] : [];
    }),
  );
  const missing = sections.filter(
    (section) =>
      !existingHeadings.has(normalizeKnowledgeTerm(section.heading)),
  );
  if (missing.length === 0) return lines.join("\n");

  return [lines.join("\n").trimEnd(), ...missing.map(renderedKnowledgeSection)]
    .filter(Boolean)
    .join("\n\n");
}

export async function retrieveRewriteKnowledge(input: {
  language: "zh" | "en";
  values: Array<string | null | undefined>;
  limit?: number;
}) {
  const terms = buildKnowledgeSearchTerms(input.values);
  if (terms.length === 0) return [];
  const categoryName =
    input.language === "en"
      ? knowledgeCategories.enName
      : knowledgeCategories.name;

  const matches = terms.flatMap((term) => {
    const pattern = `%${term}%`;
    return [
      ilike(knowledgeArticles.title, pattern),
      ilike(knowledgeArticles.summary, pattern),
      ilike(knowledgeArticles.definition, pattern),
      ilike(sql`${knowledgeArticles.highlights}::text`, pattern),
      ilike(knowledgeArticles.quickTip, pattern),
      ilike(knowledgeArticles.keywords, pattern),
      ilike(knowledgeArticles.aliases, pattern),
      ilike(knowledgeArticles.retrievalTerms, pattern),
      ilike(categoryName, pattern),
    ];
  });
  const rows = await readDb
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      categoryName: sql<string>`${categoryName}`,
      summary: knowledgeArticles.summary,
      definition: knowledgeArticles.definition,
      highlights: knowledgeArticles.highlights,
      quickTip: knowledgeArticles.quickTip,
      content: knowledgeArticles.content,
      keywords: knowledgeArticles.keywords,
      aliases: knowledgeArticles.aliases,
      retrievalTerms: knowledgeArticles.retrievalTerms,
    })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeCategories,
      eq(knowledgeArticles.categoryId, knowledgeCategories.id),
    )
    .where(
      and(
        eq(knowledgeArticles.language, input.language),
        eq(knowledgeArticles.published, true),
        eq(knowledgeArticles.allowAiReference, true),
        or(...matches),
      ),
    )
    .orderBy(
      desc(knowledgeArticles.contentUpdatedAt),
      desc(knowledgeArticles.id),
    )
    .limit(80);

  return rows
    .map((row) => ({
      ...row,
      score: rankKnowledgeCandidate(row, terms),
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || right.id - left.id)
    .slice(
      0,
      Math.min(Math.max(input.limit ?? 5, 1), 8),
    ) satisfies RewriteKnowledgeReference[];
}

export function formatRewriteKnowledgeContext(
  references: RewriteKnowledgeReference[],
  maxLength = 8_000,
) {
  if (references.length === 0) {
    return "未检索到相关知识条目。不要因此补造通用知识或商家事实。";
  }

  let remaining = maxLength;
  const sections: string[] = [];
  for (const reference of references) {
    const heading = `[KB:${reference.id}] ${reference.title}（${reference.categoryName}）`;
    const cardOverview = [
      reference.definition,
      ...(reference.highlights ?? []),
      reference.quickTip,
    ]
      .filter(Boolean)
      .join("\n");
    const body = [cardOverview, reference.summary, reference.content]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const section = `${heading}\n${body}`.slice(0, remaining);
    if (section.length < heading.length) break;
    sections.push(section);
    remaining -= section.length + 2;
    if (remaining <= 200) break;
  }

  return sections.join("\n\n");
}
