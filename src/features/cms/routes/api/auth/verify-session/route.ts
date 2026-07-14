import { NextResponse } from "next/server";
import { getValidSessionById } from "@fwqgo/auth/session";
import { getCmsSessionId } from "@fwqgo/auth/session-cookie";
import { cookies } from "next/headers";

function sessionResponse(valid: boolean) {
  return NextResponse.json(
    { valid },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
}

export async function POST() {
  try {
    const sessionId = getCmsSessionId(await cookies());

    if (!sessionId) return sessionResponse(false);

    const session = await getValidSessionById(sessionId);

    return sessionResponse(Boolean(session));
  } catch (error) {
    console.error("Session verification error:", error);
    return sessionResponse(false);
  }
}
