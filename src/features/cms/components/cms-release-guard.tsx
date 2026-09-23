"use client";

import { useEffect, useRef } from "react";

type ReleaseResponse = {
  releaseId?: string;
};

/**
 * 兜底轮询间隔。
 *
 * 这个探测**每次都要做一次完整会话校验**（`requireAdminSession()` → `sessions JOIN users`），
 * 因为 `verify:security` 有一条硬约束：`api/cms/**` 下每个路由处理器都必须鉴权 ——
 * 报告里建议的「改成公开的静态 release.json」会破坏这条约束，所以没采纳。
 *
 * 既然单次成本降不下来，就降频率：从 1 分钟改成 5 分钟。
 * **用户真正会感知到的两条路径都没有变慢** —— `focus` 与 `visibilitychange`
 * 仍然是立即触发（切回标签页就检查）。5 分钟只是「标签页一直开着且没人动」时的兜底。
 */
const RELEASE_POLL_MS = 5 * 60_000;

export function CmsReleaseGuard({ releaseId }: { releaseId: string }) {
  const isReloading = useRef(false);
  const isChecking = useRef(false);

  useEffect(() => {
    let disposed = false;

    const checkRelease = async () => {
      if (disposed || isReloading.current || isChecking.current) return;
      isChecking.current = true;

      try {
        const response = await fetch("/api/cms/runtime/release", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (response.status === 401) {
          isReloading.current = true;
          window.location.replace("/api/auth/session-expired");
          return;
        }

        if (!response.ok) return;

        const result = (await response.json()) as ReleaseResponse;
        if (result.releaseId && result.releaseId !== releaseId) {
          isReloading.current = true;
          window.location.reload();
        }
      } catch {
        // A transient deploy/network gap should not interrupt the current page.
      } finally {
        isChecking.current = false;
      }
    };

    const checkVisibleRelease = () => {
      if (document.visibilityState === "visible") void checkRelease();
    };
    const checkFocusedRelease = () => {
      void checkRelease();
    };
    const checkScheduledRelease = () => {
      void checkRelease();
    };

    void checkRelease();
    window.addEventListener("focus", checkFocusedRelease);
    document.addEventListener("visibilitychange", checkVisibleRelease);
    const interval = window.setInterval(checkScheduledRelease, RELEASE_POLL_MS);

    return () => {
      disposed = true;
      window.removeEventListener("focus", checkFocusedRelease);
      document.removeEventListener("visibilitychange", checkVisibleRelease);
      window.clearInterval(interval);
    };
  }, [releaseId]);

  return null;
}
