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
  const renderedSlugRef = useRef(slug);
  const trackedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    if (renderedSlugRef.current !== slug) {
      renderedSlugRef.current = slug;
      setViews(initialViews);
    }

    if (trackedSlugRef.current === slug) {
      return;
    }

    trackedSlugRef.current = slug;

    const viewUrl = `/api/posts/${encodeURIComponent(slug)}/view`;
    const beaconPayload = new Blob([], { type: "application/json" });
    if (navigator.sendBeacon?.(viewUrl, beaconPayload)) {
      return;
    }

    void fetch(viewUrl, {
      method: "POST",
      keepalive: true,
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as { counted?: boolean };
      })
      .then((result) => {
        if (trackedSlugRef.current === slug && result?.counted) {
          setViews((currentViews) => currentViews + 1);
        }
      })
      .catch(() => {
        // Ignore tracking failures so the page remains interactive.
      });
  }, [initialViews, slug]);

  return (
    <div className="flex min-h-11 items-center gap-1">
      <Eye className="size-4" />
      {views}次浏览
    </div>
  );
}
