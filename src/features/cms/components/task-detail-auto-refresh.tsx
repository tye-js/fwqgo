"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TaskDetailAutoRefresh({
  enabled,
  intervalMs = 2_500,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const interval = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, intervalMs, router]);

  return null;
}
