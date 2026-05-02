"use client";

import { Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function PostViewCount({
  slug,
  initialViews,
}: {
  slug: string;
  initialViews: number;
}) {
  const [views, setViews] = useState(initialViews);
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (hasTrackedRef.current) {
      return;
    }

    hasTrackedRef.current = true;

    let isActive = true;

    void fetch(`/api/posts/${encodeURIComponent(slug)}/view`, {
      method: "POST",
      cache: "no-store",
      keepalive: true,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as { counted?: boolean };
      })
      .then((result) => {
        if (isActive && result?.counted) {
          setViews((currentViews) => currentViews + 1);
        }
      })
      .catch(() => {
        // Ignore tracking failures so the page remains interactive.
      });

    return () => {
      isActive = false;
    };
  }, [slug]);

  return (
    <div className="hidden items-center gap-1 md:flex">
      <Eye className="size-4" />
      {views}次浏览
    </div>
  );
}
