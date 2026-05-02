"use server";

import { db } from "@/server/db";
import { sessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function validateSession(sessionId: string) {
  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const expiresAt = session?.expires;
    if (!session || !expiresAt) return false;
    return expiresAt > new Date();
  } catch (error) {
    return { valid: false, message: error };
  }
}
