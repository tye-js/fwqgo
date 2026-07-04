"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import { tags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";

const createTagSchema = z.object({
  name: z
    .string()
    .min(2, "标签名称至少需要2个字符")
    .max(40, "标签名称不能超过40个字符")
    .trim(),
});

const updateTagIndexableSchema = z.object({
  id: z.number().int().positive(),
  indexable: z.boolean(),
});

const updateTagSeoSchema = z.object({
  id: z.number().int().positive(),
  enName: z.string().trim().max(120, "英文标签名不能超过120个字符").optional(),
  enSlug: z.string().trim().max(180, "英文 slug 不能超过180个字符").optional(),
  description: z.string().trim().max(800, "中文描述不能超过800个字符").optional(),
  keywords: z.string().trim().max(800, "中文关键词不能超过800个字符").optional(),
  enDescription: z.string().trim().max(800, "英文描述不能超过800个字符").optional(),
  enKeywords: z.string().trim().max(800, "英文关键词不能超过800个字符").optional(),
});

function normalizeSeoKeywords(value: string | undefined) {
  return (value ?? "")
    .replace(/，/g, ",")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(",");
}

function textOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

async function createTagRecord(
  input: z.infer<typeof createTagSchema>,
  options: { revalidate?: boolean } = {},
) {
  const result = createTagSchema.parse(input);
  const slug = slugify(result.name);

  if (!slug) {
    return { error: "标签名称需要包含中文、英文或数字" };
  }

  const [existingTag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);

  if (existingTag) return { id: existingTag.id };

  const [tag] = await db
    .insert(tags)
    .values({ name: result.name, slug })
    .onConflictDoNothing({ target: tags.slug })
    .returning({ id: tags.id });

  if (!tag) {
    const [raceExistingTag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);

    if (raceExistingTag) {
      return { id: raceExistingTag.id };
    }

    return { error: "标签创建失败" };
  }

  if (options.revalidate !== false) {
    revalidateSiteContent([cacheTags.tags]);
  }

  return { id: tag.id };
}

export async function createTag(input: z.infer<typeof createTagSchema>) {
  await requireAdminSession();
  return createTagRecord(input);
}

export async function createTags(inputTags: z.infer<typeof createTagSchema>[]) {
  await requireAdminSession();

  const resultTags = await Promise.all(
    inputTags.map(async (tag) => {
      const resultTag = await createTagRecord(tag, { revalidate: false });
      if ("error" in resultTag) {
        throw new Error(resultTag.error);
      }
      return { id: resultTag.id };
    }),
  );

  revalidateSiteContent([cacheTags.tags]);

  return { data: resultTags };
}

export async function updateTagIndexable(
  input: z.infer<typeof updateTagIndexableSchema>,
) {
  await requireAdminSession();

  const result = updateTagIndexableSchema.parse(input);

  const [tag] = await db
    .update(tags)
    .set({
      indexable: result.indexable,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, result.id))
    .returning({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      indexable: tags.indexable,
    });

  if (!tag) {
    return { error: "没有找到这个标签" };
  }

  revalidateSiteContent([cacheTags.tags, cacheTags.tagSlug(tag.slug)]);

  return { data: tag };
}

export async function updateTagSeo(input: z.infer<typeof updateTagSeoSchema>) {
  await requireAdminSession();

  const result = updateTagSeoSchema.parse(input);

  const [tag] = await db
    .update(tags)
    .set({
      enName: textOrNull(result.enName),
      enSlug: textOrNull(result.enSlug),
      description: textOrNull(result.description),
      keywords: textOrNull(normalizeSeoKeywords(result.keywords)),
      enDescription: textOrNull(result.enDescription),
      enKeywords: textOrNull(normalizeSeoKeywords(result.enKeywords)),
      updatedAt: new Date(),
    })
    .where(eq(tags.id, result.id))
    .returning({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      enName: tags.enName,
      enSlug: tags.enSlug,
      description: tags.description,
      keywords: tags.keywords,
      enDescription: tags.enDescription,
      enKeywords: tags.enKeywords,
      indexable: tags.indexable,
    });

  if (!tag) {
    return { error: "没有找到这个标签" };
  }

  revalidateSiteContent([
    cacheTags.tags,
    cacheTags.tagSlug(tag.slug),
    ...(tag.enSlug ? [cacheTags.tagSlug(tag.enSlug)] : []),
  ]);

  return { data: tag };
}
