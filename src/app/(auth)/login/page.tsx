"use client";

import { LoginForm } from "@/app/_components/login-form";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      router.push("/");
    }

    const result = await res.json();
    if (result.error) {
      console.log(result.error);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <LoginForm
        handleLogin={handleLogin}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
      />
    </div>
  );
}
