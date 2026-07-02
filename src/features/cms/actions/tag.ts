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

export async function createTag(input: z.infer<typeof createTagSchema>) {
  await requireAdminSession();

  // 验证输入
  const result = createTagSchema.parse(input);
  // 生成 slug
  const slug = slugify(input.name);

  const [existingTag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);

  if (existingTag) return { id: existingTag.id };

  const [tag] = await db
    .insert(tags)
    .values({ name: result.name, slug })
    .returning({ id: tags.id });

  if (!tag) {
    return { error: "标签创建失败" };
  }

  revalidateSiteContent([cacheTags.tags]);

  return { id: tag.id };
}

export async function createTags(tags: z.infer<typeof createTagSchema>[]) {
  const resultTags = await Promise.all(
    tags.map(async (tag) => {
      const resultTag = await createTag(tag);
      if ("error" in resultTag) {
        throw new Error(resultTag.error);
      }
      return { id: resultTag.id };
    }),
  );
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
