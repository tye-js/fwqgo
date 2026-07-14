import { NextResponse, type NextRequest } from "next/server";

import { clearCmsSessionCookies } from "@fwqgo/auth/session-cookie";

export async function GET(request: NextRequest) {
  const target = new URL("/login", request.url);
  target.searchParams.set("reason", "session_expired");

  const response = NextResponse.redirect(target, 303);
  response.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  clearCmsSessionCookies(response);
  return response;
}
