import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { cache } from "react";

import { getCmsSessionId } from "@fwqgo/auth/session-cookie";
import { db } from "@fwqgo/db";
import { sessions, users } from "@fwqgo/db/schema";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getValidSessionById(
  sessionId: string | null | undefined,
) {
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
        role: users.role,
        status: users.status,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expires, new Date()),
        eq(users.role, "admin"),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  return session ?? null;
}

// React only memoizes inside the current server render, never across requests.
// Layouts, pages and protected loaders can keep their own authorization boundary.
export const getCurrentSession = cache(async () => {
  const sessionId = getCmsSessionId(await cookies());
  return getValidSessionById(sessionId);
});

export async function requireAdminSession() {
  const session = await getCurrentSession();

  if (session?.user.status !== "active" || session.user.role !== "admin") {
    throw new UnauthorizedError();
  }

  return session;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof UnauthorizedError;
}
