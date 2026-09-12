import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";

import { db, readDb } from "@fwqgo/db";
import { affServiceProviders, outboundLinks } from "@fwqgo/db/schema";
import {
  hasCompleteArticleAffiliateConfig,
  resolveArticleAffiliateUrl,
} from "@fwqgo/core/affiliate-provider";

const siteBaseUrl = "https://fwqgo.com";
const slugAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const markdownLinkPattern =
  /\[([^\]]+)\]\((<([^>]+)>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
export type OutboundLinkExecutor = Pick<typeof db, "select" | "insert">;
type AffiliateProvider = typeof affServiceProviders.$inferSelect;
let providerCache: Promise<
  Array<typeof affServiceProviders.$inferSelect>
> | null = null;

export function clearOutboundAffiliateProviderCache() {
  providerCache = null;
}

function getAffiliateProviders(database: OutboundLinkExecutor = db) {
  if (database !== db) {
    return database
      .select()
      .from(affServiceProviders)
      .then((providers) => providers.filter(hasCompleteArticleAffiliateConfig));
  }
  if (!providerCache) {
    const request = db
      .select()
      .from(affServiceProviders)
      .then((providers) => providers.filter(hasCompleteArticleAffiliateConfig));
    providerCache = request;
    void request.catch(() => {
      if (providerCache === request) {
        providerCache = null;
      }
    });
  }

  return providerCache;
}

function makeSlug(seed: number) {
  let value = seed;
  let slug = "";

  do {
    slug = slugAlphabet[value % slugAlphabet.length] + slug;
    value = Math.floor(value / slugAlphabet.length);
  } while (value > 0);

  return slug.padStart(4, "a");
}

function normalizeTargetUrl(targetUrl: string) {
  const url = new URL(targetUrl, siteBaseUrl);

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  return url.toString();
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

function getAffiliateTargetUrl(url: URL, providers: AffiliateProvider[]) {
  const targetHost = normalizeHost(url.hostname);
  const matchedProvider = providers.find((provider) => {
    const officialDomain = normalizeProviderDomain(provider.officialUrl);
    const affDomain = normalizeProviderDomain(provider.affUrl);

    return (
      candidateDomains(targetHost).includes(officialDomain) ||
      targetHost === affDomain ||
      targetHost.endsWith(`.${affDomain}`)
    );
  });

  if (!matchedProvider) {
    return null;
  }

  return (
    resolveArticleAffiliateUrl({
      rawUrl: url.toString(),
      affiliate: matchedProvider,
    })?.url ?? null
  );
}

function isShortLink(url: URL) {
  return isInternalUrl(url) && /^\/go\/[a-z0-9-]+$/i.test(url.pathname);
}

type OutboundShortLinkRecord = {
  id: number;
  slug: string;
};

function formatOutboundShortLink(
  record: OutboundShortLinkRecord,
  targetUrl: string,
) {
  return {
    id: record.id,
    slug: record.slug,
    path: `/go/${record.slug}`,
    targetUrl,
  };
}

async function findOutboundShortLink(
  targetUrl: string,
  database: OutboundLinkExecutor,
) {
  const [existing] = await database
    .select({ id: outboundLinks.id, slug: outboundLinks.slug })
    .from(outboundLinks)
    .where(eq(outboundLinks.targetUrl, targetUrl))
    .limit(1);

  return existing;
}

export async function getOrCreateOutboundShortLink(
  targetUrl: string,
  database: OutboundLinkExecutor = db,
) {
  const normalizedTargetUrl = normalizeTargetUrl(targetUrl);

  if (!normalizedTargetUrl) {
    return null;
  }

  const existing = await findOutboundShortLink(normalizedTargetUrl, database);

  if (existing) {
    return formatOutboundShortLink(existing, normalizedTargetUrl);
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seed = Date.now() + Math.floor(Math.random() * 1_000_000) + attempt;
    const slug = makeSlug(seed).slice(-6);

    const [created] = await database
      .insert(outboundLinks)
      .values({ slug, targetUrl: normalizedTargetUrl })
      .onConflictDoNothing()
      .returning({ id: outboundLinks.id, slug: outboundLinks.slug });

    if (!created) {
      const existingAfterConflict = await findOutboundShortLink(
        normalizedTargetUrl,
        database,
      );
      if (existingAfterConflict) {
        return formatOutboundShortLink(
          existingAfterConflict,
          normalizedTargetUrl,
        );
      }
      continue;
    }

    return formatOutboundShortLink(created, normalizedTargetUrl);
  }

  throw new Error("短链生成失败");
}

export async function readOutboundShortTarget(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(normalizedSlug)) {
    return null;
  }

  const [link] = await readDb
    .select({ targetUrl: outboundLinks.targetUrl })
    .from(outboundLinks)
    .where(eq(outboundLinks.slug, normalizedSlug))
    .limit(1);

  if (!link?.targetUrl) {
    return null;
  }

  return normalizeTargetUrl(link.targetUrl);
}

function isInternalUrl(url: URL) {
  const siteHost = new URL(siteBaseUrl).hostname.replace(/^www\./, "");
  const targetHost = url.hostname.replace(/^www\./, "");

  return targetHost === siteHost || targetHost.endsWith(`.${siteHost}`);
}

export async function shortenArticleOutboundLinks(
  html: string,
  database: OutboundLinkExecutor = db,
) {
  const $ = cheerio.load(html, null, false);
  const links = $("a[href]").toArray();
  let providers: AffiliateProvider[] | undefined;

  for (const element of links) {
    const $link = $(element);
    const href = $link.attr("href");

    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(href, siteBaseUrl);
    } catch {
      continue;
    }

    if (!["http:", "https:"].includes(url.protocol) || isShortLink(url)) {
      continue;
    }

    providers ??= await getAffiliateProviders(database);
    const affiliateTargetUrl = getAffiliateTargetUrl(url, providers);
    if (!affiliateTargetUrl) {
      continue;
    }

    const shortLink = await getOrCreateOutboundShortLink(
      affiliateTargetUrl,
      database,
    );
    if (!shortLink) {
      continue;
    }

    $link.attr("href", shortLink.path);
    $link.attr("rel", "nofollow");
    $link.attr("target", "_blank");
  }

  return $.html();
}

export async function shortenMarkdownOutboundLinks(
  markdown: string,
  database: OutboundLinkExecutor = db,
) {
  let providers: AffiliateProvider[] | undefined;
  const replacements: Array<{
    start: number;
    end: number;
    replacement: string;
  }> = [];

  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const [original, label, rawHref, angledHref] = match;
    const href = angledHref ?? rawHref;
    if (
      typeof match.index !== "number" ||
      !label ||
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(href, siteBaseUrl);
    } catch {
      continue;
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      continue;
    }

    if (isShortLink(url)) {
      continue;
    }

    providers ??= await getAffiliateProviders(database);
    const affiliateTargetUrl = getAffiliateTargetUrl(url, providers);
    if (!affiliateTargetUrl) {
      continue;
    }

    const shortLink = await getOrCreateOutboundShortLink(
      affiliateTargetUrl,
      database,
    );
    if (!shortLink) {
      continue;
    }

    replacements.push({
      start: match.index,
      end: match.index + original.length,
      replacement: `[${label}](${shortLink.path})`,
    });
  }

  if (replacements.length === 0) {
    return markdown;
  }

  let output = "";
  let lastIndex = 0;
  for (const item of replacements) {
    output += markdown.slice(lastIndex, item.start);
    output += item.replacement;
    lastIndex = item.end;
  }

  output += markdown.slice(lastIndex);
  return output;
}
