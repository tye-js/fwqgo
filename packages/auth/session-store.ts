import { randomUUID } from "node:crypto";

import { lte } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { sessions } from "@fwqgo/db/schema";

export const CMS_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function getCmsSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + CMS_SESSION_TTL_MS);
}

export async function createCmsSession(userId: string, now = new Date()) {
  const expires = getCmsSessionExpiresAt(now);

  return db.transaction(async (tx) => {
    await tx.delete(sessions).where(lte(sessions.expires, now));

    const [session] = await tx
      .insert(sessions)
      .values({
        id: randomUUID(),
        userId,
        expires,
        sessionToken: randomUUID(),
      })
      .returning();

    return session ?? null;
  });
}
