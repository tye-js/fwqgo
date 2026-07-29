import type {
  KnowledgeAiReferenceCommand,
  KnowledgePublicationCommand,
  KnowledgePublicationSnapshot,
  KnowledgeVersionCommand,
  SaveKnowledgeDraftInput,
} from "@/server/knowledge/service";

import {
  knowledgeUnits,
  renderKnowledgeRecord,
  renderLegacyKnowledgeRecord,
} from "./knowledge/initial-bilingual-content";
import {
  auditUnits,
  buildState,
  preflightCardUpgradeUnits,
  preflightRevisionUnits,
  reviseKnowledgeContent,
} from "./publish-initial-bilingual-knowledge";

type Article = KnowledgePublicationSnapshot["articles"][number];
type Category = KnowledgePublicationSnapshot["categories"][number];

const MUTABLE_CONTENT_FIELDS = [
  "title",
  "slug",
  "summary",
  "definition",
  "highlights",
  "quickTip",
  "content",
  "keywords",
  "aliases",
  "retrievalTerms",
  "sourceNotes",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function textOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function stringArrayOrNull(value: string[] | null | undefined) {
  const normalized = value?.map((item) => item.trim()).filter(Boolean);
  return normalized?.length ? normalized : null;
}

function fieldValuesEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
  return left === right;
}

function revisionCounts() {
  return {
    alreadyCurrent: 0,
    englishTemporarilyUnpublished: 0,
    chineseUpdated: 0,
    englishUpdated: 0,
    translationsConfirmed: 0,
    englishRepublished: 0,
    chineseAiAuthorized: 0,
    englishAiAuthorized: 0,
  };
}

function fixtureSnapshot(): KnowledgePublicationSnapshot {
  const unit = knowledgeUnits[0];
  assert(unit, "knowledge fixture is missing");
  const now = new Date("2026-07-27T00:00:00.000Z");
  const category: Category = {
    id: 1,
    name: "服务器配置",
    slug: unit.categorySlug,
    description: "服务器配置基础知识",
    enName: "Server configuration",
    enSlug: "server-configuration",
    enDescription: "Server configuration fundamentals",
    sortOrder: 1,
    createdAt: now,
    updatedAt: null,
  };
  const chineseRecord = renderLegacyKnowledgeRecord(unit, "zh");
  const englishRecord = renderLegacyKnowledgeRecord(unit, "en");
  const chinese: Article = {
    id: 101,
    categoryId: category.id,
    ...chineseRecord,
    definition: null,
    highlights: null,
    quickTip: null,
    language: "zh",
    translationSourceArticleId: null,
    contentRevision: 1,
    translatedFromRevision: null,
    contentUpdatedAt: now,
    published: true,
    allowAiReference: true,
    publishedAt: now,
    createdBy: null,
    createdAt: now,
    updatedAt: null,
  };
  const english: Article = {
    id: 102,
    categoryId: category.id,
    ...englishRecord,
    definition: null,
    highlights: null,
    quickTip: null,
    language: "en",
    translationSourceArticleId: chinese.id,
    contentRevision: 1,
    translatedFromRevision: chinese.contentRevision,
    contentUpdatedAt: now,
    published: true,
    allowAiReference: true,
    publishedAt: now,
    createdBy: null,
    createdAt: now,
    updatedAt: null,
  };
  return { categories: [category], articles: [chinese, english] };
}

class MockRevisionService {
  private readonly rows: Map<number, Article>;
  private failEnglishSaveOnce: boolean;
  writes = 0;

  constructor(snapshot: KnowledgePublicationSnapshot, failEnglishSave = false) {
    this.rows = new Map(snapshot.articles.map((article) => [article.id, article]));
    this.failEnglishSaveOnce = failEnglishSave;
  }

  private article(id: number) {
    const article = this.rows.get(id);
    assert(article, `mock article ${id} is missing`);
    return article;
  }

  private assertRevision(article: Article, expected: number | undefined) {
    assert(
      article.contentRevision === expected,
      `mock revision mismatch for article ${article.id}`,
    );
  }

  private store(article: Article) {
    this.rows.set(article.id, article);
    return {
      article,
      affectedArticleIds: [article.id],
      affectedSlugs: [article.slug],
    };
  }

  async setKnowledgePublication(input: KnowledgePublicationCommand) {
    this.writes += 1;
    const current = this.article(input.id);
    this.assertRevision(current, input.expectedContentRevision);
    return this.store({
      ...current,
      published: input.published,
      allowAiReference: input.published
        ? current.allowAiReference
        : false,
      updatedAt: new Date(),
    });
  }

