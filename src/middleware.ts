import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const sessionId = request.cookies.get("session_id")?.value;

  if (request.nextUrl.pathname.startsWith("/end")) {
    if (!sessionId) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // 调用验证API
    const response = await fetch(
      `${request.nextUrl.origin}/api/auth/verify-session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      },
    );

    const { valid } = (await response.json()) as { valid: boolean };

    if (!valid) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/end/:path*"],
};
