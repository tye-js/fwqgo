import * as cheerio from "cheerio";
import { eq } from "drizzle-orm";

import { db, readDb } from "@fwqgo/db";
import { outboundLinks } from "@fwqgo/db/schema";

const siteBaseUrl = "https://fwqgo.com";
const slugAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

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

function isShortLink(url: URL) {
  return isInternalUrl(url) && /^\/go\/[a-z0-9-]+$/i.test(url.pathname);
}

export async function getOrCreateOutboundShortLink(targetUrl: string) {
  const normalizedTargetUrl = normalizeTargetUrl(targetUrl);

  if (!normalizedTargetUrl) {
    return null;
  }

  const [existing] = await db
    .select({ slug: outboundLinks.slug })
    .from(outboundLinks)
    .where(eq(outboundLinks.targetUrl, normalizedTargetUrl))
    .limit(1);

  if (existing) {
    return {
      slug: existing.slug,
      path: `/go/${existing.slug}`,
      targetUrl: normalizedTargetUrl,
    };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seed = Date.now() + Math.floor(Math.random() * 1_000_000) + attempt;
    const slug = makeSlug(seed).slice(-6);

    try {
      const [created] = await db
        .insert(outboundLinks)
        .values({ slug, targetUrl: normalizedTargetUrl })
        .returning({ slug: outboundLinks.slug });

      if (!created) {
        continue;
      }

      return {
        slug: created.slug,
        path: `/go/${created.slug}`,
        targetUrl: normalizedTargetUrl,
      };
    } catch {
      const [raceExisting] = await db
        .select({ slug: outboundLinks.slug })
        .from(outboundLinks)
        .where(eq(outboundLinks.targetUrl, normalizedTargetUrl))
        .limit(1);

      if (raceExisting) {
        return {
          slug: raceExisting.slug,
          path: `/go/${raceExisting.slug}`,
          targetUrl: normalizedTargetUrl,
        };
      }
    }
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

  return link?.targetUrl ?? null;
}

function isInternalUrl(url: URL) {
  const siteHost = new URL(siteBaseUrl).hostname.replace(/^www\./, "");
  const targetHost = url.hostname.replace(/^www\./, "");

  return targetHost === siteHost || targetHost.endsWith(`.${siteHost}`);
}

export async function shortenArticleOutboundLinks(html: string) {
  const $ = cheerio.load(html, null, false);
  const links = $("a[href]").toArray();

  for (const element of links) {
    const $link = $(element);
    const href = $link.attr("href");

    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    let url: URL;
    try {
      url = new URL(href, siteBaseUrl);
    } catch {
      continue;
    }

    if (
      !["http:", "https:"].includes(url.protocol) ||
      isShortLink(url) ||
      isInternalUrl(url)
    ) {
      continue;
    }

    const shortLink = await getOrCreateOutboundShortLink(url.toString());
    if (!shortLink) {
      continue;
    }

    $link.attr("href", shortLink.path);
    $link.attr("rel", "nofollow sponsored noopener");
    $link.attr("target", "_blank");
  }

  return $.html();
}
