import { createHash } from "node:crypto";
import { incrementPostViews } from "@/features/public/actions/post-views";
import { decodeSlug } from "@fwqgo/core/utils";
import { getTrustedClientIp } from "@fwqgo/core/client-ip";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const VIEW_COOKIE_TTL = 60 * 60;
const VIEW_RATE_LIMIT_MS = VIEW_COOKIE_TTL * 1000;
const MAX_VIEW_RATE_LIMIT_ENTRIES = 10_000;
const globalForViewRateLimit = globalThis as unknown as {
  postViewRateLimits?: Map<string, number>;
};
const postViewRateLimits =
  globalForViewRateLimit.postViewRateLimits ?? new Map<string, number>();

if (process.env.NODE_ENV !== "production") {
  globalForViewRateLimit.postViewRateLimits = postViewRateLimits;
}

function pruneViewRateLimits(now: number) {
  if (postViewRateLimits.size < MAX_VIEW_RATE_LIMIT_ENTRIES) return;

  for (const [key, expiresAt] of postViewRateLimits) {
    if (expiresAt <= now) postViewRateLimits.delete(key);
  }

  while (postViewRateLimits.size >= MAX_VIEW_RATE_LIMIT_ENTRIES) {
    const oldestKey = postViewRateLimits.keys().next().value;
    if (!oldestKey) break;
    postViewRateLimits.delete(oldestKey);
  }
}

function claimViewRateLimit(request: Request, slug: string) {
  const ip = getTrustedClientIp(request.headers);
  if (!ip) return null;

  const now = Date.now();
  pruneViewRateLimits(now);
  const key = createHash("sha256")
    .update(`${ip}\0${slug}`)
    .digest("hex")
    .slice(0, 32);
  const expiresAt = postViewRateLimits.get(key) ?? 0;
  if (expiresAt > now) return false;

  postViewRateLimits.set(key, now + VIEW_RATE_LIMIT_MS);
  return key;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const params = await context.params;
    let slug: string;
    try {
      slug = decodeSlug(params.slug);
    } catch {
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
      postViewRateLimits.delete(rateLimitClaim);
    }
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
