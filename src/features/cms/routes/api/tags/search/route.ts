import { findBestTagMatch } from "@/features/cms/data/tag";
import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";
import { connection, NextResponse } from "next/server";
import { adminActionFailure, adminActionSuccess } from "@/lib/admin-action-result";

export async function GET(request: Request) {
  await connection();

  try {
    await requireAdminSession();

    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";

    if (!query) {
      return NextResponse.json(
        {
          ...adminActionFailure("请输入标签关键词", {
            title: "标签搜索失败",
            suggestion: "请填写地区、线路、品牌或用途关键词后再搜索。",
          }),
          found: false,
        },
        { status: 400 },
      );
    }

    const { data: tag } = await findBestTagMatch(query);

    if (!tag) {
      return NextResponse.json({
        ...adminActionSuccess({ found: false }),
        found: false,
      });
    }

    return NextResponse.json({
      ...adminActionSuccess({
        found: true,
        slug: tag.slug,
        name: tag.name,
      }),
      found: true,
      slug: tag.slug,
      name: tag.name,
    });
  } catch (error) {
    console.error("Tag search failed:", error);

    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        {
          ...adminActionFailure("登录已过期", {
            title: "标签搜索失败",
            suggestion: "请重新登录后台后再搜索标签。",
          }),
          found: false,
        },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        ...adminActionFailure("标签搜索暂时不可用", {
          title: "标签搜索失败",
          suggestion: "请稍后重试，仍失败请检查服务端日志。",
        }),
        found: false,
      },
      { status: 500 },
    );
  }
}
