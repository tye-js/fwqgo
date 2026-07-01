import { createHash } from "node:crypto";
import { incrementPostViews } from "@/app/_actions/post-actions";
import { decodeSlug } from "@/lib/utils";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const VIEW_COOKIE_TTL = 60 * 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const params = await context.params;
    const slug = decodeSlug(params.slug);
    const viewedPostCookie = `viewed_post_${createHash("sha256")
      .update(slug)
      .digest("hex")
      .slice(0, 16)}`;
    const cookieStore = await cookies();

    if (cookieStore.has(viewedPostCookie)) {
      return NextResponse.json({ counted: false });
    }

    const counted = await incrementPostViews({ slug });
    const response = NextResponse.json({ counted });

    if (counted) {
      response.cookies.set(viewedPostCookie, "1", {
        httpOnly: true,
        maxAge: VIEW_COOKIE_TTL,
        path: "/",
        sameSite: "lax",
      });
    }

    return response;
  } catch (error) {
    console.error("Failed to track post view:", error);
    return NextResponse.json({ counted: false }, { status: 500 });
  }
}
