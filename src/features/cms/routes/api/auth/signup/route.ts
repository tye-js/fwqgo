import { db } from "@fwqgo/db";
import { hash } from "bcryptjs";
import { z } from "zod";
import { users } from "@fwqgo/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { adminApiFailure, adminApiSuccess } from "@/lib/admin-api-response";

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
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  try {
    if (process.env.ENABLE_PUBLIC_SIGNUP !== "true") {
      return adminApiFailure("注册入口已关闭", {
        status: 403,
        title: "注册失败",
        suggestion: "请在服务器环境变量中确认 ENABLE_PUBLIC_SIGNUP 是否需要开启。",
      });
    }

    const body = registerSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!body.success) {
      return adminApiFailure(
        body.error.issues[0]?.message ?? "注册信息格式不正确",
        {
          status: 400,
          title: "注册失败",
          suggestion: "请按页面提示检查用户名、密码和确认密码。",
        },
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
      return adminApiFailure("用户名已存在", {
        status: 400,
        title: "注册失败",
        suggestion: "请换一个用户名后重试。",
      });
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

    return adminApiSuccess({ created: true });
  } catch {
    return adminApiFailure("注册失败，请重试", {
      status: 500,
      title: "注册失败",
      suggestion: "请稍后重试，仍失败请检查服务端日志和数据库连接。",
    });
  }
}
