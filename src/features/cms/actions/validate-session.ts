"use server";

import { getValidSessionById } from "@fwqgo/auth/session";
import { getCmsSessionId } from "@fwqgo/auth/session-cookie";
import { cookies } from "next/headers";

export async function validateSession(sessionId: string) {
  const cookieSessionId = getCmsSessionId(await cookies());
  if (!cookieSessionId || cookieSessionId !== sessionId) {
    return false;
  }

  return Boolean(await getValidSessionById(sessionId));
}
