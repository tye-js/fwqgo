import { eq, or } from "drizzle-orm";

import {
  looksLikeHtmlContent,
  normalizeArticleHtml,
} from "@fwqgo/core/content";
import { slugify } from "@fwqgo/core/utils";
import { cacheTags, revalidateSiteContent } from "@fwqgo/cache/tags";
import { db } from "@fwqgo/db";
import { categories, postTags, posts, tags } from "@fwqgo/db/schema";
import { syncImageReferencesForPost } from "@/server/images/assets";
import {
  shortenArticleOutboundLinks,
  shortenMarkdownOutboundLinks,
} from "@/server/links/outbound-short-link";
import { type CreatePostParams } from "@/types/post.types";
import { schedulePublicWebCache } from "@/server/cache/public-revalidation-client";

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

export async function prepareArticleContentForStorage(content: string) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return "";
  }

  if (looksLikeHtmlContent(trimmedContent)) {
    return normalizeArticleHtml(
      await shortenArticleOutboundLinks(trimmedContent),
    );
  }

  return shortenMarkdownOutboundLinks(trimmedContent);
}

function normalizeTagName(name: string) {
  return name.trim();
}

function normalizeSeoKeywords(value?: string | null) {
  const normalized = value
    ?.replace(/，/g, ",")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(",");

  return normalized ?? "";
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

async function getOrCreateTagByName(
  tx: PostRecordExecutor,
  input: { name: string; slug: string },
) {
  const [existingTag] = await tx
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(or(eq(tags.slug, input.slug), eq(tags.name, input.name)))
    .limit(1);

  if (existingTag) {
    return existingTag;
  }

  const [insertedTag] = await tx
    .insert(tags)
    .values({ name: input.name, slug: input.slug })
    .onConflictDoNothing()
    .returning({ id: tags.id, name: tags.name });

  if (insertedTag) {
    return insertedTag;
  }

  const [createdByConcurrentRequest] = await tx
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(or(eq(tags.slug, input.slug), eq(tags.name, input.name)))
    .limit(1);

  if (!createdByConcurrentRequest) {
    throw new Error(`标签创建失败：${input.name}`);
  }

  return createdByConcurrentRequest;
}

export async function createPostRecord(
  input: CreatePostInput | CreatePostParams,
  options: CreatePostRecordOptions = {},
) {
  const shouldRevalidate = options.revalidate ?? true;
  const result = await db.transaction((tx) =>
    createPostRecordInTransaction(input, tx),
  );

  if (result.data) {
    try {
      await syncImageReferencesForPost(result.data.id);
    } catch (error) {
      console.error("文章已创建，但图片引用同步失败:", error);
    }
  }

  if (result.data && shouldRevalidate) {
    try {
      revalidateSiteContent(result.revalidateTags);
      schedulePublicWebCache("post.changed", {
        postIds: [result.data.id],
        postSlugs: [result.data.slug],
        categoryIds: [result.data.categoryId],
      });
    } catch (error) {
      console.error("文章已创建，但缓存刷新失败:", error);
    }
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
  const normalizedTitle = postInput.title.trim();
  const normalizedDescription = postInput.description?.trim() ?? "";

  if (!normalizedTitle) {
    return { error: "文章标题不能为空" };
  }

  if (!normalizedDescription) {
    return { error: "文章摘要不能为空" };
  }

  const [category] = await tx
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(eq(categories.id, postInput.categoryId))
    .limit(1);

  if (!category) {
    return { error: "分类不存在" };
  }

  const slug = slugify(normalizedTitle);
  if (!slug) {
    return { error: "文章标题需要包含中文、英文或数字" };
  }

  const normalizedContent = await prepareArticleContentForStorage(
    postInput.content,
  );
  if (!normalizedContent) {
    return { error: "文章正文不能为空" };
  }

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
      return getOrCreateTagByName(tx, { name: tag.name, slug: tagSlug });
    }),
  );
  const recommendedTagName = normalizeTagName(
    postInput.recommendedTagName ?? "",
  );
  const recommendedTagSlug = recommendedTagName
    ? slugify(recommendedTagName)
    : "";
  const recommendedTag =
    recommendedTagName && recommendedTagSlug
      ? (tagRows.find((tag) => tag.name === recommendedTagName) ??
        (
          await tx
            .select({ id: tags.id, name: tags.name })
            .from(tags)
            .where(eq(tags.slug, recommendedTagSlug))
            .limit(1)
        )[0] ??
        (await getOrCreateTagByName(tx, {
          name: recommendedTagName,
          slug: recommendedTagSlug,
        })))
      : null;

  const [post] = await tx
    .insert(posts)
    .values({
      ...postInput,
      title: normalizedTitle,
      description: normalizedDescription,
      slug,
      content: normalizedContent,
      keywords: normalizeSeoKeywords(postInput.keywords),
      recommendedTagName: recommendedTag?.name ?? null,
      recommendedTagId: recommendedTag?.id ?? null,
      affiliateReviewStatus: postInput.published ? "passed" : "pending",
      affiliateReviewUpdatedAt: postInput.published ? new Date() : null,
    })
    .onConflictDoNothing({ target: posts.slug })
    .returning();

  if (!post) {
    return { error: "文章已存在，请修改标题后重试" };
  }

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
