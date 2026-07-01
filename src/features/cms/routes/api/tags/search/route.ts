import { findBestTagMatch } from "@/features/cms/data/tag";
import { connection, NextResponse } from "next/server";

export async function GET(request: Request) {
  await connection();

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";

    if (!query) {
      return NextResponse.json({ found: false }, { status: 400 });
    }

    const { data: tag } = await findBestTagMatch(query);

    if (!tag) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      slug: tag.slug,
      name: tag.name,
    });
  } catch (error) {
    console.error("Tag search failed:", error);
    return NextResponse.json({ found: false }, { status: 500 });
  }
}
