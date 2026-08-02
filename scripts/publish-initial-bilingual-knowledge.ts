import {
  KNOWLEDGE_CARD_VERSION,
  KNOWLEDGE_CONTENT_VERSION,
  knowledgeUnits,
  knowledgeUnitsForPhase,
  renderLegacyKnowledgeRecord,
  renderKnowledgeRecord,
  type KnowledgeUnit,
} from "./knowledge/initial-bilingual-content";

import type { KnowledgePublicationSnapshot } from "@/server/knowledge/service";
import type * as KnowledgeServiceModule from "@/server/knowledge/service";

const PHASES = [
  "pilots",
  "p0",
  "p1",
  "revise-v2",
  "cards-v1",
  "audit",
] as const;
type Phase = (typeof PHASES)[number];
type PublicationPhase = "pilots" | "p0" | "p1";
type KnowledgeService = typeof KnowledgeServiceModule;
type KnowledgeRevisionService = Pick<
  KnowledgeService,
  | "saveKnowledgeDraft"
  | "setKnowledgePublication"
  | "confirmKnowledgeTranslationSync"
  | "setKnowledgeAiReference"
>;
type Article = KnowledgePublicationSnapshot["articles"][number];
type Category = KnowledgePublicationSnapshot["categories"][number];
type ExpectedRecord = ReturnType<typeof renderKnowledgeRecord>;

const CONFIRMATIONS: Record<Phase, string> = {
  pilots: "PUBLISH_KNOWLEDGE_PILOTS",
  p0: "PUBLISH_KNOWLEDGE_P0",
  p1: "PUBLISH_KNOWLEDGE_P1",
  "revise-v2": "REVISE_KNOWLEDGE_CONTENT_V2",
  "cards-v1": "REVISE_KNOWLEDGE_CARDS_V1",
  audit: "AUDIT_KNOWLEDGE_60",
};

const BASE_CONTENT_FIELDS = [
  "title",
  "slug",
  "summary",
  "content",
  "keywords",
  "aliases",
  "retrievalTerms",
  "sourceNotes",
] as const satisfies ReadonlyArray<keyof ExpectedRecord>;

const CARD_FIELDS = [
  "definition",
  "highlights",
  "quickTip",
] as const satisfies ReadonlyArray<keyof ExpectedRecord>;

const CONTENT_FIELDS = [
  ...BASE_CONTENT_FIELDS,
  ...CARD_FIELDS,
] as const satisfies ReadonlyArray<keyof ExpectedRecord>;

type PublicationState = {
  categoriesBySlug: Map<string, Category>;
  articlesBySlug: Map<string, Article>;
};

type RevisionContentVersion = "v1" | "v2";
type CardContentVersion = "v0" | "v1";

type RevisionPairState = {
  category: Category;
  expected: ReturnType<typeof expectedPair>;
  legacy: ReturnType<typeof legacyPair>;
  chinese: Article;
  english: Article;
  chineseVersion: RevisionContentVersion;
  englishVersion: RevisionContentVersion;
  chineseCardVersion: CardContentVersion;
  englishCardVersion: CardContentVersion;
};

type OperationCounts = {
  chineseDraftsCreated: number;
  englishDraftsCreated: number;
  translationsConfirmed: number;
  chinesePublished: number;
  englishPublished: number;
  chineseAiAuthorized: number;
  englishAiAuthorized: number;
};

type RevisionCounts = {
  alreadyCurrent: number;
  englishTemporarilyUnpublished: number;
  chineseUpdated: number;
  englishUpdated: number;
  translationsConfirmed: number;
  englishRepublished: number;
  chineseAiAuthorized: number;
  englishAiAuthorized: number;
};

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function readPhase(): Phase {
  const value = readArg("phase");
  if (!value || !PHASES.includes(value as Phase)) {
    throw new Error(`--phase 必须是 ${PHASES.join("、")} 之一`);
  }
  return value as Phase;
}

