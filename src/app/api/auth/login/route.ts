import { db } from "@/server/db";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { randomUUID } from "crypto";

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as z.infer<typeof loginSchema>;
    const { username, password } = loginSchema.parse(body);

    const user = await db.user.findUnique({
      where: { username },
    });

    if (!user)
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });

    const isValidPassword = await compare(password, user.password);

    if (!isValidPassword)
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });

    // 创建 session
    const session = await db.session.create({
      data: {
        userId: user.id,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天
        sessionToken: randomUUID(), // 添加随机生成的 sessionToken
      },
    });

    cookies().set("session_id", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: session.expires,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: "登录失败!!", message: error },
      { status: 500 },
    );
  }
}
