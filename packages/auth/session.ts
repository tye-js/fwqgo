import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { sessions, users } from "@fwqgo/db/schema";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getValidSessionById(sessionId: string | null | undefined) {
  if (!sessionId) {
    return null;
  }

  const [session] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expires: sessions.expires,
      user: {
        id: users.id,
        username: users.username,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expires, new Date())))
    .limit(1);

  return session ?? null;
}

export async function getCurrentSession() {
  const sessionId = (await cookies()).get("session_id")?.value;
  return getValidSessionById(sessionId);
}

export async function requireAdminSession() {
  const session = await getCurrentSession();

  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof UnauthorizedError;
}
