import { isUnauthorizedError } from "@fwqgo/auth/session";
import { connection, NextResponse } from "next/server";
import { z } from "zod";

import { updatePostContent, updatePostTags } from "@/features/cms/actions/post";
import { type TagMain } from "@/types";

const tagSchema = z.object({
  tag: z.object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1),
    slug: z.string().trim(),
  }),
});

const payloadSchema = z.object({
  description: z.string().trim().min(1, "文章简述不能为空"),
  content: z.string().trim().min(1, "文章正文不能为空"),
  imgUrl: z.string().nullable().optional(),
  categoryId: z.number().int().positive("文章分类不正确"),
  recommendTagName: z.string(),
  keywords: z.string(),
  oldTags: z.array(tagSchema),
  newTags: z.array(tagSchema).min(1, "请添加标签"),
});

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "请求参数不正确";
  }

  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "未知错误";
}

function formatActionError(result: { error?: string; message?: unknown }) {
  if (!result.error) return null;
  return typeof result.message === "string" && result.message.trim()
    ? result.message
    : result.error;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  await connection();

  try {
    const { id } = await props.params;
    const postId = Number(id);
    if (!Number.isSafeInteger(postId) || postId <= 0) {
      return NextResponse.json({ error: "文章 ID 不正确" }, { status: 400 });
    }

    const payload = payloadSchema.parse(await request.json());
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
      return NextResponse.json({ error: contentError }, { status: 400 });
    }

    const tagsResult = await updatePostTags({
      postId,
      oldTags: payload.oldTags as TagMain[],
      newTags: payload.newTags,
    });
    const tagsError = formatActionError(tagsResult);
    if (tagsError) {
      return NextResponse.json({ error: tagsError }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Post edit API failed:", error);

    if (isUnauthorizedError(error)) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
    }

    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
