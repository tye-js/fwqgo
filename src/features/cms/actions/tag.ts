"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { generateTagSeoMetadata } from "@fwqgo/ai/tag-seo-generator";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { slugify } from "@fwqgo/core/utils";
import { db } from "@fwqgo/db";
import { tags } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";
import { isPriceLikeTag } from "@/features/cms/lib/tag-price-filter";

const createTagSchema = z.object({
  name: z
    .string()
    .min(2, "标签名称至少需要2个字符")
    .max(40, "标签名称不能超过40个字符")
    .trim(),
});

const updateTagIndexableSchema = z.object({
  id: postgresIntegerIdSchema,
  indexable: z.boolean(),
});

const updateTagSeoSchema = z.object({
  id: postgresIntegerIdSchema,
  enName: z.string().trim().max(120, "英文标签名不能超过120个字符").optional(),
  enSlug: z.string().trim().max(180, "英文 slug 不能超过180个字符").optional(),
  description: z
    .string()
    .trim()
    .max(800, "中文描述不能超过800个字符")
    .optional(),
  keywords: z
    .string()
    .trim()
    .max(800, "中文关键词不能超过800个字符")
    .optional(),
  enDescription: z
    .string()
    .trim()
    .max(800, "英文描述不能超过800个字符")
    .optional(),
  enKeywords: z
    .string()
    .trim()
    .max(800, "英文关键词不能超过800个字符")
    .optional(),
});

const generateTagSeoSchema = z.object({
  id: postgresIntegerIdSchema,
});

const batchGenerateTagSeoSchema = z.object({
  ids: z
    .array(postgresIntegerIdSchema)
    .min(1, "请先选择要生成的标签")
    .max(20, "一次最多批量生成 20 个标签"),
});

type TagSeoResultRow = {
  id: number;
  name: string;
  slug: string;
  enName: string | null;
  enSlug: string | null;
  description: string | null;
  keywords: string | null;
  enDescription: string | null;
  enKeywords: string | null;
  indexable: boolean;
};

type TagSeoActionResult = {
  data?: TagSeoResultRow;
  error?: string;
  message?: string;
};

type TagSeoBatchActionResult = {
  data?: {
    updated: TagSeoResultRow[];
    errors: Array<{ id: number; name?: string; reason: string }>;
  };
  error?: string;
  message?: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "输入信息不正确";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

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

function normalizeOptionalSlug(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const normalized = slugify(trimmed);
  return normalized || null;
}

async function hasEnSlugConflict(enSlug: string, tagId: number) {
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.enSlug, enSlug), ne(tags.id, tagId)))
    .limit(1);

  return Boolean(existing);
}

async function makeUniqueEnSlug(enSlug: string, tagId: number) {
  const baseSlug =
    enSlug
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || `tag-${tagId}`;

  let candidate = baseSlug;
  let suffix = 2;

  while (await hasEnSlugConflict(candidate, tagId)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;

    if (suffix > 50) {
      candidate = `${baseSlug}-${tagId}`;
      break;
    }
  }

  return candidate;
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
  const result = await createTagRecord(input);
  if (!("error" in result)) {
    schedulePublicWebCache("taxonomy.changed", { tagIds: [result.id] });
  }
  return result;
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
  schedulePublicWebCache("taxonomy.changed", {
    tagIds: resultTags.map((tag) => tag.id),
  });

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
  schedulePublicWebCache("taxonomy.changed", { tagIds: [tag.id] });

  return { data: tag };
}

export async function updateTagSeo(
  input: z.infer<typeof updateTagSeoSchema>,
): Promise<TagSeoActionResult> {
  try {
    await requireAdminSession();
    return saveTagSeo(updateTagSeoSchema.parse(input));
  } catch (error) {
    console.error("更新标签 SEO 失败:", error);
    return { error: "标签 SEO 保存失败", message: getErrorMessage(error) };
  }
}

