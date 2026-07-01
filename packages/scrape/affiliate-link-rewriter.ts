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
    return normalizeHost(value.replace(/^https?:\/\//, "").split("/")[0] ?? value);
  }
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
    providerByDomain.set(normalizeProviderDomain(provider.officialUrl), provider);
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

function collectAbsoluteHosts(
  $: cheerio.CheerioAPI,
  selector: string,
  baseUrl: string,
) {
  const hosts: string[] = [];

  for (const element of $(selector).toArray()) {
    const href = $(element).attr("href");
    if (!href) continue;

    try {
      hosts.push(new URL(href, baseUrl).hostname);
    } catch {
      continue;
    }
  }

  return [...new Set(hosts.map(normalizeHost))];
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
  const providerByDomain = await loadProvidersForHosts(
    collectAbsoluteHosts(input.$, selector, input.baseUrl),
  );
  const sourceHost = normalizeHost(input.sourceHost);

  for (const element of input.$(selector).toArray()) {
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
    if (finalHost === sourceHost || finalHost.endsWith(`.${sourceHost}`)) {
      report.internalLinksRemoved += 1;
      if (input.removeInternal) {
        $link.remove();
      } else {
        $link.replaceWith($link.text());
      }
      continue;
    }

    const loadedProvider = findProvider(providerByDomain, finalUrl.hostname);
    if (!loadedProvider) {
      const finalProviderByDomain = await loadProvidersForHosts([finalUrl.hostname]);
      for (const [domain, provider] of finalProviderByDomain) {
        providerByDomain.set(domain, provider);
      }
    }

    const match = findProvider(providerByDomain, finalUrl.hostname);
    if (!match) {
      report.unmatchedLinks.push({
        href: finalUrl.toString(),
        host: normalizeHost(finalUrl.hostname),
        reason: "no-provider",
      });
      $link.attr("href", finalUrl.toString());
      continue;
    }

    const rewritten = rewriteHref(finalUrl.toString(), match.provider);
    $link.attr("href", rewritten.href);
    report.matchedLinks.push({
      originalHref: href,
      resolvedHref: finalUrl.toString(),
      finalHref: rewritten.href,
      matchedDomain: match.matchedDomain,
      providerName: match.provider.name,
      mode: rewritten.mode,
    });
  }

  return report;
}

export function mergeAffiliateReports(
  reports: AffiliateRewriteReport[],
): AffiliateRewriteReport {
  return reports.reduce((merged, report) => ({
    totalLinks: merged.totalLinks + report.totalLinks,
    internalLinksRemoved:
      merged.internalLinksRemoved + report.internalLinksRemoved,
    matchedLinks: [...merged.matchedLinks, ...report.matchedLinks],
    unmatchedLinks: [...merged.unmatchedLinks, ...report.unmatchedLinks],
    invalidLinks: [...merged.invalidLinks, ...report.invalidLinks],
  }), emptyReport());
}
