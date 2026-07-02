import { db } from "@fwqgo/db";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { randomUUID } from "crypto";
import { users, sessions } from "@fwqgo/db/schema";
import { eq } from "drizzle-orm";

const loginSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
      return Response.json(
        { error: "请输入有效的用户名和密码" },
        { status: 400 },
      );
    }

    const { username, password } = body.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user)
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });

    const isValidPassword = await compare(password, user.password);

    if (!isValidPassword)
      return Response.json({ error: "用户名或密码错误" }, { status: 401 });

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
      return Response.json({ error: "登录失败" }, { status: 500 });
    }

    (await cookies()).set("session_id", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expires,
    });

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "登录失败" }, { status: 500 });
  }
}