  async saveKnowledgeDraft(input: SaveKnowledgeDraftInput) {
    this.writes += 1;
    assert(input.id, "mock only updates existing knowledge records");
    const current = this.article(input.id);
    this.assertRevision(current, input.expectedContentRevision);
    if (input.language === "en" && this.failEnglishSaveOnce) {
      this.failEnglishSaveOnce = false;
      throw new Error("simulated English save interruption");
    }

    const normalized = {
      title: input.title.trim(),
      slug: textOrNull(input.slug) ?? current.slug,
      summary: textOrNull(input.summary),
      definition: textOrNull(input.definition),
      highlights: stringArrayOrNull(input.highlights),
      quickTip: textOrNull(input.quickTip),
      content: input.content.trim(),
      keywords: textOrNull(input.keywords),
      aliases: textOrNull(input.aliases),
      retrievalTerms: textOrNull(input.retrievalTerms),
      sourceNotes: textOrNull(input.sourceNotes),
    };
    const contentChanged = MUTABLE_CONTENT_FIELDS.some(
      (field) => !fieldValuesEqual(current[field], normalized[field]),
    );
    const updated: Article = {
      ...current,
      ...normalized,
      categoryId:
        input.language === "zh"
          ? (input.categoryId ?? current.categoryId)
          : current.categoryId,
      contentRevision: contentChanged
        ? current.contentRevision + 1
        : current.contentRevision,
      translatedFromRevision:
        input.language === "en" && contentChanged
          ? null
          : current.translatedFromRevision,
      allowAiReference: contentChanged
        ? false
        : current.allowAiReference,
      contentUpdatedAt: contentChanged ? new Date() : current.contentUpdatedAt,
      updatedAt: new Date(),
    };
    this.store(updated);

    if (input.language === "zh" && contentChanged) {
      const translation = [...this.rows.values()].find(
        (article) => article.translationSourceArticleId === updated.id,
      );
      if (translation) {
        this.store({
          ...translation,
          allowAiReference: false,
          updatedAt: new Date(),
        });
      }
    }

    return this.store(updated);
  }

  async confirmKnowledgeTranslationSync(input: KnowledgeVersionCommand) {
    this.writes += 1;
    const current = this.article(input.id);
    this.assertRevision(current, input.expectedContentRevision);
    assert(
      current.translationSourceArticleId,
      "mock English article is missing its source",
    );
    const source = this.article(current.translationSourceArticleId);
    return this.store({
      ...current,
      translatedFromRevision: source.contentRevision,
      updatedAt: new Date(),
    });
  }

  async setKnowledgeAiReference(input: KnowledgeAiReferenceCommand) {
    this.writes += 1;
    const current = this.article(input.id);
    this.assertRevision(current, input.expectedContentRevision);
    assert(
      !input.allowAiReference || current.published,
      "mock cannot authorize an unpublished article",
    );
    return this.store({
      ...current,
      allowAiReference: input.allowAiReference,
      updatedAt: new Date(),
    });
  }
}

const unit = knowledgeUnits[0];
assert(unit, "knowledge revision test unit is missing");

const interruptedSnapshot = fixtureSnapshot();
const interruptedState = buildState(interruptedSnapshot);
preflightRevisionUnits([unit], interruptedState);
const interruptedService = new MockRevisionService(interruptedSnapshot, true);
let interrupted = false;
try {
  await reviseKnowledgeContent(
    [unit],
    interruptedState,
    interruptedService,
    revisionCounts(),
  );
} catch (error) {
  interrupted =
    error instanceof Error &&
    error.message === "simulated English save interruption";
}
assert(interrupted, "revision interruption was not reproduced");

const chineseSlug = renderKnowledgeRecord(unit, "zh").slug;
const englishSlug = renderKnowledgeRecord(unit, "en").slug;
assert(
  interruptedState.articlesBySlug.get(chineseSlug)?.content ===
    renderKnowledgeRecord(unit, "zh").content,
  "Chinese content was not saved before the simulated interruption",
);
assert(
  interruptedState.articlesBySlug.get(englishSlug)?.published === false,
  "English content must stay unpublished after an interrupted revision",
);

const resumedCounts = revisionCounts();
await reviseKnowledgeContent(
  [unit],
  interruptedState,
  interruptedService,
  resumedCounts,
);
assert(auditUnits([unit], interruptedState) === 2, "resumed audit failed");
assert(resumedCounts.chineseUpdated === 0, "resume rewrote Chinese content");
assert(resumedCounts.englishUpdated === 1, "resume did not update English");
assert(resumedCounts.englishRepublished === 1, "resume did not republish English");
assert(
  resumedCounts.chineseAiAuthorized === 1 &&
    resumedCounts.englishAiAuthorized === 1,
  "resume did not restore AI reference authorization",
);

const unknownSnapshot = fixtureSnapshot();
const unknownChinese = unknownSnapshot.articles[0];
assert(unknownChinese, "unknown-content fixture is missing Chinese content");
unknownSnapshot.articles[0] = {
  ...unknownChinese,
  content: `${unknownChinese.content}\n\n人工补充内容`,
};
let unknownRejected = false;
try {
  preflightRevisionUnits([unit], buildState(unknownSnapshot));
} catch (error) {
  unknownRejected =
    error instanceof Error && error.message.includes("避免覆盖人工内容");
}
assert(unknownRejected, "unknown content was not rejected before revision");

const cardOnlySnapshot = fixtureSnapshot();
for (const article of cardOnlySnapshot.articles) {
  const expected = renderKnowledgeRecord(
    unit,
    article.language === "en" ? "en" : "zh",
  );
  Object.assign(article, expected, {
    definition: null,
    highlights: null,
    quickTip: null,
    contentRevision: 2,
    translatedFromRevision: article.language === "en" ? 2 : null,
  });
}
preflightCardUpgradeUnits([unit], buildState(cardOnlySnapshot));

const unknownCard = cardOnlySnapshot.articles[0];
assert(unknownCard, "unknown-card fixture is missing Chinese content");
unknownCard.definition = "人工填写但未完成的卡片";
let unknownCardRejected = false;
try {
  preflightCardUpgradeUnits([unit], buildState(cardOnlySnapshot));
} catch (error) {
  unknownCardRejected =
    error instanceof Error && error.message.includes("避免覆盖人工内容");
}
assert(unknownCardRejected, "partially edited card content was not rejected");

console.log(
  `Knowledge revision verified: resumedWrites=${interruptedService.writes}, unknownContentRejected=true, unknownCardRejected=true`,
);
