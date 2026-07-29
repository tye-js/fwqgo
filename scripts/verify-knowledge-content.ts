import {
  KNOWLEDGE_CARD_VERSION,
  KNOWLEDGE_CONTENT_VERSION,
  KNOWLEDGE_VERIFIED_DATE,
  knowledgeUnits,
  knowledgeUnitsForPhase,
  renderLegacyKnowledgeRecord,
  renderKnowledgeRecord,
} from "./knowledge/initial-bilingual-content";
import { readerGuidance } from "./knowledge/reader-guidance";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Knowledge content verification failed: ${message}`);
}

function extractInternalLinks(content: string) {
  return [...content.matchAll(/\]\((\/[^)]+)\)/g)]
    .map((match) => match[1])
    .filter((link): link is string => Boolean(link));
}

function hasValidCodeFences(content: string) {
  const fences = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("```"));
  return (
    fences.length % 2 === 0 &&
    fences.every((line, index) =>
      index % 2 === 0 ? /^```[a-z0-9][a-z0-9_-]*$/i.test(line) : line === "```",
    )
  );
}

assert(KNOWLEDGE_VERIFIED_DATE === "2026-07-26", "verification date drifted");
assert(KNOWLEDGE_CONTENT_VERSION === 2, "expected content version 2");
assert(KNOWLEDGE_CARD_VERSION === 1, "expected card version 1");
assert(
  knowledgeUnits.length === 30,
  `expected 30 units, found ${knowledgeUnits.length}`,
);
assert(
  Object.keys(readerGuidance).length === knowledgeUnits.length,
  "reader guidance must cover every knowledge unit exactly once",
);
assert(
  knowledgeUnits.filter((unit) => unit.priority === "P0").length === 12,
  "expected 12 P0 units",
);
assert(knowledgeUnitsForPhase("pilots").length === 4, "expected 4 pilot units");
assert(
  knowledgeUnitsForPhase("p0").length === 8,
  "expected 8 remaining P0 units",
);
assert(knowledgeUnitsForPhase("p1").length === 18, "expected 18 P1 units");

const pilotIds = new Set(
  knowledgeUnitsForPhase("pilots").map((unit) => unit.id),
);
const p0Ids = new Set(
  knowledgeUnits
    .filter((unit) => unit.priority === "P0")
    .map((unit) => unit.id),
);

const expectedIds = Array.from(
  { length: 30 },
  (_, index) => `KB-${String(index + 1).padStart(3, "0")}`,
);
assert(
  knowledgeUnits.every((unit, index) => unit.id === expectedIds[index]),
  "unit IDs must be ordered KB-001 through KB-030",
);

