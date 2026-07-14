"use client";

import { useEffect, useRef } from "react";

type ReleaseResponse = {
  releaseId?: string;
};

export function CmsReleaseGuard({ releaseId }: { releaseId: string }) {
  const isReloading = useRef(false);

  useEffect(() => {
    let disposed = false;

    const checkRelease = async () => {
      if (disposed || isReloading.current) return;

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
    const interval = window.setInterval(checkScheduledRelease, 60_000);

    return () => {
      disposed = true;
      window.removeEventListener("focus", checkFocusedRelease);
      document.removeEventListener("visibilitychange", checkVisibleRelease);
      window.clearInterval(interval);
    };
  }, [releaseId]);

  return null;
}
