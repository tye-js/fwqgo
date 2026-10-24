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

type OutboundHrefRewriter = (affiliateUrl: string) => Promise<string | null>;

type OutboundLinkAttributes = { rel: string; target: string };

/**
 * 正文外链改写的共用骨架。
 *
 * 两种落地形态只在「最终写进 href 的值」上分叉：
 *
 * - short：写 `/go/{slug}`，点击时再 302 到目标（历史形态，存量文章仍在用）；
 * - native：直接把带推广参数的商家链接写进正文，不再经过站内跳转。
 *
 * 匹配供应商、解析返利参数、跳过已是 `/go/` 的链接，两条路径完全一致——所以
 * 切换形态不会把老文章的短链改回长链，老链接也不会失效。
 */
async function rewriteArticleOutboundLinks(
  html: string,
  database: OutboundLinkExecutor,
  rewriteHref: OutboundHrefRewriter,
  attributes: OutboundLinkAttributes,
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

    const nextHref = await rewriteHref(affiliateTargetUrl);
    if (!nextHref) {
      continue;
    }

    $link.attr("href", nextHref);
    $link.attr("rel", attributes.rel);
    $link.attr("target", attributes.target);
  }

  return $.html();
}

async function rewriteMarkdownOutboundLinks(
  markdown: string,
  database: OutboundLinkExecutor,
  rewriteHref: OutboundHrefRewriter,
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

    const nextHref = await rewriteHref(affiliateTargetUrl);
    if (!nextHref) {
      continue;
    }

    replacements.push({
      start: match.index,
      end: match.index + original.length,
      replacement: `[${label}](${nextHref})`,
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

/** 历史形态：把正文里的商家链接换成站内 `/go/{slug}` 短链。 */
export async function shortenArticleOutboundLinks(
  html: string,
  database: OutboundLinkExecutor = db,
) {
  return rewriteArticleOutboundLinks(
    html,
    database,
    async (affiliateUrl) =>
      (await getOrCreateOutboundShortLink(affiliateUrl, database))?.path ??
      null,
    { rel: "nofollow", target: "_blank" },
  );
}

/** 历史形态：markdown 正文版本的短链改写。 */
export async function shortenMarkdownOutboundLinks(
  markdown: string,
  database: OutboundLinkExecutor = db,
) {
  return rewriteMarkdownOutboundLinks(
    markdown,
    database,
    async (affiliateUrl) =>
      (await getOrCreateOutboundShortLink(affiliateUrl, database))?.path ??
      null,
  );
}

/**
 * 现行形态：正文直接写原生返利链接。
 *
 * 站内跳转对读者是多余的一跳，对 SEO 也没有收益（/go/ 本来就被 robots 屏蔽），
 * 而短链把「最终去哪」藏在了数据库里——排查链接失效时要多查一张表。改成原生
 * 链接后，正文里看到的就是商家真实地址，返利参数在保存时已经拼好。
 */
export async function applyArticleAffiliateLinks(
  html: string,
  database: OutboundLinkExecutor = db,
) {
  return rewriteArticleOutboundLinks(html, database, async (url) => url, {
    rel: "nofollow sponsored noopener noreferrer",
    target: "_blank",
  });
}

/** markdown 正文版本的原生返利链接改写。rel 由渲染器统一补。 */
export async function applyMarkdownAffiliateLinks(
  markdown: string,
  database: OutboundLinkExecutor = db,
) {
  return rewriteMarkdownOutboundLinks(markdown, database, async (url) => url);
}
