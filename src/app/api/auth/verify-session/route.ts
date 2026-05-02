import { db } from "@/server/db";
import { NextResponse } from "next/server";
import { sessions } from "@/server/db/schema";
import { eq, gt, and } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { sessionId } = (await request.json()) as { sessionId: string };

    if (!sessionId) return NextResponse.json({ valid: false });

    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), gt(sessions.expires, new Date())))
      .limit(1);

    return NextResponse.json({ valid: !!session });
  } catch (error) {
    console.error("Session verification error:", error);
    return NextResponse.json({ valid: false });
  }
}
