import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import { knowledgeArticles, knowledgeCategories } from "@fwqgo/db/schema";

export type KnowledgeLanguage = "zh" | "en";

type KnowledgeArticleRow = typeof knowledgeArticles.$inferSelect;
type KnowledgeCategoryRow = typeof knowledgeCategories.$inferSelect;
type KnowledgeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SaveKnowledgeDraftInput = {
  id?: number;
  language: KnowledgeLanguage;
  translationSourceArticleId?: number | null;
  categoryId?: number;
  expectedContentRevision?: number;
  title: string;
  slug?: string | null;
  summary?: string | null;
  content: string;
  keywords?: string | null;
  aliases?: string | null;
  retrievalTerms?: string | null;
  sourceNotes?: string | null;
};

export type KnowledgeVersionCommand = {
  id: number;
  expectedContentRevision: number;
};

export type KnowledgePublicationCommand = KnowledgeVersionCommand & {
  published: boolean;
};

export type KnowledgeAiReferenceCommand = KnowledgeVersionCommand & {
  allowAiReference: boolean;
};

export type KnowledgeMutationResult = {
  article: KnowledgeArticleRow;
  affectedArticleIds: number[];
  affectedSlugs: string[];
};

export type KnowledgePublicationSnapshot = {
  categories: KnowledgeCategoryRow[];
  articles: KnowledgeArticleRow[];
};

const TRANSLATION_CONTENT_FIELDS = [
  "title",
  "summary",
  "content",
  "keywords",
  "aliases",
  "retrievalTerms",
  "sourceNotes",
] as const;

const PUBLIC_CONTENT_FIELDS = [
  "title",
  "summary",
  "content",
  "keywords",
] as const;

function textOrNull(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized;
}

function normalizeSlug(value: string | null | undefined, fallback: string) {
  const slug = slugify(textOrNull(value) ?? fallback, 320);
  if (!slug) {
    throw new Error("无法生成 slug，请输入包含中文、字母或数字的 slug");
  }
  return slug;
}

function sameValue(left: string | null, right: string | null) {
  return left === right;
}

function uniqueKeys(values: string[], limit: number) {
  const keys = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ];
  if (keys.length === 0 || keys.length > limit) {
    throw new Error(`知识发布快照键数量必须在 1 到 ${limit} 之间`);
  }
  return keys;
}

function latestDate(left: Date, right: Date) {
  return left.getTime() >= right.getTime() ? left : right;
}

function assertExpectedRevision(
  article: KnowledgeArticleRow,
  expectedContentRevision: number | undefined,
) {
  if (
    !Number.isSafeInteger(expectedContentRevision) ||
    expectedContentRevision !== article.contentRevision
  ) {
    throw new Error("知识条目已被其他编辑修改，请刷新后重新操作");
  }
}

function assertPublicationFields(article: KnowledgeArticleRow) {
  const missing: string[] = [];
  if (!article.summary?.trim()) missing.push("摘要");
  if (!article.keywords?.trim()) missing.push("关键词");
  if (!article.retrievalTerms?.trim()) missing.push("AI 检索词");
  if (!article.sourceNotes?.trim()) missing.push("来源说明");
  if (missing.length > 0) {
    throw new Error(`发布前请补全：${missing.join("、")}`);
  }
}

function assertEnglishCategoryReady(category: KnowledgeCategoryRow) {
  if (
    !category.enName?.trim() ||
    !category.enSlug?.trim() ||
    !category.enDescription?.trim()
  ) {
    throw new Error("英文稿所属分类缺少英文名称、slug 或说明");
  }
}

async function ensureArticleSlugAvailable(
  tx: KnowledgeTransaction,
  slug: string,
  id?: number,
) {
  const condition = id
    ? and(eq(knowledgeArticles.slug, slug), ne(knowledgeArticles.id, id))
    : eq(knowledgeArticles.slug, slug);
  const [conflict] = await tx
    .select({ id: knowledgeArticles.id })
    .from(knowledgeArticles)
    .where(condition)
    .limit(1);
  if (conflict) throw new Error(`知识条目 slug「${slug}」已存在`);
}

async function lockCategory(tx: KnowledgeTransaction, id: number) {
  const [category] = await tx
    .select()
    .from(knowledgeCategories)
    .where(eq(knowledgeCategories.id, id))
    .for("update")
    .limit(1);
  if (!category) throw new Error("所选知识分类不存在");
  return category;
}

