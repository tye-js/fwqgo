import { connection, NextResponse } from "next/server";

import { findBestTagMatch } from "@/features/public/data/tag";

const MAX_QUERY_LENGTH = 160;

export async function GET(request: Request) {
  await connection();

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json(
      { found: false, error: "请输入搜索关键词" },
      { status: 400 },
    );
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { found: false, error: "搜索关键词不能超过 160 个字符" },
      { status: 400 },
    );
  }

  try {
    const { data: tag } = await findBestTagMatch(query);
    if (!tag) return NextResponse.json({ found: false });

    return NextResponse.json({
      found: true,
      slug: tag.slug,
      name: tag.name,
    });
  } catch (error) {
    console.error("Public tag search failed:", error);
    return NextResponse.json(
      { found: false, error: "标签搜索暂时不可用" },
      { status: 503 },
    );
  }
}
