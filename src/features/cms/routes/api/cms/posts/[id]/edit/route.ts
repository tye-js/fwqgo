import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@fwqgo/core/bounded-request-body";
import { postgresIntegerIdSchema } from "@fwqgo/core/postgres-id";
import { parsePostgresIntegerId } from "@fwqgo/core/utils";
import { connection } from "next/server";
import { z } from "zod";

import {
  updatePost,
  updatePostContent,
  updatePostTags,
} from "@/features/cms/actions/post";
import { adminApiFailure, adminApiSuccess } from "@/lib/admin-api-response";
import { type TagMain } from "@/types";

const MAX_POST_EDIT_BODY_BYTES = 3 * 1024 * 1024;

const tagSchema = z.object({
  tag: z.object({
    id: postgresIntegerIdSchema.optional(),
    name: z.string().trim().min(1),
    slug: z.string().trim(),
  }),
});

const payloadSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "文章标题不能为空")
    .max(300, "文章标题不能超过 300 个字符"),
  slug: z
    .string()
    .trim()
    .min(1, "文章 slug 不能为空")
    .max(360, "文章 slug 不能超过 360 个字符")
    .refine((value) => !/[\s/?#]/.test(value), {
      message: "文章 slug 不能包含空格、斜杠、问号或井号",
    }),
  published: z.boolean(),
  description: z.string().trim().min(1, "文章简述不能为空"),
  content: z.string().trim().min(1, "文章正文不能为空"),
  imgUrl: z.string().nullable().optional(),
  categoryId: postgresIntegerIdSchema,
  recommendTagName: z.string().max(160, "推荐标签不能超过 160 个字符"),
  keywords: z.string().max(800, "关键词不能超过 800 个字符"),
  oldTags: z.array(tagSchema).max(100, "原标签数量不能超过 100 个"),
  newTags: z
    .array(tagSchema)
    .min(1, "请添加标签")
    .max(100, "文章标签不能超过 100 个"),
});

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "请求参数不正确";
  }

  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? `；原因：${error.cause.message}`
        : typeof error.cause === "string"
          ? `；原因：${error.cause}`
          : "";
    return `${error.message}${cause}`;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

function formatActionError(result: { error?: string; message?: unknown }) {
  if (!result.error) return null;
  if (result.message === undefined || result.message === null) {
    return result.error;
  }

  const detail = getErrorMessage(result.message).trim();
  if (!detail || detail === "未知错误" || detail === result.error) {
    return result.error;
  }

  return `${result.error}：${detail}`;
}

function getActionWarnings(result: { warnings?: string[] }) {
  return Array.isArray(result.warnings)
    ? result.warnings.filter((warning) => warning.trim().length > 0)
    : [];
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  await connection();

  try {
    await requireAdminSession();

    const { id } = await props.params;
    const postId = parsePostgresIntegerId(id);
    if (postId === null) {
      return adminApiFailure("文章 ID 不正确", {
        status: 400,
        title: "文章保存失败",
        suggestion: "请刷新列表后重新进入编辑页。",
      });
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(
        await readRequestTextWithLimit(request, MAX_POST_EDIT_BODY_BYTES),
      );
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return adminApiFailure("文章保存请求超过 3 MB", {
          status: 413,
          title: "文章保存失败",
          suggestion: "请压缩正文或减少内嵌数据后再保存。",
        });
      }
      if (error instanceof SyntaxError) {
        return adminApiFailure("文章保存请求不是有效 JSON", {
          status: 400,
          title: "文章保存失败",
          suggestion: "请刷新编辑页后重新提交。",
        });
      }
      throw error;
    }

    const payload = payloadSchema.parse(rawPayload);
    const contentResult = await updatePostContent({
      id: postId,
      description: payload.description,
      content: payload.content,
      imgUrl: payload.imgUrl,
      categoryId: payload.categoryId,
      recommendTagName: payload.recommendTagName,
      keywords: payload.keywords,
    });
    const contentError = formatActionError(contentResult);
    if (contentError) {
      const isServerFailure = contentResult.error === "更新文章失败";
      return adminApiFailure(contentError, {
        status: isServerFailure ? 500 : 400,
        title: "文章正文保存失败",
        suggestion: isServerFailure
          ? "请根据上方具体错误检查数据库或服务日志后重试。"
          : "请检查正文、摘要、分类和推荐标签后再保存。",
      });
    }

    const tagsResult = await updatePostTags({
      postId,
      oldTags: payload.oldTags as TagMain[],
      newTags: payload.newTags,
    });
    const tagsError = formatActionError(tagsResult);
    if (tagsError) {
      const isServerFailure = tagsResult.error === "更新文章标签失败";
      return adminApiFailure(tagsError, {
        status: isServerFailure ? 500 : 400,
        title: "文章标签保存失败",
        suggestion: isServerFailure
          ? "正文已保存，请根据上方具体标签错误处理后再次保存。"
          : "请确认标签名称有效，并至少保留一个标签。",
      });
    }

    const postResult = await updatePost({
      id: postId,
      title: payload.title,
      slug: payload.slug,
      imgUrl: payload.imgUrl ?? null,
      published: payload.published,
      routeHandler: true,
    });
    const postError = formatActionError(postResult);
    if (postError) {
      return adminApiFailure(postError, {
        status: postResult.error === "更新文章失败" ? 500 : 400,
        title: payload.published
          ? "文章内容已保存，但发布未完成"
          : "文章内容已保存，但基础信息未完成",
        suggestion: payload.published
          ? "请根据具体提示处理 slug 或发布质检问题，然后再次保存。"
          : "请检查标题和 slug，修正后再次保存。",
      });
    }

    return adminApiSuccess({
      saved: true,
      slug: postResult.data?.slug ?? payload.slug,
      published: postResult.data?.published ?? payload.published,
      warnings: [
        ...getActionWarnings(contentResult),
        ...getActionWarnings(tagsResult),
        ...getActionWarnings(postResult),
      ],
    });
  } catch (error) {
    console.error("Post edit API failed:", error);

    if (isUnauthorizedError(error)) {
      return adminApiFailure("未登录或登录已过期", {
        status: 401,
        title: "登录已过期",
        suggestion: "请重新登录后台后再保存。",
      });
    }

    if (error instanceof z.ZodError) {
      return adminApiFailure(getErrorMessage(error), {
        status: 400,
        title: "文章信息校验失败",
        suggestion: "请检查标题、slug、正文、摘要、分类和标签后再保存。",
      });
    }

    return adminApiFailure(getErrorMessage(error), {
      status: 500,
      title: "文章保存失败",
      suggestion: "请稍后重试；如果持续失败，查看服务器日志。",
    });
  }
}
