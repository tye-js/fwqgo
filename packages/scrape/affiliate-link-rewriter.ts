import type * as cheerio from "cheerio";
import { inArray } from "drizzle-orm";

import { db } from "@fwqgo/db";
import { affServiceProviders } from "@fwqgo/db/schema";

export type AffiliateRewriteMatch = {
  originalHref: string;
  resolvedHref: string;
  finalHref: string;
  matchedDomain: string;
  providerName: string;
  mode: "param" | "replace";
};

export type AffiliateRewriteMiss = {
  href: string;
  host: string | null;
  reason: "invalid-url" | "internal" | "no-provider";
};

export type AffiliateRewriteReport = {
  totalLinks: number;
  internalLinksRemoved: number;
  matchedLinks: AffiliateRewriteMatch[];
  unmatchedLinks: AffiliateRewriteMiss[];
  invalidLinks: AffiliateRewriteMiss[];
};

type Provider = typeof affServiceProviders.$inferSelect;

function emptyReport(): AffiliateRewriteReport {
  return {
    totalLinks: 0,
    internalLinksRemoved: 0,
    matchedLinks: [],
    unmatchedLinks: [],
    invalidLinks: [],
  };
}

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function candidateDomains(hostname: string) {
  const normalizedHost = normalizeHost(hostname);
  const parts = normalizedHost.split(".");

  return parts
    .map((_, index) => parts.slice(index).join("."))
    .filter((domain) => domain.includes("."));
}

function normalizeProviderDomain(value: string) {
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return normalizeHost(
      value.replace(/^https?:\/\//, "").split("/")[0] ?? value,
    );
  }
}

function isGenericMarkdownLinkLabel(label: string) {
  return [
    "链接",
    "点击链接",
    "点击这里",
    "查看详情",
    "点此查看",
    "link",
    "here",
    "click here",
    "learn more",
  ].includes(
    label.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase(),
  );
}

async function loadProvidersForHosts(hostnames: string[]) {
  const domains = [
    ...new Set(hostnames.flatMap((hostname) => candidateDomains(hostname))),
  ];

  if (domains.length === 0) {
    return new Map<string, Provider>();
  }

  const rows = await db
    .select()
    .from(affServiceProviders)
    .where(inArray(affServiceProviders.officialUrl, domains));

  const providerByDomain = new Map<string, Provider>();
  for (const provider of rows) {
    providerByDomain.set(
      normalizeProviderDomain(provider.officialUrl),
      provider,
    );
  }

  return providerByDomain;
}

function findProvider(
  providerByDomain: Map<string, Provider>,
  hostname: string,
) {
  for (const domain of candidateDomains(hostname)) {
    const provider = providerByDomain.get(domain);
    if (provider) {
      return { provider, matchedDomain: domain };
    }
  }

  return null;
}

function rewriteHref(href: string, provider: Provider) {
  if (provider.affParam === "href") {
    return { href: provider.affUrl, mode: "replace" as const };
  }

  const url = new URL(href);
  url.searchParams.set(provider.affParam, provider.affValue);
  return { href: url.toString(), mode: "param" as const };
}

function isLikelyAffiliateRedirectPath(pathname: string) {
  return /\/(go|out|goto|link|links|redirect|refer|recommend|aff)(\/|$)/i.test(
    pathname,
  );
}

function uniqueHosts(hostnames: string[]) {
  return [...new Set(hostnames.map(normalizeHost))];
}

function selectArticleProvider(
  providerByDomain: Map<string, Provider>,
  hostnames: string[],
) {
  for (const hostname of uniqueHosts(hostnames)) {
    const match = findProvider(providerByDomain, hostname);
    if (match) {
      return match;
    }
  }

  return null;
}

export async function rewriteAffiliateLinks(input: {
  $: cheerio.CheerioAPI;
  selector?: string;
  baseUrl: string;
  sourceHost: string;
  removeInternal?: boolean;
  resolveHref?: (href: string) => Promise<string>;
}) {
  const selector = input.selector ?? "a";
  const report = emptyReport();
  const sourceHost = normalizeHost(input.sourceHost);
  const elements = input.$(selector).toArray();
  const links: Array<{
    element: (typeof elements)[number];
    href: string;
    finalUrl: URL;
    isInternal: boolean;
  }> = [];

  for (const element of elements) {
    const $link = input.$(element);
    const href = $link.attr("href");

    if (!href) continue;
    report.totalLinks += 1;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(href, input.baseUrl);
    } catch {
      report.invalidLinks.push({ href, host: null, reason: "invalid-url" });
      continue;
    }

    let finalHref = parsedUrl.toString();
    if (input.resolveHref) {
      finalHref = await input.resolveHref(finalHref);
    }

    let finalUrl: URL;
    try {
      finalUrl = new URL(finalHref);
    } catch {
      report.invalidLinks.push({
        href: finalHref,
        host: null,
        reason: "invalid-url",
      });
      continue;
    }

    const finalHost = normalizeHost(finalUrl.hostname);
    links.push({
      element,
      href,
      finalUrl,
      isInternal:
        finalHost === sourceHost || finalHost.endsWith(`.${sourceHost}`),
    });
  }

  const providerByDomain = await loadProvidersForHosts(
    links
      .filter((link) => !link.isInternal)
      .map((link) => link.finalUrl.hostname),
  );
  const articleProvider = selectArticleProvider(
    providerByDomain,
    links
      .filter((link) => !link.isInternal)
      .map((link) => link.finalUrl.hostname),
  );

  for (const link of links) {
    const $link = input.$(link.element);

    if (link.isInternal) {
      if (isLikelyAffiliateRedirectPath(link.finalUrl.pathname)) {
        $link.attr("href", link.finalUrl.toString());
        continue;
      }

      report.internalLinksRemoved += 1;
      if (input.removeInternal) {
        $link.remove();
      } else {
        $link.replaceWith($link.text());
      }
      continue;
    }

    if (!articleProvider) {
      report.unmatchedLinks.push({
        href: link.finalUrl.toString(),
        host: normalizeHost(link.finalUrl.hostname),
        reason: "no-provider",
      });
      $link.attr("href", link.finalUrl.toString());
      continue;
    }

    const match = findProvider(providerByDomain, link.finalUrl.hostname);
    if (match?.provider.id !== articleProvider.provider.id) {
      report.unmatchedLinks.push({
        href: link.finalUrl.toString(),
        host: normalizeHost(link.finalUrl.hostname),
        reason: "no-provider",
      });
      $link.attr("href", link.finalUrl.toString());
      continue;
    }

    const rewritten = rewriteHref(
      link.finalUrl.toString(),
      articleProvider.provider,
    );
    $link.attr("href", rewritten.href);
    report.matchedLinks.push({
      originalHref: link.href,
      resolvedHref: link.finalUrl.toString(),
      finalHref: rewritten.href,
      matchedDomain: articleProvider.matchedDomain,
      providerName: articleProvider.provider.name,
      mode: rewritten.mode,
    });
  }

  return report;
}

