import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { and, desc, eq, inArray } from "drizzle-orm";

import { enqueueAiRewriteTask } from "@fwqgo/ai/rewrite-task-runner";
import { db } from "@fwqgo/db";
import { aiRewriteTasks, sourceMaterials } from "@fwqgo/db/schema";

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

type DiscoveredSourceUrl = {
  url: string;
  publishedAt: Date | null;
  order: number;
};

const MAX_CHILD_SITEMAPS = 8;
const FETCH_TIMEOUT_MS = 15_000;

export type SourceSitePullInput = {
  siteUrl: string;
  feedUrl?: string | null;
  categoryId: number;
  rewriteStyleId?: number | null;
  limit: number;
};

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: browserHeaders,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`抓取失败 ${response.status}: ${url}`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`抓取超时：${url}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeUrl(href: string, baseUrl: string) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseSourceDate(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortDiscoveredUrls(items: DiscoveredSourceUrl[]) {
  return items.sort((left, right) => {
    if (left.publishedAt && right.publishedAt) {
      return right.publishedAt.getTime() - left.publishedAt.getTime();
    }

    if (left.publishedAt) return -1;
    if (right.publishedAt) return 1;

    return left.order - right.order;
  });
}

function dedupeDiscoveredUrls(items: DiscoveredSourceUrl[]) {
  const byUrl = new Map<string, DiscoveredSourceUrl>();

  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing) {
      byUrl.set(item.url, item);
      continue;
    }

    if (
      item.publishedAt &&
      (!existing.publishedAt || item.publishedAt > existing.publishedAt)
    ) {
      byUrl.set(item.url, { ...item, order: existing.order });
    }
  }

  return [...byUrl.values()];
}

function childText(
  $: cheerio.CheerioAPI,
  element: Element,
  selector: string,
) {
  return $(element).children(selector).first().text().trim();
}

async function discoverFromXmlEntries(
  url: string,
  siteUrl: string,
  depth = 0,
): Promise<DiscoveredSourceUrl[]> {
  const xml = await fetchText(url);
  const $ = cheerio.load(xml, { xmlMode: true });
  const sitemapEntries = $("sitemap")
    .toArray()
    .map((element, index) => ({
      url: normalizeUrl(childText($, element, "loc"), siteUrl),
      publishedAt: parseSourceDate(childText($, element, "lastmod")),
      order: index,
    }))
    .filter((item): item is DiscoveredSourceUrl => Boolean(item.url));

  if (sitemapEntries.length > 0 && depth < 1) {
    const childEntries: DiscoveredSourceUrl[] = [];

    for (const sitemap of sortDiscoveredUrls(sitemapEntries).slice(
      0,
      MAX_CHILD_SITEMAPS,
    )) {
      try {
        childEntries.push(
          ...(await discoverFromXmlEntries(sitemap.url, siteUrl, depth + 1)),
        );
      } catch {
        // Keep trying other child sitemaps when one sitemap is unavailable.
      }
    }

    return sortDiscoveredUrls(dedupeDiscoveredUrls(childEntries));
  }

  const sitemapUrls = $("url")
    .toArray()
    .map((element, index) => ({
      url: normalizeUrl(childText($, element, "loc"), siteUrl),
      publishedAt: parseSourceDate(childText($, element, "lastmod")),
      order: index,
    }))
    .filter((item): item is DiscoveredSourceUrl => Boolean(item.url));

  if (sitemapUrls.length > 0) {
    return sortDiscoveredUrls(dedupeDiscoveredUrls(sitemapUrls));
  }

  const rssItems = $("item")
    .toArray()
    .map((element, index) => ({
      url: normalizeUrl(childText($, element, "link"), siteUrl),
      publishedAt: parseSourceDate(
        childText($, element, "pubDate") ||
          childText($, element, "published") ||
          childText($, element, "updated") ||
          childText($, element, "date"),
      ),
      order: index,
    }))
    .filter((item): item is DiscoveredSourceUrl => Boolean(item.url));

  const atomEntries = $("entry")
    .toArray()
    .map((element, index) => {
      const href =
        $(element).children("link[rel='alternate']").first().attr("href") ??
        $(element).children("link").first().attr("href") ??
        childText($, element, "link");

      return {
        url: normalizeUrl(href, siteUrl),
        publishedAt: parseSourceDate(
          childText($, element, "published") || childText($, element, "updated"),
        ),
        order: rssItems.length + index,
      };
    })
    .filter((item): item is DiscoveredSourceUrl => Boolean(item.url));

  return sortDiscoveredUrls(dedupeDiscoveredUrls([...rssItems, ...atomEntries]));
}

async function discoverFromXml(url: string, siteUrl: string) {
  return (await discoverFromXmlEntries(url, siteUrl)).map((item) => item.url);
}

async function discoverFromHomeEntries(siteUrl: string) {
  const html = await fetchText(siteUrl);
  const baseHost = new URL(siteUrl).hostname.replace(/^www\./, "");
  const $ = cheerio.load(html);

  const entries = $("a[href]")
    .toArray()
    .map((element, index) => {
      const url = normalizeUrl($(element).attr("href") ?? "", siteUrl);
      if (!url) return null;

      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      const publishedAt = parseSourceDate(
        $(element).closest("article, li, .post, .entry").find("time[datetime]").first().attr("datetime") ??
          $(element).closest("article, li, .post, .entry").find("time").first().text(),
      );

      if (
        host !== baseHost ||
        /\.(jpg|jpeg|png|gif|webp|zip|pdf|rar|7z)$/i.exec(parsed.pathname) ||
        parsed.pathname === "/"
      ) {
        return null;
      }

      return {
        url,
        publishedAt,
        order: index,
      };
    })
    .filter((item): item is DiscoveredSourceUrl => Boolean(item));

  return sortDiscoveredUrls(dedupeDiscoveredUrls(entries));
}

async function discoverFromHome(siteUrl: string) {
  return (await discoverFromHomeEntries(siteUrl)).map((item) => item.url);
}

export async function discoverSourceSiteUrls(input: {
  siteUrl: string;
  feedUrl?: string | null;
}) {
  const candidates = input.feedUrl
    ? [input.feedUrl]
    : [
        new URL("/sitemap.xml", input.siteUrl).toString(),
        new URL("/feed", input.siteUrl).toString(),
        new URL("/feed.xml", input.siteUrl).toString(),
        new URL("/rss.xml", input.siteUrl).toString(),
      ];

  for (const candidate of candidates) {
    try {
      const urls = await discoverFromXml(candidate, input.siteUrl);
      if (urls.length > 0) {
        return urls;
      }
    } catch {
      // Try the next common feed URL.
    }
  }

  return discoverFromHome(input.siteUrl);
}

async function filterExistingTasks(urls: string[]) {
  if (urls.length === 0) {
    return { newUrls: [], existingUrls: [] };
  }

  const rows = await db
    .select({ sourceUrl: aiRewriteTasks.sourceUrl })
    .from(aiRewriteTasks)
    .where(inArray(aiRewriteTasks.sourceUrl, urls));
  const existingUrls = new Set(rows.map((row) => row.sourceUrl));

  return {
    newUrls: urls.filter((url) => !existingUrls.has(url)),
    existingUrls: urls.filter((url) => existingUrls.has(url)),
  };
}

export async function pullSourceSiteToAiTasks(input: SourceSitePullInput) {
  const limit = Math.max(1, Math.min(input.limit, 50));
  const discoveredUrls = [
    ...new Set(await discoverSourceSiteUrls(input)),
  ].slice(0, limit * 3);
  const filtered = await filterExistingTasks(discoveredUrls);
  const urls = filtered.newUrls.slice(0, limit);
  const overflowSkippedUrls = filtered.newUrls.slice(limit);
  const skippedUrls = [...filtered.existingUrls, ...overflowSkippedUrls];
  const skippedCount = skippedUrls.length;

  if (urls.length === 0) {
    return {
      discoveredCount: discoveredUrls.length,
      createdCount: 0,
      skippedCount,
      discoveredUrls,
      skippedUrls,
      tasks: [],
    };
  }

  const tasks = [];
  for (const sourceUrl of urls) {
    const task = await db.transaction(async (tx) => {
      const [material] = await tx
        .insert(sourceMaterials)
        .values({
          materialType: "url",
          sourceUrl,
          categoryId: input.categoryId,
          rewriteStyleId: input.rewriteStyleId ?? null,
          status: "queued",
          metadata: JSON.stringify({
            sourceSiteUrl: input.siteUrl,
            discoveredAt: new Date().toISOString(),
          }),
        })
        .returning({ id: sourceMaterials.id });

      if (!material) {
        return null;
      }

      const [createdTask] = await tx
        .insert(aiRewriteTasks)
        .values({
          sourceMaterialId: material.id,
          sourceUrl,
          categoryId: input.categoryId,
          rewriteStyleId: input.rewriteStyleId ?? null,
          status: "pending",
          progress: 0,
          currentStep: "来源站发现，等待处理",
        })
        .returning({
          id: aiRewriteTasks.id,
          sourceUrl: aiRewriteTasks.sourceUrl,
        });

      return createdTask ?? null;
    });

    if (task) {
      tasks.push(task);
    }
  }

  for (const task of tasks) {
    await enqueueAiRewriteTask(task.id);
  }

  return {
    discoveredCount: discoveredUrls.length,
    createdCount: tasks.length,
    skippedCount,
    discoveredUrls,
    skippedUrls,
    tasks,
  };
}

export async function getLatestSourceSiteTask(sourceUrl: string) {
  const [task] = await db
    .select({
      id: aiRewriteTasks.id,
      status: aiRewriteTasks.status,
      createdAt: aiRewriteTasks.createdAt,
    })
    .from(aiRewriteTasks)
    .where(and(eq(aiRewriteTasks.sourceUrl, sourceUrl)))
    .orderBy(desc(aiRewriteTasks.createdAt))
    .limit(1);

  return task ?? null;
}
