import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const sessionId = request.cookies.get("session_id")?.value;

  if (request.nextUrl.pathname.startsWith("/end")) {
    if (!sessionId) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // 将 session 验证信息添加到请求头中
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-session-id", sessionId);
    // // 调用验证API
    // const response = await fetch(
    //   `${request.nextUrl.origin}/api/auth/verify-session`,
    //   {
    //     method: "POST",
    //     headers: {
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({ sessionId }),
    //     cache: "no-store", // 禁用缓存
    //   },
    // );
    // 使用 rewrite 或者 next() 来继续请求，让 API 路由来处理验证
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/end/:path*"],
};
