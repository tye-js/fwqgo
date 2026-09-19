export type PublicLanguage = "zh" | "en";

/**
 * Single source of truth for public contact channels. The footer, the article
 * webmaster statement, and every trust page read from here so the same address
 * and community links can never drift apart.
 */
export const SITE_CONTACT = {
  email: "contact@fwqgo.com",
  qqGroup: {
    label: "QQ群：601090215",
    shortLabel: "QQ 群",
    href: "https://qm.qq.com/q/WCugMBGEso",
  },
  telegram: {
    label: "Telegram",
    shortLabel: "Telegram",
    href: "https://t.me/+525xG6tzmbIyN2Fl",
  },
} as const;

/** Builds an obfuscated mailto link; scrapers that read plain `@` get nothing. */
export function mailtoHref(email: string = SITE_CONTACT.email) {
  const atIndex = email.indexOf("@");
  if (atIndex < 0) return `mailto:${encodeURIComponent(email)}`;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  return `mailto:${encodeURIComponent(localPart)}%40${encodeURIComponent(domain)}`;
}

/**
 * Trust pages exist at the root of each language tree. They are the pages a
 * quality rater looks for when deciding whether the site has a responsible
 * publisher behind it, so the slug list is a contract rather than a convenience.
 */
export const TRUST_PAGE_SLUGS = [
  "about",
  "contact",
  "privacy",
  "terms",
  "affiliate-disclosure",
] as const;

export type TrustPageSlug = (typeof TRUST_PAGE_SLUGS)[number];

export function trustPagePath(
  slug: TrustPageSlug,
  language: PublicLanguage,
): string {
  return `${language === "en" ? "/en" : ""}/${slug}`;
}

export function trustPageAlternates(slug: TrustPageSlug, baseUrl: string) {
  return {
    "zh-CN": `${baseUrl}/${slug}`,
    en: `${baseUrl}/en/${slug}`,
    "x-default": `${baseUrl}/${slug}`,
  };
}
