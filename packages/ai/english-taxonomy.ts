import { eq, or } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { categories, posts, postTags, tags } from "@fwqgo/db/schema";
import type {
  EnglishMetadataOutput,
  EnglishTaxonomyTag,
} from "@fwqgo/ai/article-rewriter";

function normalizeEnglishSlug(value: string, fallback: string) {
  const raw = value.trim() || fallback;
  const slug = raw
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return slug || "server-deals";
}

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function normalizeEnglishTags(input: EnglishTaxonomyTag[]) {
  const seenSlugs = new Set<string>();
  const normalized: EnglishTaxonomyTag[] = [];

  for (const tag of input) {
    const name = tag.name.trim().slice(0, 80);
    const slug = normalizeEnglishSlug(tag.slug, name);

    if (!name || /\p{Script=Han}/u.test(name) || seenSlugs.has(slug)) {
      continue;
    }

    seenSlugs.add(slug);
    normalized.push({ name, slug });
    if (normalized.length >= 6) break;
  }

  return normalized;
}

async function getUniqueCategoryEnglishSlug(
  requestedSlug: string,
  categoryId: number,
) {
  const baseSlug = normalizeEnglishSlug(requestedSlug, "server-deals");

  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const [existing] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        or(eq(categories.enSlug, candidate), eq(categories.slug, candidate)),
      )
      .limit(1);

    if (!existing || existing.id === categoryId) {
      return candidate;
    }
  }

  return `${baseSlug}-${categoryId}`;
}

async function updateCategoryEnglishFields(input: {
  categoryId: number;
  name: string | null;
  slug: string | null;
}) {
  if (!input.name || !input.slug) return null;

  const [category] = await db
    .select({
      id: categories.id,
      enName: categories.enName,
      enSlug: categories.enSlug,
    })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);

  if (!category) {
    throw new Error("英文文章关联的分类不存在");
  }

  const enName =
    nonEmptyTrim(category.enName) ?? input.name.trim().slice(0, 120);
  const enSlug =
    nonEmptyTrim(category.enSlug) ??
    (await getUniqueCategoryEnglishSlug(input.slug, category.id));

  if (category.enName !== enName || category.enSlug !== enSlug) {
    await db
      .update(categories)
      .set({ enName, enSlug, updatedAt: new Date() })
      .where(eq(categories.id, category.id));
  }

  return { id: category.id, name: enName, slug: enSlug };
}

async function findEnglishTag(input: EnglishTaxonomyTag) {
  const matches = await db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      enName: tags.enName,
      enSlug: tags.enSlug,
    })
    .from(tags)
    .where(
      or(
        eq(tags.enSlug, input.slug),
        eq(tags.slug, input.slug),
        eq(tags.enName, input.name),
        eq(tags.name, input.name),
      ),
    )
    .limit(8);

  return (
    matches.find((tag) => tag.enSlug === input.slug) ??
    matches.find((tag) => tag.enName === input.name) ??
    matches.find((tag) => tag.slug === input.slug) ??
    matches.find((tag) => tag.name === input.name) ??
    null
  );
}

async function ensureEnglishTagRows(input: EnglishTaxonomyTag[]) {
  const rows: Array<{ id: number; name: string; slug: string }> = [];

  for (const tag of normalizeEnglishTags(input)) {
    const existing = await findEnglishTag(tag);
    if (existing) {
      const existingName = nonEmptyTrim(existing.enName);
      const existingSlug = nonEmptyTrim(existing.enSlug);
      const baseFieldsAreEnglish =
        !/\p{Script=Han}/u.test(existing.name) &&
        /^[a-z0-9-]+$/i.test(existing.slug);
      const name =
        existingName ?? (baseFieldsAreEnglish ? existing.name : tag.name);
      const slug =
        existingSlug ?? (baseFieldsAreEnglish ? existing.slug : tag.slug);

      if (!existingName || !existingSlug) {
        await db
          .update(tags)
          .set({ enName: name, enSlug: slug, updatedAt: new Date() })
          .where(eq(tags.id, existing.id));
      }

      rows.push({ id: existing.id, name, slug });
      continue;
    }

    const [created] = await db
      .insert(tags)
      .values({
        name: tag.name,
        slug: tag.slug,
        enName: tag.name,
        enSlug: tag.slug,
      })
      .onConflictDoNothing()
      .returning({ id: tags.id });
    const row = created ?? (await findEnglishTag(tag));

    if (!row) {
      throw new Error(`英文标签创建失败：${tag.name}`);
    }

    rows.push({ id: row.id, name: tag.name, slug: tag.slug });
  }

  return rows;
}

export async function applyEnglishTaxonomyToPost(input: {
  postId: number;
  categoryId: number;
  metadata: Pick<
    EnglishMetadataOutput,
    "enTags" | "enRecommendTagName" | "enCategoryName" | "enCategorySlug"
  >;
}) {
  const tagRows = await ensureEnglishTagRows(input.metadata.enTags);
  if (tagRows.length < 2) {
    throw new Error("英文文章至少需要 2 个有效英文标签");
  }

  const recommendedTag =
    tagRows.find(
      (tag) =>
        tag.name.toLowerCase() ===
        input.metadata.enRecommendTagName.trim().toLowerCase(),
    ) ?? tagRows[0];
  if (!recommendedTag) {
    throw new Error("英文文章缺少有效的推荐标签");
  }

  const category = await updateCategoryEnglishFields({
    categoryId: input.categoryId,
    name: input.metadata.enCategoryName,
    slug: input.metadata.enCategorySlug,
  });

  await db.transaction(async (tx) => {
    const [targetPost] = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, input.postId))
      .limit(1);

    if (!targetPost) {
      throw new Error("需要写入英文分类标签的文章不存在");
    }

    await tx.delete(postTags).where(eq(postTags.postId, input.postId));
    await tx
      .insert(postTags)
      .values(
        tagRows.map((tag) => ({
          postId: input.postId,
          tagId: tag.id,
        })),
      )
      .onConflictDoNothing();
    await tx
      .update(posts)
      .set({
        recommendedTagId: recommendedTag.id,
        recommendedTagName: recommendedTag.name,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, input.postId));
  });

  return {
    category,
    tags: tagRows,
    recommendedTag,
  };
}
