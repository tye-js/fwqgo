import { NextResponse } from "next/server";
import { getValidSessionById } from "@fwqgo/auth/session";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const sessionId = (await cookies()).get("session_id")?.value;

    if (!sessionId) return NextResponse.json({ valid: false });

    const session = await getValidSessionById(sessionId);

    return NextResponse.json({ valid: !!session });
  } catch (error) {
    console.error("Session verification error:", error);
    return NextResponse.json({ valid: false });
  }
}
