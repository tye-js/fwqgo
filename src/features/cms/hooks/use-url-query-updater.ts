"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type QueryValue = string | number | boolean | null | undefined;

export function useUrlQueryUpdater(pageParam = "pageNo") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (
      updates: Record<string, QueryValue>,
      options: { resetPage?: boolean; scroll?: boolean } = {},
    ) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        const normalizedValue =
          typeof value === "string" ? value.trim() : String(value ?? "").trim();

        if (!normalizedValue) {
          params.delete(key);
        } else {
          params.set(key, normalizedValue);
        }
      }

      if (options.resetPage ?? true) {
        params.delete(pageParam);
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: options.scroll ?? false,
      });
    },
    [pageParam, pathname, router, searchParams],
  );
}