export function mergeAffiliateReports(
  reports: AffiliateRewriteReport[],
): AffiliateRewriteReport {
  return reports.reduce(
    (merged, report) => ({
      totalLinks: merged.totalLinks + report.totalLinks,
      internalLinksRemoved:
        merged.internalLinksRemoved + report.internalLinksRemoved,
      matchedLinks: [...merged.matchedLinks, ...report.matchedLinks],
      unmatchedLinks: [...merged.unmatchedLinks, ...report.unmatchedLinks],
      invalidLinks: [...merged.invalidLinks, ...report.invalidLinks],
    }),
    emptyReport(),
  );
}

function tryNormalizeUrlHost(value: string) {
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return null;
  }
}

function normalizeAbsoluteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(
      trimmed.startsWith("//") ? `https:${trimmed}` : trimmed,
    );
    const sortedParams = Array.from(url.searchParams.entries()).sort(
      ([keyA, valueA], [keyB, valueB]) =>
        keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB),
    );
    const search = sortedParams.length
      ? `?${new URLSearchParams(sortedParams).toString()}`
      : "";
    const port = url.port ? `:${url.port}` : "";

    return `${url.protocol}//${normalizeHost(url.hostname)}${port}${url.pathname}${search}${url.hash}`;
  } catch {
    return null;
  }
}

function markdownLinkMatchesReportHref(
  markdownHref: string,
  matched: AffiliateRewriteMatch,
) {
  const normalizedHref = normalizeAbsoluteUrl(markdownHref);
  if (!normalizedHref) {
    return false;
  }

  return [matched.originalHref, matched.resolvedHref, matched.finalHref]
    .map(normalizeAbsoluteUrl)
    .some((candidate) => candidate === normalizedHref);
}

function markdownLinkMatchesReportHost(
  host: string,
  matched: AffiliateRewriteMatch,
) {
  const domains = [
    matched.matchedDomain,
    tryNormalizeUrlHost(matched.resolvedHref),
    tryNormalizeUrlHost(matched.finalHref),
  ].filter((domain): domain is string => Boolean(domain));

  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function uniqueFinalHrefMatches(matches: AffiliateRewriteMatch[]) {
  const byFinalHref = new Map<string, AffiliateRewriteMatch>();
  for (const match of matches) {
    byFinalHref.set(
      normalizeAbsoluteUrl(match.finalHref) ?? match.finalHref,
      match,
    );
  }

  return [...byFinalHref.values()];
}

function findMarkdownAffiliateMatch(
  href: string,
  host: string,
  report: AffiliateRewriteReport,
) {
  const exactMatch = report.matchedLinks.find((item) =>
    markdownLinkMatchesReportHref(href, item),
  );
  if (exactMatch) {
    return exactMatch;
  }

  const hostMatches = uniqueFinalHrefMatches(
    report.matchedLinks.filter((item) =>
      markdownLinkMatchesReportHost(host, item),
    ),
  );

  return hostMatches.length === 1 ? hostMatches[0] : null;
}

export function repairMarkdownAffiliateLinks(
  markdown: string,
  report: AffiliateRewriteReport,
) {
  if (report.matchedLinks.length === 0 || !markdown.trim()) {
    return markdown;
  }

  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  const repaired = markdown.replace(
    linkPattern,
    (original: string, label: string, href: string) => {
      if (!label || !href) {
        return original;
      }

      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return original;
      }

      const host = normalizeHost(url.hostname);
      const matched = findMarkdownAffiliateMatch(href, host, report);
      if (!matched) {
        return original;
      }

      return `[${
        isGenericMarkdownLinkLabel(label) ? matched.providerName : label
      }](${matched.finalHref})`;
    },
  );

  return repaired.trim();
}
