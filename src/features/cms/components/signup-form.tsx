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

export function SignupForm() {
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="flex w-[340px] items-center justify-center text-2xl">
          注 册
        </CardTitle>
        <CardDescription>
          请在下方输入您的用户名和密码注册您的账户
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="tye"
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="password">密码</Label>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="confirmPassword">确认密码</Label>
            </div>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            注册
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          已经有账号？{" "}
          <Link href="/login" className="underline">
            登录
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
