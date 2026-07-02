"use client";

import { LoginForm } from "@/features/cms/components/login-form";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setIsPending(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }

      const result = (await res.json()) as { error?: string };
      setError(result.error ?? "登录失败，请检查用户名和密码。");
    } catch {
      setError("登录暂时不可用，请稍后重试。");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="cms-theme editorial-surface flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10">
      <LoginForm
        handleLogin={handleLogin}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        error={error}
        isPending={isPending}
      />
    </div>
  );
}
