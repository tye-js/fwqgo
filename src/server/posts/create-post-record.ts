import { eq } from "drizzle-orm";

import { normalizeArticleHtml } from "@/lib/content";
import { slugify } from "@/lib/utils";
import { cacheTags, revalidateSiteContent } from "@/server/cache/tags";
import { db } from "@/server/db";
import { categories, postTags, posts, tags } from "@/server/db/schema";
import { syncImageReferencesForPost } from "@/server/images/assets";
import { shortenArticleOutboundLinks } from "@/server/links/outbound-short-link";
import { type CreatePostParams } from "@/types/post.types";

export interface CreatePostInput {
  title: string;
  description: string;
  content: string;
  imgUrl?: string;
  published: boolean;
  categoryId: number;
  recommendedTagName?: string | null;
  keywords?: string | null;
}

interface CreatePostRecordOptions {
  revalidate?: boolean;
}

type PostRecordExecutor = Pick<typeof db, "insert" | "select">;

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? `；原因：${error.cause.message}`
        : typeof error.cause === "string"
          ? `；原因：${error.cause}`
          : "";

    return `${error.message}${cause}`;
  }

  return typeof error === "string" ? error : "未知错误";
}

function normalizeTagName(name: string) {
  return name.trim();
}

function uniqueTagsBySlug<T extends { name: string }>(tagList: T[]) {
  const uniqueTags = new Map<string, T & { name: string }>();

  for (const tag of tagList) {
    const name = normalizeTagName(tag.name);
    const slug = slugify(name);

    if (!name || !slug || uniqueTags.has(slug)) {
      continue;
    }

    uniqueTags.set(slug, { ...tag, name });
  }

  return Array.from(uniqueTags.values());
}

export async function createPostRecord(
  input: CreatePostInput | CreatePostParams,
  options: CreatePostRecordOptions = {},
) {
  const shouldRevalidate = options.revalidate ?? true;
  const result = await db.transaction((tx) => createPostRecordInTransaction(input, tx));

  if (result.data) {
    await syncImageReferencesForPost(result.data.id);
  }

  if (result.data && shouldRevalidate) {
    revalidateSiteContent(result.revalidateTags);
  }

  if (result.error) {
    return { error: result.error };
  }

  return { data: result.data };
}

export async function createPostRecordInTransaction(
  input: CreatePostInput | CreatePostParams,
  tx: PostRecordExecutor,
) {
  const postInput = "post" in input ? input.post : input;
  const inputTags = uniqueTagsBySlug("tags" in input ? input.tags : []);

  const [category] = await tx
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, postInput.categoryId))
    .limit(1);

  if (!category) {
    return { error: "分类不存在" };
  }

  const slug = slugify(postInput.title);
  const normalizedContent = normalizeArticleHtml(
    await shortenArticleOutboundLinks(postInput.content),
  );

  const [existingPost] = await tx
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1);

  if (existingPost) {
    return { error: "文章已存在" };
  }

  const tagRows = await Promise.all(
    inputTags.map(async (tag) => {
      const tagSlug = slugify(tag.name);
      const [existingTag] = await tx
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(eq(tags.slug, tagSlug))
        .limit(1);

      if (existingTag) {
        return existingTag;
      }

      const [newTag] = await tx
        .insert(tags)
        .values({ name: tag.name, slug: tagSlug })
        .returning({ id: tags.id, name: tags.name });

      return newTag!;
    }),
  );
  const recommendedTag =
    postInput.recommendedTagName
      ? (tagRows.find((tag) => tag.name === postInput.recommendedTagName) ??
        (
          await tx
            .select({ id: tags.id, name: tags.name })
            .from(tags)
            .where(eq(tags.name, postInput.recommendedTagName))
            .limit(1)
        )[0] ??
        null)
      : null;

  const [post] = await tx
    .insert(posts)
    .values({
      ...postInput,
      slug,
      content: normalizedContent,
      recommendedTagName: recommendedTag?.name ?? null,
      recommendedTagId: recommendedTag?.id ?? null,
    })
    .returning();

  if (post && tagRows.length > 0) {
    await tx.insert(postTags).values(
      tagRows.map((tag) => ({
        postId: post.id,
        tagId: tag.id,
      })),
    );
  }

  return {
    data: post,
    revalidateTags: post
      ? [
          cacheTags.post(post.id),
          cacheTags.postSlug(post.slug),
          cacheTags.category(post.categoryId),
          cacheTags.categorySlug(category.slug),
          ...(inputTags.length > 0 ? [cacheTags.tags] : []),
        ]
      : [],
  };
}
