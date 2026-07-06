"use server";

import { getValidSessionById } from "@fwqgo/auth/session";
import { cookies } from "next/headers";

export async function validateSession(sessionId: string) {
  try {
    const cookieSessionId = (await cookies()).get("session_id")?.value;
    if (!cookieSessionId || cookieSessionId !== sessionId) {
      return false;
    }

    return Boolean(await getValidSessionById(sessionId));
  } catch (error) {
    console.error("Session validation failed:", error);
    return false;
  }
}
