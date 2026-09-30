"use client";

import Link from "@/features/public/components/public-link";
import { usePathname } from "next/navigation";
import React from "react";

import {
  buildLanguageSwitchFallbackHref,
  type PublicLanguage,
} from "@/features/public/lib/language-switch-href";

type LanguageSwitchLinkProps = Omit<
  React.ComponentPropsWithoutRef<typeof Link>,
  "href"
> & {
  currentLanguage: PublicLanguage;
  fallbackHref?: string;
};

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

export const LanguageSwitchLink = React.forwardRef<
  HTMLAnchorElement,
  LanguageSwitchLinkProps
>(
  (
    { currentLanguage, fallbackHref, prefetch = true, children, ...props },
    ref,
  ) => {
    const pathname = usePathname() || "/";
    const targetLanguage = currentLanguage === "en" ? "zh" : "en";
    const [alternate, setAlternate] = React.useState<{
      pathname: string;
      href?: string;
    } | null>(null);

    const fallback = React.useMemo(() => {
      return (
        fallbackHref ??
        buildLanguageSwitchFallbackHref(
          pathname,
          new URLSearchParams(),
          targetLanguage,
        )
      );
    }, [fallbackHref, pathname, targetLanguage]);

    React.useEffect(() => {
      const searchParams = new URLSearchParams(window.location.search);
      setAlternate({
        pathname,
        href:
          findAlternateHref(targetLanguage) ??
          (fallbackHref ??
            buildLanguageSwitchFallbackHref(
              pathname,
              searchParams,
              targetLanguage,
            )),
      });
    }, [fallbackHref, pathname, targetLanguage]);

    const alternateHref =
      alternate?.pathname === pathname ? alternate.href : undefined;

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