function requireConfirmation(phase: Phase) {
  const expected = CONFIRMATIONS[phase];
  if (readArg("confirm") !== expected) {
    throw new Error(`阶段 ${phase} 需要 --confirm=${expected}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function targetUnits(phase: PublicationPhase) {
  return knowledgeUnitsForPhase(phase);
}

function prerequisiteUnits(phase: PublicationPhase) {
  if (phase === "pilots") return [];
  if (phase === "p0") return knowledgeUnitsForPhase("pilots");
  return knowledgeUnits.filter((unit) => unit.priority === "P0");
}

export function buildState(
  snapshot: KnowledgePublicationSnapshot,
): PublicationState {
  const categoriesBySlug = new Map<string, Category>();
  for (const category of snapshot.categories) {
    assert(
      !categoriesBySlug.has(category.slug),
      `数据库存在重复知识分类 slug：${category.slug}`,
    );
    categoriesBySlug.set(category.slug, category);
  }

  const articlesBySlug = new Map<string, Article>();
  for (const article of snapshot.articles) {
    assert(
      !articlesBySlug.has(article.slug),
      `数据库存在重复知识条目 slug：${article.slug}`,
    );
    articlesBySlug.set(article.slug, article);
  }
  return { categoriesBySlug, articlesBySlug };
}

function expectedPair(unit: KnowledgeUnit) {
  return {
    zh: renderKnowledgeRecord(unit, "zh"),
    en: renderKnowledgeRecord(unit, "en"),
  };
}

function legacyPair(unit: KnowledgeUnit) {
  return {
    zh: renderLegacyKnowledgeRecord(unit, "zh"),
    en: renderLegacyKnowledgeRecord(unit, "en"),
  };
}

function assertCategoryReady(unit: KnowledgeUnit, state: PublicationState) {
  const category = state.categoriesBySlug.get(unit.categorySlug);
  assert(category, `${unit.id} 所属分类不存在：${unit.categorySlug}`);
  assert(
    category.enName?.trim() &&
      category.enSlug?.trim() &&
      category.enDescription?.trim(),
    `${unit.id} 所属分类缺少完整英文元数据：${unit.categorySlug}`,
  );
  return category;
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

function contentDifferences(
  article: Article,
  expected: ExpectedRecord,
  fields: ReadonlyArray<keyof ExpectedRecord> = CONTENT_FIELDS,
) {
  return fields.filter(
    (field) => !fieldValuesEqual(article[field], expected[field]),
  );
}

function assertExistingRecord(
  unit: KnowledgeUnit,
  language: "zh" | "en",
  article: Article,
  expected: ExpectedRecord,
  category: Category,
  sourceArticle?: Article,
) {
  const label = `${unit.id}/${language}`;
  assert(article.language === language, `${label} 的数据库语言不一致`);
  assert(article.categoryId === category.id, `${label} 的数据库分类不一致`);
  const differences = contentDifferences(article, expected);
  assert(
    differences.length === 0,
    `${label} 已存在但内容不一致，已停止以避免覆盖：${differences.join("、")}`,
  );

  if (language === "zh") {
    assert(
      article.translationSourceArticleId === null,
      `${label} 不应绑定翻译源`,
    );
    return;
  }

  assert(sourceArticle, `${label} 存在，但对应中文源稿不存在`);
  assert(
    article.translationSourceArticleId === sourceArticle.id,
    `${label} 绑定了错误的中文源稿`,
  );
}

function preflightUnits(units: KnowledgeUnit[], state: PublicationState) {
  for (const unit of units) {
    const category = assertCategoryReady(unit, state);
    const expected = expectedPair(unit);
    const chinese = state.articlesBySlug.get(expected.zh.slug);
    const english = state.articlesBySlug.get(expected.en.slug);
    if (chinese) {
      assertExistingRecord(unit, "zh", chinese, expected.zh, category);
    }
    if (english) {
      assertExistingRecord(unit, "en", english, expected.en, category, chinese);
    }
  }
}

function revisionContentVersion(
  label: string,
  article: Article,
  legacy: ExpectedRecord,
  expected: ExpectedRecord,
): RevisionContentVersion {
  const v2Differences = contentDifferences(
    article,
    expected,
    BASE_CONTENT_FIELDS,
  );
  if (v2Differences.length === 0) return "v2";

  const v1Differences = contentDifferences(
    article,
    legacy,
    BASE_CONTENT_FIELDS,
  );
  if (v1Differences.length === 0) return "v1";

  throw new Error(
    `${label} 既不匹配 V1，也不匹配 V${KNOWLEDGE_CONTENT_VERSION}，已停止以避免覆盖人工内容；` +
      `V1 差异：${v1Differences.join("、")}；V${KNOWLEDGE_CONTENT_VERSION} 差异：${v2Differences.join("、")}`,
  );
}

function cardContentVersion(
  label: string,
  article: Article,
  expected: ExpectedRecord,
): CardContentVersion {
  const differences = contentDifferences(article, expected, CARD_FIELDS);
  if (differences.length === 0) return "v1";
  if (CARD_FIELDS.every((field) => article[field] === null)) return "v0";
  throw new Error(
    `${label} 的知识卡片既不是空白 V0，也不匹配 V${KNOWLEDGE_CARD_VERSION}；` +
      `已停止以避免覆盖人工内容：${differences.join("、")}`,
  );
}

function inspectRevisionPair(
  unit: KnowledgeUnit,
  state: PublicationState,
): RevisionPairState {
  const category = assertCategoryReady(unit, state);
  const expected = expectedPair(unit);
  const legacy = legacyPair(unit);
  assert(
    expected.zh.slug === legacy.zh.slug && expected.en.slug === legacy.en.slug,
    `${unit.id} V1 与 V${KNOWLEDGE_CONTENT_VERSION} 的 slug 不一致，不能原地修订`,
  );

  const chinese = state.articlesBySlug.get(expected.zh.slug);
  const english = state.articlesBySlug.get(expected.en.slug);
  assert(chinese, `${unit.id}/zh 不存在，不能执行内容修订`);
  assert(english, `${unit.id}/en 不存在，不能执行内容修订`);
  assert(chinese.language === "zh", `${unit.id}/zh 的数据库语言不一致`);
  assert(english.language === "en", `${unit.id}/en 的数据库语言不一致`);
  assert(chinese.categoryId === category.id, `${unit.id}/zh 的数据库分类不一致`);
  assert(english.categoryId === category.id, `${unit.id}/en 的数据库分类不一致`);
  assert(
    chinese.translationSourceArticleId === null,
    `${unit.id}/zh 不应绑定翻译源`,
  );
  assert(
    english.translationSourceArticleId === chinese.id,
    `${unit.id}/en 绑定了错误的中文源稿`,
  );
  assert(chinese.published, `${unit.id}/zh 必须保持发布状态才能修订`);
  assert(chinese.publishedAt, `${unit.id}/zh 缺少首次发布时间`);
  assert(english.publishedAt, `${unit.id}/en 缺少首次发布时间`);

  return {
    category,
    expected,
    legacy,
    chinese,
    english,
    chineseVersion: revisionContentVersion(
      `${unit.id}/zh`,
      chinese,
      legacy.zh,
      expected.zh,
    ),
    englishVersion: revisionContentVersion(
      `${unit.id}/en`,
      english,
      legacy.en,
      expected.en,
    ),
    chineseCardVersion: cardContentVersion(
      `${unit.id}/zh`,
      chinese,
      expected.zh,
    ),
    englishCardVersion: cardContentVersion(
      `${unit.id}/en`,
      english,
      expected.en,
    ),
  };
}

export function preflightRevisionUnits(
  units: KnowledgeUnit[],
  state: PublicationState,
) {
  for (const unit of units) inspectRevisionPair(unit, state);
}

export function preflightCardUpgradeUnits(
  units: KnowledgeUnit[],
  state: PublicationState,
) {
  for (const unit of units) {
    const pair = inspectRevisionPair(unit, state);
    assert(
      pair.chineseVersion === "v2" && pair.englishVersion === "v2",
      `${unit.id} 正文不是 V${KNOWLEDGE_CONTENT_VERSION}，请先执行 revise-v2`,
    );
  }
}

export function auditUnits(
  units: KnowledgeUnit[],
  state: PublicationState,
) {
  preflightUnits(units, state);
  const articleIds = new Set<number>();

  for (const unit of units) {
    const expected = expectedPair(unit);
    const chinese = state.articlesBySlug.get(expected.zh.slug);
    const english = state.articlesBySlug.get(expected.en.slug);
    assert(chinese, `${unit.id}/zh 尚未创建`);
    assert(english, `${unit.id}/en 尚未创建`);
    assert(!articleIds.has(chinese.id), `${unit.id}/zh 与其他记录共用了 ID`);
    articleIds.add(chinese.id);
    assert(!articleIds.has(english.id), `${unit.id}/en 与其他记录共用了 ID`);
    articleIds.add(english.id);
    assert(chinese.published, `${unit.id}/zh 尚未发布`);
    assert(english.published, `${unit.id}/en 尚未发布`);
    assert(chinese.publishedAt, `${unit.id}/zh 缺少首次发布时间`);
    assert(english.publishedAt, `${unit.id}/en 缺少首次发布时间`);
    assert(chinese.allowAiReference, `${unit.id}/zh 尚未允许 AI 引用`);
    assert(english.allowAiReference, `${unit.id}/en 尚未允许 AI 引用`);
    assert(
      english.translationSourceArticleId === chinese.id,
      `${unit.id}/en 翻译源不一致`,
    );
    assert(
      english.translatedFromRevision === chinese.contentRevision,
      `${unit.id}/en 尚未同步中文源稿当前版本`,
    );
  }

  return articleIds.size;
}

function remember(state: PublicationState, article: Article) {
  state.articlesBySlug.set(article.slug, article);
  return article;
}

function emptyOperationCounts(): OperationCounts {
  return {
    chineseDraftsCreated: 0,
    englishDraftsCreated: 0,
    translationsConfirmed: 0,
    chinesePublished: 0,
    englishPublished: 0,
    chineseAiAuthorized: 0,
    englishAiAuthorized: 0,
  };
}

function emptyRevisionCounts(): RevisionCounts {
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

async function createChineseDrafts(
  units: KnowledgeUnit[],
  state: PublicationState,
  service: KnowledgeService,
  counts: OperationCounts,
) {
  for (const unit of units) {
    const expected = expectedPair(unit).zh;
    if (state.articlesBySlug.has(expected.slug)) continue;
    const category = assertCategoryReady(unit, state);
    const result = await service.saveKnowledgeDraft({
      language: "zh",
      categoryId: category.id,
      ...expected,
    });
    remember(state, result.article);
    counts.chineseDraftsCreated += 1;
  }
}

async function createEnglishDrafts(
  units: KnowledgeUnit[],
  state: PublicationState,
  service: KnowledgeService,
  counts: OperationCounts,
) {
  for (const unit of units) {
    const expected = expectedPair(unit);
    if (state.articlesBySlug.has(expected.en.slug)) continue;
    const chinese = state.articlesBySlug.get(expected.zh.slug);
    assert(chinese, `${unit.id}/zh 必须先创建`);
    const result = await service.saveKnowledgeDraft({
      language: "en",
      translationSourceArticleId: chinese.id,
      ...expected.en,
    });
    remember(state, result.article);
    counts.englishDraftsCreated += 1;
  }
}

async function confirmTranslations(
  units: KnowledgeUnit[],
  state: PublicationState,
  service: KnowledgeService,
  counts: OperationCounts,
) {
  for (const unit of units) {
    const expected = expectedPair(unit);
    const chinese = state.articlesBySlug.get(expected.zh.slug);
    const english = state.articlesBySlug.get(expected.en.slug);
    assert(chinese && english, `${unit.id} 中英文草稿不完整`);
    if (english.translatedFromRevision === chinese.contentRevision) continue;
    assert(!english.published, `${unit.id}/en 已发布但翻译版本已过期`);
    const result = await service.confirmKnowledgeTranslationSync({
      id: english.id,
      expectedContentRevision: english.contentRevision,
    });
    remember(state, result.article);
    counts.translationsConfirmed += 1;
  }
}

async function publishLanguage(
  units: KnowledgeUnit[],
  language: "zh" | "en",
  state: PublicationState,
  service: KnowledgeService,
  counts: OperationCounts,
) {
  for (const unit of units) {
    const expected = expectedPair(unit)[language];
    const article = state.articlesBySlug.get(expected.slug);
    assert(article, `${unit.id}/${language} 草稿不存在`);
    if (article.published) continue;
    const result = await service.setKnowledgePublication({
      id: article.id,
      expectedContentRevision: article.contentRevision,
      published: true,
      allowAiReference: false,
    });
    remember(state, result.article);
    if (language === "zh") counts.chinesePublished += 1;
    else counts.englishPublished += 1;
  }
}

async function authorizeAiLanguage(
  units: KnowledgeUnit[],
  language: "zh" | "en",
  state: PublicationState,
  service: Pick<KnowledgeService, "setKnowledgeAiReference">,
  counts: Pick<
    OperationCounts,
    "chineseAiAuthorized" | "englishAiAuthorized"
  >,
) {
  for (const unit of units) {
    const expected = expectedPair(unit)[language];
    const article = state.articlesBySlug.get(expected.slug);
    assert(article, `${unit.id}/${language} 不存在`);
    if (article.allowAiReference) continue;
    const result = await service.setKnowledgeAiReference({
      id: article.id,
      expectedContentRevision: article.contentRevision,
      allowAiReference: true,
    });
    remember(state, result.article);
    if (language === "zh") counts.chineseAiAuthorized += 1;
    else counts.englishAiAuthorized += 1;
  }
}

function revisionPairIsCurrent(pair: RevisionPairState) {
  return (
    pair.chineseVersion === "v2" &&
    pair.englishVersion === "v2" &&
    pair.chineseCardVersion === "v1" &&
    pair.englishCardVersion === "v1" &&
    pair.chinese.published &&
    pair.english.published &&
    pair.chinese.allowAiReference &&
    pair.english.allowAiReference &&
    pair.english.translatedFromRevision === pair.chinese.contentRevision
  );
}

export async function reviseKnowledgeContent(
  units: KnowledgeUnit[],
  state: PublicationState,
  service: KnowledgeRevisionService,
  counts: RevisionCounts,
) {
  for (const unit of units) {
    let pair = inspectRevisionPair(unit, state);
    if (revisionPairIsCurrent(pair)) {
      counts.alreadyCurrent += 1;
      continue;
    }

    const englishMustBeUnpublished =
      pair.chineseVersion !== "v2" ||
      pair.englishVersion !== "v2" ||
      pair.chineseCardVersion !== "v1" ||
      pair.englishCardVersion !== "v1" ||
      pair.english.translatedFromRevision !== pair.chinese.contentRevision;
    if (pair.english.published && englishMustBeUnpublished) {
      const result = await service.setKnowledgePublication({
        id: pair.english.id,
        expectedContentRevision: pair.english.contentRevision,
        published: false,
        allowAiReference: false,
      });
      remember(state, result.article);
      counts.englishTemporarilyUnpublished += 1;
      pair = inspectRevisionPair(unit, state);
    }

    if (
      pair.chineseVersion !== "v2" ||
      pair.chineseCardVersion !== "v1"
    ) {
      const result = await service.saveKnowledgeDraft({
        id: pair.chinese.id,
        language: "zh",
        categoryId: pair.category.id,
        expectedContentRevision: pair.chinese.contentRevision,
        ...pair.expected.zh,
      });
      remember(state, result.article);
      counts.chineseUpdated += 1;
      pair = inspectRevisionPair(unit, state);
    }

    if (
      pair.englishVersion !== "v2" ||
      pair.englishCardVersion !== "v1"
    ) {
      assert(
        !pair.english.published,
        `${unit.id}/en 必须先取消发布才能修订`,
      );
      const result = await service.saveKnowledgeDraft({
        id: pair.english.id,
        language: "en",
        translationSourceArticleId: pair.chinese.id,
        expectedContentRevision: pair.english.contentRevision,
        ...pair.expected.en,
      });
      remember(state, result.article);
      counts.englishUpdated += 1;
      pair = inspectRevisionPair(unit, state);
    }

    if (
      pair.english.translatedFromRevision !== pair.chinese.contentRevision
    ) {
      assert(
        !pair.english.published,
        `${unit.id}/en 必须先取消发布才能确认翻译同步`,
      );
      const result = await service.confirmKnowledgeTranslationSync({
        id: pair.english.id,
        expectedContentRevision: pair.english.contentRevision,
      });
      remember(state, result.article);
      counts.translationsConfirmed += 1;
      pair = inspectRevisionPair(unit, state);
    }

    if (!pair.english.published) {
      const result = await service.setKnowledgePublication({
        id: pair.english.id,
        expectedContentRevision: pair.english.contentRevision,
        published: true,
        allowAiReference: false,
      });
      remember(state, result.article);
      counts.englishRepublished += 1;
    }

    await authorizeAiLanguage([unit], "zh", state, service, counts);
    await authorizeAiLanguage([unit], "en", state, service, counts);

    pair = inspectRevisionPair(unit, state);
    assert(
      revisionPairIsCurrent(pair),
      `${unit.id} 修订后未达到 V${KNOWLEDGE_CONTENT_VERSION} 完整状态`,
    );
  }
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "未知错误";
  return raw
    .split(/\sparams:/i, 1)[0]
    ?.replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://***@")
    .slice(0, 2_000);
}

async function main() {
  const phase = readPhase();
  requireConfirmation(phase);
  const service = await import("@/server/knowledge/service");
  const categorySlugs = knowledgeUnits.map((unit) => unit.categorySlug);
  const articleSlugs = knowledgeUnits.flatMap((unit) => [
    renderKnowledgeRecord(unit, "zh").slug,
    renderKnowledgeRecord(unit, "en").slug,
  ]);
  const snapshot = await service.readKnowledgePublicationSnapshot({
    categorySlugs,
    articleSlugs,
  });
  const state = buildState(snapshot);

  if (phase === "audit") {
    const articleCount = auditUnits(knowledgeUnits, state);
    console.log(
      `知识库全量审计通过：units=${knowledgeUnits.length}, articles=${articleCount}`,
    );
    return;
  }

  if (phase === "revise-v2") {
    // Validate every record before the first write so unknown or hand-edited
    // content cannot leave the batch half revised.
    preflightRevisionUnits(knowledgeUnits, state);
    const counts = emptyRevisionCounts();
    await reviseKnowledgeContent(knowledgeUnits, state, service, counts);
    const articleCount = auditUnits(knowledgeUnits, state);
    console.log(
      `知识库 V${KNOWLEDGE_CONTENT_VERSION} 修订并审计通过：units=${knowledgeUnits.length}, articles=${articleCount}`,
    );
    console.log(JSON.stringify(counts));
    return;
  }

  if (phase === "cards-v1") {
    // Only V2 body content with either blank or exact V1 cards is eligible.
    // This protects hand-edited card copy from batch overwrite.
    preflightCardUpgradeUnits(knowledgeUnits, state);
    const counts = emptyRevisionCounts();
    await reviseKnowledgeContent(knowledgeUnits, state, service, counts);
    const articleCount = auditUnits(knowledgeUnits, state);
    console.log(
      `知识库卡片 V${KNOWLEDGE_CARD_VERSION} 修订并审计通过：units=${knowledgeUnits.length}, articles=${articleCount}`,
    );
    console.log(JSON.stringify(counts));
    return;
  }

  const units = targetUnits(phase);
  const prerequisites = prerequisiteUnits(phase);
  if (prerequisites.length > 0) {
    auditUnits(prerequisites, state);
  }
  preflightUnits(units, state);

  const counts = emptyOperationCounts();
  await createChineseDrafts(units, state, service, counts);
  await createEnglishDrafts(units, state, service, counts);
  await confirmTranslations(units, state, service, counts);
  await publishLanguage(units, "zh", state, service, counts);
  await publishLanguage(units, "en", state, service, counts);
  await authorizeAiLanguage(units, "zh", state, service, counts);
  await authorizeAiLanguage(units, "en", state, service, counts);

  const articleCount = auditUnits(units, state);
  console.log(
    `知识库阶段 ${phase} 发布并审计通过：units=${units.length}, articles=${articleCount}`,
  );
  console.log(JSON.stringify(counts));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`知识库发布失败：${safeErrorMessage(error)}`);
    process.exitCode = 1;
  });
}
