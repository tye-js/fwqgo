import { db } from "@/server/db";
import { hash } from "bcryptjs";
import { z } from "zod";

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
    const body = (await request.json()) as z.infer<typeof registerSchema>;
    const { username, password } = registerSchema.parse(body);

    // 检查用户名是否已存在
    const existingUser = await db.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return Response.json({ error: "用户名已存在" }, { status: 400 });
    }

    // 密码加密
    const hashedPassword = await hash(password, 12);

    // 创建新用户
    await db.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.errors[0]?.message },
        { status: 400 },
      );
    }

    return Response.json(
      {
        error: "注册失败，请重试",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
