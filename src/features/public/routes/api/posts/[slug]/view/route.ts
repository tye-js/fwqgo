import { createHash } from "node:crypto";
import { incrementPostViews } from "@/features/public/actions/post-views";
import { decodeSlug } from "@fwqgo/core/utils";
import { getTrustedClientIp } from "@fwqgo/core/client-ip";
import { PostViewRateLimiter } from "@fwqgo/core/post-view-rate-limit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const VIEW_COOKIE_TTL = 60 * 60;
const VIEW_RATE_LIMIT_MS = VIEW_COOKIE_TTL * 1000;
const globalForViewRateLimit = globalThis as unknown as {
  postViewRateLimiter?: PostViewRateLimiter;
};
const postViewRateLimits =
  globalForViewRateLimit.postViewRateLimiter ??
  new PostViewRateLimiter(VIEW_RATE_LIMIT_MS);

if (process.env.NODE_ENV !== "production") {
  globalForViewRateLimit.postViewRateLimiter = postViewRateLimits;
}

function claimViewRateLimit(request: Request, slug: string) {
  return postViewRateLimits.claim(getTrustedClientIp(request.headers), slug);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const params = await context.params;
    let slug: string;
    try {
      slug = decodeSlug(params.slug).trim();
    } catch {
      return NextResponse.json({ counted: false }, { status: 400 });
    }
    if (!slug || slug.length > 360) {
      return NextResponse.json({ counted: false }, { status: 400 });
    }
    const viewedPostCookie = `viewed_post_${createHash("sha256")
      .update(slug)
      .digest("hex")
      .slice(0, 16)}`;
    const cookieStore = await cookies();

    if (cookieStore.has(viewedPostCookie)) {
      return NextResponse.json({ counted: false });
    }

    const rateLimitClaim = claimViewRateLimit(request, slug);
    if (rateLimitClaim === false) {
      return NextResponse.json({ counted: false });
    }

    const counted = await incrementPostViews({ slug });
    if (!counted && rateLimitClaim) {
      postViewRateLimits.release(rateLimitClaim);
    }
    const response = NextResponse.json({ counted });

    if (counted) {
      response.cookies.set(viewedPostCookie, "1", {
        httpOnly: true,
        maxAge: VIEW_COOKIE_TTL,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (error) {
    console.error("Failed to track post view:", error);
    return NextResponse.json({ counted: false }, { status: 500 });
  }
}
