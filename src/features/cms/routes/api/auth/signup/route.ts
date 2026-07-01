import { db } from "@fwqgo/db";
import { hash } from "bcryptjs";
import { z } from "zod";
import { users } from "@fwqgo/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const registerSchema = z
  .object({
    username: z
      .string()
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
      return Response.json({ error: "注册入口已关闭" }, { status: 403 });
    }

    const body = (await request.json()) as z.infer<typeof registerSchema>;
    const { username, password } = registerSchema.parse(body);

    // 检查用户名是否已存在
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (existingUser) {
      return Response.json({ error: "用户名已存在" }, { status: 400 });
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

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.issues[0]?.message },
        { status: 400 },
      );
    }

    return Response.json({ error: "注册失败，请重试" }, { status: 500 });
  }
}