async function saveTagSeo(
  input: z.infer<typeof updateTagSeoSchema>,
  options: { makeEnSlugUnique?: boolean } = {},
): Promise<TagSeoActionResult> {
  const [currentTag] = await db
    .select({
      slug: tags.slug,
      enSlug: tags.enSlug,
    })
    .from(tags)
    .where(eq(tags.id, input.id))
    .limit(1);

  if (!currentTag) {
    return { error: "没有找到这个标签" };
  }

  let normalizedEnSlug = normalizeOptionalSlug(input.enSlug);

  if (normalizedEnSlug) {
    if (options.makeEnSlugUnique) {
      normalizedEnSlug = await makeUniqueEnSlug(normalizedEnSlug, input.id);
    } else if (await hasEnSlugConflict(normalizedEnSlug, input.id)) {
      return {
        error: "英文 slug 已被其他标签使用",
        message: `${normalizedEnSlug} 已存在，请换一个英文 slug`,
      };
    }
  }

  const [tag] = await db
    .update(tags)
    .set({
      enName: textOrNull(input.enName),
      enSlug: normalizedEnSlug,
      description: textOrNull(input.description),
      keywords: textOrNull(normalizeSeoKeywords(input.keywords)),
      enDescription: textOrNull(input.enDescription),
      enKeywords: textOrNull(normalizeSeoKeywords(input.enKeywords)),
      updatedAt: new Date(),
    })
    .where(eq(tags.id, input.id))
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
    ...(currentTag.enSlug && currentTag.enSlug !== tag.enSlug
      ? [cacheTags.tagSlug(currentTag.enSlug)]
      : []),
  ]);
  schedulePublicWebCache("taxonomy.changed", { tagIds: [tag.id] });

  return { data: tag };
}

async function getTagForSeoGeneration(id: number) {
  const [tag] = await db
    .select({
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
    })
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1);

  return tag ?? null;
}

async function generateAndSaveTagSeo(
  tag: NonNullable<Awaited<ReturnType<typeof getTagForSeoGeneration>>>,
) {
  if (isPriceLikeTag(tag)) {
    return {
      error: "价格类标签已排除",
      message: `${tag.name} 属于价格、优惠或折扣类标签，不参与标签 SEO AI 生成`,
    };
  }

  const generated = await generateTagSeoMetadata({
    name: tag.name,
    slug: tag.slug,
    description: tag.description,
    keywords: tag.keywords,
    enName: tag.enName,
    enSlug: tag.enSlug,
    enDescription: tag.enDescription,
    enKeywords: tag.enKeywords,
  });

  return saveTagSeo(
    {
      id: tag.id,
      description: generated.description,
      keywords: generated.keywords.join(","),
      enName: generated.enName,
      enSlug: generated.enSlug,
      enDescription: generated.enDescription,
      enKeywords: generated.enKeywords.join(","),
    },
    { makeEnSlugUnique: true },
  );
}

export async function generateTagSeoWithAi(
  input: z.infer<typeof generateTagSeoSchema>,
): Promise<TagSeoActionResult> {
  try {
    await requireAdminSession();
    const result = generateTagSeoSchema.parse(input);
    const tag = await getTagForSeoGeneration(result.id);

    if (!tag) {
      return { error: "没有找到这个标签" };
    }

    return generateAndSaveTagSeo(tag);
  } catch (error) {
    console.error("AI 生成标签 SEO 失败:", error);
    return {
      error: "AI 生成标签 SEO 失败",
      message: getErrorMessage(error),
    };
  }
}

export async function batchGenerateTagSeoWithAi(
  input: z.infer<typeof batchGenerateTagSeoSchema>,
): Promise<TagSeoBatchActionResult> {
  try {
    await requireAdminSession();
    const result = batchGenerateTagSeoSchema.parse(input);
    const ids = [...new Set(result.ids)];
    const tagRows = await db
      .select({
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
      })
      .from(tags)
      .where(inArray(tags.id, ids));
    const tagsById = new Map(tagRows.map((tag) => [tag.id, tag]));
    const updated: TagSeoResultRow[] = [];
    const errors: Array<{ id: number; name?: string; reason: string }> = [];

    for (const id of ids) {
      const tag = tagsById.get(id);

      if (!tag) {
        errors.push({ id, reason: "没有找到这个标签" });
        continue;
      }

      try {
        const generated = await generateAndSaveTagSeo(tag);

        if (generated.error || !generated.data) {
          errors.push({
            id,
            name: tag.name,
            reason: generated.message ?? generated.error ?? "生成失败",
          });
          continue;
        }

        updated.push(generated.data);
      } catch (error) {
        errors.push({
          id,
          name: tag.name,
          reason: getErrorMessage(error),
        });
      }
    }

    if (updated.length === 0) {
      return {
        error: "批量生成未更新任何标签",
        message:
          errors
            .slice(0, 3)
            .map((item) => `${item.name ?? item.id}: ${item.reason}`)
            .join("；") || "请检查 AI 配置后重试",
        data: { updated, errors },
      };
    }

    return {
      data: { updated, errors },
      message:
        errors.length > 0
          ? `已生成 ${updated.length} 个，失败或跳过 ${errors.length} 个`
          : `已生成 ${updated.length} 个标签 SEO`,
    };
  } catch (error) {
    console.error("批量 AI 生成标签 SEO 失败:", error);
    return {
      error: "批量 AI 生成标签 SEO 失败",
      message: getErrorMessage(error),
    };
  }
}