async function lockKnowledgePair(tx: KnowledgeTransaction, id: number) {
  const [identity] = await tx
    .select({
      language: knowledgeArticles.language,
      translationSourceArticleId: knowledgeArticles.translationSourceArticleId,
    })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .limit(1);
  if (!identity) throw new Error("知识条目不存在");

  if (identity.language === "en") {
    if (!identity.translationSourceArticleId) {
      throw new Error("英文知识条目缺少中文源稿");
    }
    const [source] = await tx
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, identity.translationSourceArticleId))
      .for("update")
      .limit(1);
    if (source?.language !== "zh") {
      throw new Error("英文知识条目的翻译源必须是中文源稿");
    }
    const [article] = await tx
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, id))
      .for("update")
      .limit(1);
    if (!article) throw new Error("知识条目不存在");
    return { source, article };
  }

  const [article] = await tx
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, id))
    .for("update")
    .limit(1);
  if (!article) throw new Error("知识条目不存在");
  return { source: article, article };
}

async function getTranslation(
  tx: KnowledgeTransaction,
  sourceArticleId: number,
) {
  const [translation] = await tx
    .select()
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.translationSourceArticleId, sourceArticleId),
        eq(knowledgeArticles.language, "en"),
      ),
    )
    .for("update")
    .limit(1);
  return translation ?? null;
}

function mutationResult(
  article: KnowledgeArticleRow,
  related: Array<KnowledgeArticleRow | null | undefined> = [],
): KnowledgeMutationResult {
  const rows = [article, ...related].filter((row): row is KnowledgeArticleRow =>
    Boolean(row),
  );
  return {
    article,
    affectedArticleIds: [...new Set(rows.map((row) => row.id))],
    affectedSlugs: [...new Set(rows.map((row) => row.slug))],
  };
}

export async function readKnowledgePublicationSnapshot(input: {
  categorySlugs: string[];
  articleSlugs: string[];
}): Promise<KnowledgePublicationSnapshot> {
  const categorySlugs = uniqueKeys(input.categorySlugs, 100);
  const articleSlugs = uniqueKeys(input.articleSlugs, 1_000);
  const [categories, articles] = await Promise.all([
    db
      .select()
      .from(knowledgeCategories)
      .where(inArray(knowledgeCategories.slug, categorySlugs)),
    db
      .select()
      .from(knowledgeArticles)
      .where(inArray(knowledgeArticles.slug, articleSlugs)),
  ]);
  return { categories, articles };
}