const categoryCounts = new Map<string, number>();
const ids = new Set<string>();
const slugs = new Set<string>();
for (const unit of knowledgeUnits) {
  assert(!ids.has(unit.id), `duplicate ID ${unit.id}`);
  ids.add(unit.id);
  categoryCounts.set(
    unit.categorySlug,
    (categoryCounts.get(unit.categorySlug) ?? 0) + 1,
  );
  assert(unit.sourceKeys.length >= 2, `${unit.id} needs at least two sources`);
  assert(
    unit.relatedIds.length >= 2,
    `${unit.id} needs at least two related articles`,
  );
  assert(
    unit.relatedIds.every((id) => id !== unit.id && expectedIds.includes(id)),
    `${unit.id} has an invalid related ID`,
  );
  if (pilotIds.has(unit.id)) {
    assert(
      unit.relatedIds.filter((id) => pilotIds.has(id)).length >= 2,
      `${unit.id} needs at least two links available during the pilot phase`,
    );
  }
  if (unit.priority === "P0") {
    assert(
      unit.relatedIds.filter((id) => p0Ids.has(id)).length >= 2,
      `${unit.id} needs at least two links available after the P0 phase`,
    );
  }

  for (const language of ["zh", "en"] as const) {
    const draft = unit[language];
    const record = renderKnowledgeRecord(unit, language);
    const legacyRecord = renderLegacyKnowledgeRecord(unit, language);
    const guidance = readerGuidance[unit.id]?.[language];
    const label = `${unit.id}/${language}`;
    assert(guidance, `${label} is missing reader guidance`);
    assert(
      guidance.profiles.length === 3,
      `${label} needs exactly three audience profiles`,
    );
    assert(
      language === "zh"
        ? guidance.quickAnswer.length >= 40 &&
            guidance.quickAnswer.length <= 100
        : guidance.quickAnswer.length >= 120 &&
            guidance.quickAnswer.length <= 280,
      `${label} quick answer length is ${guidance.quickAnswer.length}`,
    );
    const sectionOrder =
      language === "zh"
        ? [
            "## 先说结论",
            "## 适合谁",
            "## 哪些情况不要直接照做",
            "## 关键点怎么理解",
            "## 怎么做",
            "## 怎么确认结果",
            "## 常见误区与风险",
            "## 核验日期与来源",
            "## 接着看",
          ]
        : [
            "## Quick answer",
            "## Who this helps",
            "## When not to follow this directly",
            "## Key points in plain language",
            "## What to do",
            "## How to verify the result",
            "## Common mistakes and limits",
            "## Verification date and sources",
            "## Read next",
          ];
    assert(
      record.content.startsWith(`${sectionOrder[0]}\n\n> `),
      `${label} must begin with the quick conclusion`,
    );
    let previousSectionIndex = -1;
    for (const section of sectionOrder) {
      const sectionIndex = record.content.indexOf(section);
      assert(sectionIndex >= 0, `${label} is missing section ${section}`);
      assert(
        sectionIndex > previousSectionIndex,
        `${label} has section ${section} out of order`,
      );
      previousSectionIndex = sectionIndex;
    }
    for (const [profile, reason] of guidance.profiles) {
      assert(profile.length >= 4, `${label} has a vague audience label`);
      assert(reason.length >= 15, `${label} has a thin audience explanation`);
      assert(
        record.content.includes(`**${profile}**`) &&
          record.content.includes(reason),
        `${label} did not render an audience profile`,
      );
    }
    assert(
      record.content !== legacyRecord.content,
      `${label} still renders the version 1 structure`,
    );
    assert(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug),
      `${label} slug must be lowercase ASCII kebab-case`,
    );
    assert(!slugs.has(record.slug), `duplicate slug ${record.slug}`);
    slugs.add(record.slug);
    assert(
      record.title.length >= 8 && record.title.length <= 100,
      `${label} title length`,
    );
    assert(
      language === "zh"
        ? record.summary.length >= 80 && record.summary.length <= 160
        : record.summary.length >= 140 && record.summary.length <= 260,
      `${label} summary length is ${record.summary.length}`,
    );
    assert(
      language === "zh"
        ? record.definition.length >= 8 && record.definition.length <= 100
        : record.definition.length >= 30 && record.definition.length <= 220,
      `${label} card definition length is ${record.definition.length}`,
    );
    assert(
      record.highlights.length >= 2 && record.highlights.length <= 3,
      `${label} needs 2-3 card highlights`,
    );
    assert(
      record.highlights.every(
        (highlight) =>
          highlight.length <= 320 &&
          /^\*\*[^*]+\*\*\s*[：:]\s*\S/.test(highlight),
      ),
      `${label} card highlights must use a safe bold label and concise text`,
    );
    assert(
      new Set(record.highlights).size === record.highlights.length,
      `${label} card highlights must be unique`,
    );
    assert(
      language === "zh"
        ? record.quickTip.length >= 8 && record.quickTip.length <= 180
        : record.quickTip.length >= 30 && record.quickTip.length <= 260,
      `${label} card quick tip length is ${record.quickTip.length}`,
    );
    assert(
      draft.keywords.length >= 5 && draft.keywords.length <= 8,
      `${label} needs 5-8 keywords`,
    );
    assert(
      draft.retrievalTerms.length >= 6 && draft.retrievalTerms.length <= 12,
      `${label} needs 6-12 retrieval terms`,
    );
    assert(
      record.sourceNotes.split("\n").length === unit.sourceKeys.length,
      `${label} source notes are incomplete`,
    );
    assert(
      record.sourceNotes
        .split("\n")
        .every((line) => line.split("｜").length === 7),
      `${label} source note format is invalid`,
    );
    const expectedPrefix = language === "en" ? "/en/knowledge/" : "/knowledge/";
    const knowledgeLinks = extractInternalLinks(record.content).filter(
      (link) =>
        link.startsWith("/knowledge/") || link.startsWith("/en/knowledge/"),
    );
    assert(
      knowledgeLinks.filter((link) => link.startsWith(expectedPrefix)).length >=
        2,
      `${label} needs at least two same-language internal links`,
    );
    assert(
      knowledgeLinks.every((link) => link.startsWith(expectedPrefix)),
      `${label} has a cross-language knowledge link`,
    );
    assert(
      !/(?:[$€£¥]\s*\d|\d+(?:\.\d+)?\s*(?:元|美元|欧元|英镑|\/month|per month)|库存|现货|优惠码|in stock|coupon code)/iu.test(
        `${record.summary}\n${record.content}`,
      ),
      `${label} contains price, inventory, or promotion language`,
    );
    assert(
      language === "zh" || !/\p{Script=Han}/u.test(JSON.stringify(record)),
      `${label} contains Chinese characters`,
    );
    assert(
      hasValidCodeFences(record.content),
      `${label} contains an invalid or unlabelled code fence`,
    );
  }
}

const ipLabelUnit = knowledgeUnits.find((unit) => unit.id === "KB-017");
assert(ipLabelUnit, "KB-017 is missing");
const ipLabelCard = renderKnowledgeRecord(ipLabelUnit, "zh");
assert(
  !ipLabelCard.highlights.some(
    (highlight) => highlight.includes("极低风控") || highlight.includes("必然低风控"),
  ),
  "KB-017 must not make absolute risk-control claims",
);

assert(slugs.size === 60, `expected 60 unique slugs, found ${slugs.size}`);
assert(
  [...categoryCounts.values()].every((count) => count === 5),
  "each of the six categories must contain five units",
);

console.log(
  `Knowledge content verified: units=${knowledgeUnits.length}, records=${slugs.size}, pilots=4, p0=12, p1=18`,
);
