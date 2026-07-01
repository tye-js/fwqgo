"use server";

import { getValidSessionById } from "@fwqgo/auth/session";

export async function validateSession(sessionId: string) {
  try {
    return Boolean(await getValidSessionById(sessionId));
  } catch (error) {
    console.error("Session validation failed:", error);
    return false;
  }
}
