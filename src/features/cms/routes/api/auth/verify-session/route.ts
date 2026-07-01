import { NextResponse } from "next/server";
import { getValidSessionById } from "@/server/auth/session";

export async function POST(request: Request) {
  try {
    const { sessionId } = (await request.json()) as { sessionId: string };

    if (!sessionId) return NextResponse.json({ valid: false });

    const session = await getValidSessionById(sessionId);

    return NextResponse.json({ valid: !!session });
  } catch (error) {
    console.error("Session verification error:", error);
    return NextResponse.json({ valid: false });
  }
}
