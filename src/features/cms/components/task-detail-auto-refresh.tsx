"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export function TaskDetailAutoRefresh({
  enabled,
  intervalMs = 2_500,
}: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [refreshPending, startRefresh] = useTransition();

  useEffect(() => {
    if (!enabled || refreshPending) return;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        startRefresh(() => router.refresh());
      }
    };
    const interval = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, intervalMs, router, refreshPending, startRefresh]);

  return null;
}
