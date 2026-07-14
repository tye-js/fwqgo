import { db } from "@fwqgo/db";
import { compare } from "bcryptjs";
import { z } from "zod";
import { randomUUID } from "crypto";
import { users, sessions } from "@fwqgo/db/schema";
import { eq } from "drizzle-orm";
import { getTrustedClientIp } from "@fwqgo/core/client-ip";
import { BoundedAttemptTracker } from "@fwqgo/core/bounded-attempt-tracker";
import {
  attachRequestId,
  getRequestId,
  structuredLog,
} from "@fwqgo/core/structured-log";
import {
  clearLegacyCmsSessionCookies,
  getCmsSessionCookieName,
  getCmsSessionCookieOptions,
} from "@fwqgo/auth/session-cookie";

import { adminApiFailure, adminApiSuccess } from "@/lib/admin-api-response";

const loginSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(6),
});

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 8;
const INVALID_PASSWORD_HASH =
  "$2b$12$0o3Y6jZ9leQTD33zjL.feeHeFXM0S6eYzKl31bz6EuI1IobmzerUi";
const globalForLoginRateLimit = globalThis as unknown as {
  loginAttemptTracker?: BoundedAttemptTracker;
};
const loginAttemptTracker =
  globalForLoginRateLimit.loginAttemptTracker ??
  new BoundedAttemptTracker({
    maxAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
    lockMs: LOGIN_LOCK_MS,
    maxEntries: 20_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForLoginRateLimit.loginAttemptTracker = loginAttemptTracker;
}

function getLoginAttemptKeys(request: Request, username: string) {
  const ip = getTrustedClientIp(request.headers) ?? "unknown";
  return [`ip:${ip}`, `ip-user:${ip}:${username.toLowerCase()}`];
}

function getLoginRetryAfterSeconds(keys: string[]) {
  return loginAttemptTracker.getRetryAfterSeconds(keys);
}

function recordFailedLoginAttempt(keys: string[]) {
  loginAttemptTracker.recordAttempt(keys);
}

function clearFailedLoginAttempts(keys: string[]) {
  loginAttemptTracker.clear(keys);
}

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers);
  const respond = <T extends Response>(response: T) =>
    attachRequestId(response, requestId);

  try {
    const body = loginSchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
      return respond(
        adminApiFailure("请输入有效的用户名和密码", {
          status: 400,
          title: "登录失败",
          suggestion: "请检查用户名不少于 3 个字符，密码不少于 6 个字符。",
        }),
      );
    }

    const { username, password } = body.data;
    const attemptKeys = getLoginAttemptKeys(request, username);
    const retryAfterSeconds = getLoginRetryAfterSeconds(attemptKeys);

    if (retryAfterSeconds > 0) {
      return respond(
        adminApiFailure("登录尝试过多，请稍后再试", {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
          title: "登录失败",
          suggestion: `为了保护后台账号，当前来源已临时限速，请约 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试。`,
        }),
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const isValidPassword = await compare(
      password,
      user?.password ?? INVALID_PASSWORD_HASH,
    );

    if (!user || !isValidPassword) {
      recordFailedLoginAttempt(attemptKeys);
      return respond(
        adminApiFailure("用户名或密码错误", {
          status: 401,
          title: "登录失败",
          suggestion: "请确认账号和密码后重试。",
        }),
      );
    }

    clearFailedLoginAttempts(attemptKeys);

    // 创建 session
    const sessionId = randomUUID();
    const [session] = await db
      .insert(sessions)
      .values({
        id: sessionId,
        userId: user.id,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天
        sessionToken: randomUUID(), // 添加随机生成的 sessionToken
      })
      .returning();

    if (!session) {
      return respond(
        adminApiFailure("会话创建失败", {
          status: 500,
          title: "登录失败",
          suggestion: "请稍后重试，仍失败请检查数据库会话表。",
        }),
      );
    }

    const response = adminApiSuccess({ authenticated: true });
    response.cookies.set(
      getCmsSessionCookieName(),
      session.id,
      getCmsSessionCookieOptions(session.expires),
    );
    clearLegacyCmsSessionCookies(response);
    response.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );

    structuredLog("info", "cms.auth.login_succeeded", {
      requestId,
      userId: user.id,
    });
    return respond(response);
  } catch (error) {
    structuredLog("error", "cms.auth.login_failed", { requestId, error });
    return respond(
      adminApiFailure("登录失败", {
        status: 500,
        title: "登录失败",
        suggestion: "请稍后重试，仍失败请检查服务端日志。",
      }),
    );
  }
}
