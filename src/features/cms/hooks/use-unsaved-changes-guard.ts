"use client";

import { useEffect, useRef } from "react";

type UnsavedChangesGuardOptions = {
  enabled: boolean;
  onNavigationAttempt: (href: string) => void;
};

function getInternalNavigationHref(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }

  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;

  const current = new URL(window.location.href);
  if (url.pathname === current.pathname && url.search === current.search) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function useUnsavedChangesGuard({
  enabled,
  onNavigationAttempt,
}: UnsavedChangesGuardOptions) {
  const navigationHandlerRef = useRef(onNavigationAttempt);
  const restoringHistoryRef = useRef(false);
  const pendingHistoryHrefRef = useRef<string | null>(null);

  useEffect(() => {
    navigationHandlerRef.current = onNavigationAttempt;
  }, [onNavigationAttempt]);

  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleDocumentClick = (event: MouseEvent) => {
      const href = getInternalNavigationHref(event);
      if (!href) return;

      event.preventDefault();
      event.stopPropagation();
      navigationHandlerRef.current(href);
    };
    const handlePopState = () => {
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        const pendingHref = pendingHistoryHrefRef.current;
        pendingHistoryHrefRef.current = null;
        if (pendingHref) navigationHandlerRef.current(pendingHref);
        return;
      }

      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      pendingHistoryHrefRef.current = href;
      restoringHistoryRef.current = true;
      window.history.forward();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [enabled]);
}
