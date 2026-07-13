"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import React from "react";

type PublicLanguage = "zh" | "en";

type LanguageSwitchLinkProps = Omit<
  React.ComponentPropsWithoutRef<typeof Link>,
  "href"
> & {
  currentLanguage: PublicLanguage;
  fallbackHref?: string;
};

function toHref(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildFallbackHref(
  pathname: string,
  searchParams: URLSearchParams,
  targetLanguage: PublicLanguage,
) {
  const params = new URLSearchParams(searchParams.toString());

  if (pathname === "/search") {
    if (targetLanguage === "en") {
      params.set("lang", "en");
    } else {
      params.delete("lang");
    }
    return toHref("/search", params);
  }

  if (targetLanguage === "en") {
    if (pathname === "/") return toHref("/en", params);
    if (pathname === "/en" || pathname.startsWith("/en/")) {
      return toHref(pathname, params);
    }
    if (pathname.startsWith("/fwq/")) {
      return toHref(`/en${pathname}`, params);
    }
    return toHref(pathname, params);
  }

  if (pathname === "/en") return toHref("/", params);
  if (pathname.startsWith("/en/")) {
    return toHref(pathname.slice(3) || "/", params);
  }

  return toHref(pathname, params);
}

function toInternalHref(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function findAlternateHref(targetLanguage: PublicLanguage) {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate"]'),
  );
  const targetHrefLang = targetLanguage === "en" ? "en" : "zh";
  const match = links.find((link) => {
    const hrefLang = link.hreflang.toLowerCase();
    return targetLanguage === "en"
      ? hrefLang === targetHrefLang
      : hrefLang === targetHrefLang ||
          hrefLang.startsWith(`${targetHrefLang}-`);
  });

  return match?.href ? toInternalHref(match.href) : undefined;
}

function getLocationKey(pathname: string, searchParams: URLSearchParams) {
  return `${pathname}?${searchParams.toString()}`;
}

export const LanguageSwitchLink = React.forwardRef<
  HTMLAnchorElement,
  LanguageSwitchLinkProps
>(
  (
    { currentLanguage, fallbackHref, prefetch = true, children, ...props },
    ref,
  ) => {
    const pathname = usePathname() || "/";
    const searchParams = useSearchParams();
    const targetLanguage = currentLanguage === "en" ? "zh" : "en";
    const locationKey = getLocationKey(pathname, searchParams);
    const [alternate, setAlternate] = React.useState<{
      locationKey: string;
      href?: string;
    } | null>(null);

    const fallback = React.useMemo(() => {
      return (
        fallbackHref ??
        buildFallbackHref(pathname, searchParams, targetLanguage)
      );
    }, [fallbackHref, pathname, searchParams, targetLanguage]);

    React.useEffect(() => {
      setAlternate({
        locationKey,
        href: findAlternateHref(targetLanguage),
      });
    }, [locationKey, targetLanguage]);

    const alternateHref =
      alternate?.locationKey === locationKey ? alternate.href : undefined;

    return (
      <Link
        ref={ref}
        href={alternateHref ?? fallback}
        prefetch={prefetch}
        {...props}
      >
        {children}
      </Link>
    );
  },
);

LanguageSwitchLink.displayName = "LanguageSwitchLink";
