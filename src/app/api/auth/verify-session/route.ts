import { db } from "@/server/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { sessionId } = (await request.json()) as { sessionId: string };

    if (!sessionId) return NextResponse.json({ valid: false });

    const session = await db.session.findUnique({
      where: {
        id: sessionId,
        expires: { gt: new Date() },
      },
    });

    return NextResponse.json({ valid: !!session });
  } catch (error) {
    console.error("Session verification error:", error);
    return NextResponse.json({ valid: false });
  }
}
