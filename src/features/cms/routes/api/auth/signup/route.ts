import { db } from "@fwqgo/db";
import { hash } from "bcryptjs";
import { z } from "zod";
import { users } from "@fwqgo/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { BoundedAttemptTracker } from "@fwqgo/core/bounded-attempt-tracker";
import { getTrustedClientIp } from "@fwqgo/core/client-ip";
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from "@fwqgo/core/bounded-request-body";
import {
  attachRequestId,
  getRequestId,
  structuredLog,
} from "@fwqgo/core/structured-log";

import { adminApiFailure, adminApiSuccess } from "@/lib/admin-api-response";

const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const MAX_AUTH_BODY_BYTES = 8 * 1024;
const MAX_SIGNUP_ATTEMPTS = 5;
const globalForSignupRateLimit = globalThis as unknown as {
  signupAttemptTracker?: BoundedAttemptTracker;
};
const signupAttemptTracker =
  globalForSignupRateLimit.signupAttemptTracker ??
  new BoundedAttemptTracker({
    maxAttempts: MAX_SIGNUP_ATTEMPTS,
    windowMs: SIGNUP_WINDOW_MS,
    lockMs: SIGNUP_WINDOW_MS,
    maxEntries: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForSignupRateLimit.signupAttemptTracker = signupAttemptTracker;
}

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "用户名至少3个字符")
      .max(20, "用户名最多20个字符")
      .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
    password: z
      .string()
      .min(6, "密码至少6个字符")
      .max(100, "密码最多100个字符"),
    confirmPassword: z.string().max(100, "确认密码最多100个字符"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers);
  const respond = <T extends Response>(response: T) =>
    attachRequestId(response, requestId);

  try {
    if (process.env.ENABLE_PUBLIC_SIGNUP !== "true") {
      return respond(
        adminApiFailure("注册入口已关闭", {
          status: 403,
          title: "注册失败",
          suggestion:
            "请在服务器环境变量中确认 ENABLE_PUBLIC_SIGNUP 是否需要开启。",
        }),
      );
    }

    const clientIp = getTrustedClientIp(request.headers) ?? "unknown";
    const attemptKey = `signup:${clientIp}`;
    const retryAfterSeconds = signupAttemptTracker.getRetryAfterSeconds([
      attemptKey,
    ]);
    if (retryAfterSeconds > 0) {
      return respond(
        adminApiFailure("注册尝试过多，请稍后再试", {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
          title: "注册失败",
          suggestion: `当前来源已临时限速，请约 ${Math.ceil(retryAfterSeconds / 60)} 分钟后再试。`,
        }),
      );
    }
    signupAttemptTracker.recordAttempt([attemptKey]);

    let payload: unknown;
    try {
      payload = JSON.parse(
        await readRequestTextWithLimit(request, MAX_AUTH_BODY_BYTES),
      );
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return respond(
          adminApiFailure("注册请求内容过大", {
            status: 413,
            title: "注册失败",
            suggestion: "请仅提交注册表单字段，单次请求不能超过 8 KB。",
          }),
        );
      }
      if (!(error instanceof SyntaxError)) throw error;
      payload = null;
    }

    const body = registerSchema.safeParse(payload);

    if (!body.success) {
      return respond(
        adminApiFailure(body.error.issues[0]?.message ?? "注册信息格式不正确", {
          status: 400,
          title: "注册失败",
          suggestion: "请按页面提示检查用户名、密码和确认密码。",
        }),
      );
    }

    const { username, password } = body.data;

    // 检查用户名是否已存在
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUser) {
      return respond(
        adminApiFailure("用户名已存在", {
          status: 400,
          title: "注册失败",
          suggestion: "请换一个用户名后重试。",
        }),
      );
    }

    // 密码加密
    const hashedPassword = await hash(password, 12);

    // 创建新用户
    await db.insert(users).values({
      id: randomUUID(),
      username,
      password: hashedPassword,
      updatedAt: new Date(),
    });

    structuredLog("info", "cms.auth.signup_succeeded", { requestId });
    return respond(adminApiSuccess({ created: true }));
  } catch (error) {
    structuredLog("error", "cms.auth.signup_failed", { requestId, error });
    return respond(
      adminApiFailure("注册失败，请重试", {
        status: 500,
        title: "注册失败",
        suggestion: "请稍后重试，仍失败请检查服务端日志和数据库连接。",
      }),
    );
  }
}