export async function saveKnowledgeDraft(
  input: SaveKnowledgeDraftInput,
  actorId: string | null = null,
) {
  return db.transaction(async (tx) => {
    const title = input.title.trim();
    const content = input.content.trim();
    if (title.length < 4) throw new Error("标题至少 4 个字符");
    if (content.length < 40) throw new Error("正文至少 40 个字符");

    const slug = normalizeSlug(input.slug, title);
    if (input.language === "en" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("英文知识条目 slug 只能使用小写字母、数字和连字符");
    }
    const normalizedValues = {
      title,
      slug,
      summary: textOrNull(input.summary),
      content,
      keywords: textOrNull(input.keywords),
      aliases: textOrNull(input.aliases),
      retrievalTerms: textOrNull(input.retrievalTerms),
      sourceNotes: textOrNull(input.sourceNotes),
    };

    if (!input.id) {
      await ensureArticleSlugAvailable(tx, slug);
      const now = new Date();
      if (input.language === "en") {
        if (!input.translationSourceArticleId) {
          throw new Error("创建英文稿必须指定中文源稿");
        }
        const [source] = await tx
          .select()
          .from(knowledgeArticles)
          .where(
            and(
              eq(knowledgeArticles.id, input.translationSourceArticleId),
              eq(knowledgeArticles.language, "zh"),
            ),
          )
          .for("update")
          .limit(1);
        if (!source) throw new Error("中文源稿不存在");
        const existingTranslation = await getTranslation(tx, source.id);
        if (existingTranslation) throw new Error("该中文源稿已经具有英文稿");

        const [article] = await tx
          .insert(knowledgeArticles)
          .values({
            ...normalizedValues,
            language: "en",
            translationSourceArticleId: source.id,
            categoryId: source.categoryId,
            contentRevision: 1,
            translatedFromRevision: null,
            contentUpdatedAt: now,
            published: false,
            allowAiReference: false,
            publishedAt: null,
            createdBy: actorId,
            updatedAt: now,
          })
          .returning();
        if (!article) throw new Error("英文知识草稿创建失败");
        return mutationResult(article, [source]);
      }

      if (!input.categoryId) throw new Error("请选择知识分类");
      await lockCategory(tx, input.categoryId);
      const [article] = await tx
        .insert(knowledgeArticles)
        .values({
          ...normalizedValues,
          language: "zh",
          translationSourceArticleId: null,
          categoryId: input.categoryId,
          contentRevision: 1,
          translatedFromRevision: null,
          contentUpdatedAt: now,
          published: false,
          allowAiReference: false,
          publishedAt: null,
          createdBy: actorId,
          updatedAt: now,
        })
        .returning();
      if (!article) throw new Error("中文知识草稿创建失败");
      return mutationResult(article);
    }

    const { source, article: current } = await lockKnowledgePair(tx, input.id);
    assertExpectedRevision(current, input.expectedContentRevision);
    if (current.language !== input.language) {
      throw new Error("知识条目语言与编辑请求不一致");
    }
    if (
      current.language === "en" &&
      input.translationSourceArticleId !== undefined &&
      input.translationSourceArticleId !== current.translationSourceArticleId
    ) {
      throw new Error("英文知识条目不能改绑中文源稿");
    }
    if (current.publishedAt && current.slug !== slug) {
      throw new Error("知识条目首次发布后不能直接修改 slug");
    }
    await ensureArticleSlugAvailable(tx, slug, current.id);

    // Pair operations always lock the Chinese source before the English row.
    // Take the English lock before category locks to keep that order consistent.
    let translation =
      current.language === "zh" ? await getTranslation(tx, current.id) : null;

    const nextCategoryId =
      current.language === "en" ? source.categoryId : input.categoryId;
    if (!nextCategoryId) throw new Error("请选择知识分类");
    const categoryChanged = current.categoryId !== nextCategoryId;
    const nextCategory = await lockCategory(tx, nextCategoryId);
    const publishedEnglishArticle =
      current.language === "en" && current.published
        ? current
        : translation?.published
          ? translation
          : null;
    if (categoryChanged && publishedEnglishArticle) {
      assertEnglishCategoryReady(nextCategory);
    }

    const translationContentChanged = TRANSLATION_CONTENT_FIELDS.some(
      (field) => !sameValue(current[field], normalizedValues[field]),
    );
    const publicContentChanged = PUBLIC_CONTENT_FIELDS.some(
      (field) => !sameValue(current[field], normalizedValues[field]),
    );

    if (
      current.language === "en" &&
      current.published &&
      translationContentChanged
    ) {
      throw new Error("已发布英文稿必须先取消发布，才能修改正文或 SEO 内容");
    }

    const now = new Date();
    const nextContentRevision = translationContentChanged
      ? sql`${knowledgeArticles.contentRevision} + 1`
      : current.contentRevision;
    const [updated] = await tx
      .update(knowledgeArticles)
      .set({
        ...normalizedValues,
        categoryId: nextCategoryId,
        contentRevision: nextContentRevision,
        translatedFromRevision:
          current.language === "en" && translationContentChanged
            ? null
            : current.translatedFromRevision,
        contentUpdatedAt:
          publicContentChanged || categoryChanged
            ? now
            : current.contentUpdatedAt,
        allowAiReference: translationContentChanged
          ? false
          : current.allowAiReference,
        updatedAt: now,
      })
      .where(
        and(
          eq(knowledgeArticles.id, current.id),
          eq(knowledgeArticles.contentRevision, input.expectedContentRevision!),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("知识条目已被其他编辑修改，请刷新后重新保存");
    }

    if (updated.language === "zh") {
      if (translation) {
        const [updatedTranslation] = await tx
          .update(knowledgeArticles)
          .set({
            categoryId: categoryChanged
              ? updated.categoryId
              : translation.categoryId,
            contentUpdatedAt: categoryChanged
              ? now
              : translation.contentUpdatedAt,
            allowAiReference: translationContentChanged
              ? false
              : translation.allowAiReference,
            updatedAt: now,
          })
          .where(eq(knowledgeArticles.id, translation.id))
          .returning();
        translation = updatedTranslation ?? translation;
      }
    }

    return mutationResult(updated, [
      source.id === updated.id ? null : source,
      translation,
    ]);
  });
}

export async function setKnowledgePublication(
  input: KnowledgePublicationCommand,
) {
  return db.transaction(async (tx) => {
    const { source, article } = await lockKnowledgePair(tx, input.id);
    assertExpectedRevision(article, input.expectedContentRevision);
    const now = new Date();

    if (input.published) {
      assertPublicationFields(article);
      if (article.language === "en") {
        if (!source.published) {
          throw new Error("中文源稿尚未发布，不能发布英文稿");
        }
        if (article.translatedFromRevision !== source.contentRevision) {
          throw new Error("英文稿尚未确认同步到中文源稿的当前版本");
        }
        const category = await lockCategory(tx, source.categoryId);
        assertEnglishCategoryReady(category);
      }

      const firstPublication = article.publishedAt === null;
      const [updated] = await tx
        .update(knowledgeArticles)
        .set({
          published: true,
          publishedAt: firstPublication ? now : article.publishedAt,
          contentUpdatedAt: firstPublication
            ? latestDate(article.contentUpdatedAt, now)
            : article.contentUpdatedAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(knowledgeArticles.id, article.id),
            eq(
              knowledgeArticles.contentRevision,
              input.expectedContentRevision,
            ),
          ),
        )
        .returning();
      if (!updated) throw new Error("知识条目状态已变化，请刷新后重试");
      return mutationResult(updated, [
        source.id === updated.id ? null : source,
      ]);
    }

    const [updated] = await tx
      .update(knowledgeArticles)
      .set({ published: false, allowAiReference: false, updatedAt: now })
      .where(
        and(
          eq(knowledgeArticles.id, article.id),
          eq(knowledgeArticles.contentRevision, input.expectedContentRevision),
        ),
      )
      .returning();
    if (!updated) throw new Error("知识条目状态已变化，请刷新后重试");

    let translation: KnowledgeArticleRow | null = null;
    if (updated.language === "zh") {
      translation = await getTranslation(tx, updated.id);
      if (translation) {
        const [unpublishedTranslation] = await tx
          .update(knowledgeArticles)
          .set({ published: false, allowAiReference: false, updatedAt: now })
          .where(eq(knowledgeArticles.id, translation.id))
          .returning();
        translation = unpublishedTranslation ?? translation;
      }
    }
    return mutationResult(updated, [translation]);
  });
}

export async function setKnowledgeAiReference(
  input: KnowledgeAiReferenceCommand,
) {
  return db.transaction(async (tx) => {
    const { source, article } = await lockKnowledgePair(tx, input.id);
    assertExpectedRevision(article, input.expectedContentRevision);
    if (input.allowAiReference) {
      if (!article.published) {
        throw new Error("知识条目发布后才能允许 AI 引用");
      }
      if (article.language === "en") {
        if (!source.published) {
          throw new Error("中文源稿未发布，不能授权英文稿给 AI 引用");
        }
        if (article.translatedFromRevision !== source.contentRevision) {
          throw new Error("英文稿未同步到中文源稿当前版本，不能授权 AI 引用");
        }
      }
    }

    const [updated] = await tx
      .update(knowledgeArticles)
      .set({
        allowAiReference: input.allowAiReference,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(knowledgeArticles.id, article.id),
          eq(knowledgeArticles.contentRevision, input.expectedContentRevision),
        ),
      )
      .returning();
    if (!updated) throw new Error("知识条目状态已变化，请刷新后重试");
    return mutationResult(updated, [source.id === updated.id ? null : source]);
  });
}

export async function confirmKnowledgeTranslationSync(
  input: KnowledgeVersionCommand,
) {
  return db.transaction(async (tx) => {
    const { source, article } = await lockKnowledgePair(tx, input.id);
    assertExpectedRevision(article, input.expectedContentRevision);
    if (article.language !== "en") {
      throw new Error("只有英文稿需要确认翻译同步");
    }
    assertPublicationFields(article);

    const [updated] = await tx
      .update(knowledgeArticles)
      .set({
        translatedFromRevision: source.contentRevision,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(knowledgeArticles.id, article.id),
          eq(knowledgeArticles.contentRevision, input.expectedContentRevision),
        ),
      )
      .returning();
    if (!updated) throw new Error("英文稿状态已变化，请刷新后重试");
    return mutationResult(updated, [source]);
  });
}

export async function deleteKnowledgeArticleRecord(
  input: KnowledgeVersionCommand,
) {
  return db.transaction(async (tx) => {
    const { source, article } = await lockKnowledgePair(tx, input.id);
    assertExpectedRevision(article, input.expectedContentRevision);
    if (article.language === "zh") {
      const translation = await getTranslation(tx, article.id);
      if (translation) {
        throw new Error("该中文源稿仍有英文稿，请先删除英文稿");
      }
    }

    const [deleted] = await tx
      .delete(knowledgeArticles)
      .where(
        and(
          eq(knowledgeArticles.id, article.id),
          eq(knowledgeArticles.contentRevision, input.expectedContentRevision),
        ),
      )
      .returning();
    if (!deleted) throw new Error("知识条目状态已变化，请刷新后重试");
    return mutationResult(deleted, [source.id === deleted.id ? null : source]);
  });
}
