import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  username,
  setUsername,
  password,
  setPassword,
  handleLogin,
}: {
  username: string;
  setUsername: (username: string) => void;
  password: string;
  setPassword: (password: string) => void;
  handleLogin: () => void;
}) {
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="flex w-[340px] items-center justify-center text-2xl">
          登 录
        </CardTitle>
        <CardDescription>请在下方输入您的用户名登录您的账户</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              type="text"
              placeholder="tye"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="password">密码</Label>
              <Link href="#" className="ml-auto inline-block text-sm underline">
                忘记密码？
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" onClick={handleLogin}>
            Login
          </Button>
        </div>
        <div className="mt-4 text-center text-sm">
          还没有账号？{" "}
          <Link href="/signup" className="underline">
            注册
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
