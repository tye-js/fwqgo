import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@fwqgo/core/same-origin-request";

import {
  clearCmsSessionCookies,
  getCmsSessionId,
} from "@fwqgo/auth/session-cookie";
import { db } from "@fwqgo/db";
import { sessions } from "@fwqgo/db/schema";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request, process.env.NEXT_PUBLIC_CMS_URL)) {
    return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  }
  const sessionId = getCmsSessionId(await cookies());
  let revoked = true;

  if (sessionId) {
    try {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    } catch (error) {
      revoked = false;
      console.error("Failed to revoke CMS session:", error);
    }
  }

  const response = NextResponse.json(
    { success: true, revoked },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
  clearCmsSessionCookies(response);
  return response;
}
