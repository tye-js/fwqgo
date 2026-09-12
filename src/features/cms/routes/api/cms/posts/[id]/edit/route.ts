import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@fwqgo/core/bounded-request-body";
import { parsePostgresIntegerId } from "@fwqgo/core/utils";
import { connection } from "next/server";
import { isSameOriginRequest } from "@fwqgo/core/same-origin-request";

import { savePostEdits } from "@/features/cms/actions/post";
import { adminApiFailure, adminApiSuccess } from "@/lib/admin-api-response";

const MAX_POST_EDIT_BODY_BYTES = 3 * 1024 * 1024;

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  if (!isSameOriginRequest(request, process.env.NEXT_PUBLIC_CMS_URL)) {
    return adminApiFailure("请求来源无效，请从后台编辑页重试", { status: 403 });
  }
  await connection();
  try {
    await requireAdminSession();
    const { id } = await props.params;
    const postId = parsePostgresIntegerId(id);
    if (postId === null)
      return adminApiFailure("文章 ID 不正确", {
        status: 400,
        title: "文章保存失败",
      });
    let payload: unknown;
    try {
      payload = JSON.parse(
        await readRequestTextWithLimit(request, MAX_POST_EDIT_BODY_BYTES),
      );
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError)
        return adminApiFailure("文章保存请求超过 3 MB", {
          status: 413,
          title: "文章保存失败",
        });
      if (error instanceof SyntaxError)
        return adminApiFailure("文章保存请求不是有效 JSON", {
          status: 400,
          title: "文章保存失败",
        });
      throw error;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return adminApiFailure("文章信息格式不正确", {
        status: 400,
        title: "文章保存失败",
      });
    }
    const result = await savePostEdits({ ...payload, id: postId });
    if (result.error) {
      return adminApiFailure(result.message, {
        status: result.status,
        title: result.error,
        suggestion: "文章未保存，请修正提示的问题后重试。",
      });
    }
    return adminApiSuccess(result.data);
  } catch (error) {
    if (isUnauthorizedError(error))
      return adminApiFailure("未登录或登录已过期", {
        status: 401,
        title: "登录已过期",
      });
    console.error("Post edit API failed:", error);
    return adminApiFailure("文章未保存，请稍后重试", {
      status: 500,
      title: "文章保存失败",
    });
  }
}
