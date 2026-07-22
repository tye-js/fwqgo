import * as cheerio from "cheerio";

import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import {
  assertPublicHttpUrl,
  parsePublicHttpUrl,
} from "@fwqgo/core/network-url";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_FETCHED_PAGES = 6;
const MAX_SUMMARY_LENGTH = 4_000;
const MAX_POLICY_LENGTH = 30_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const pageKindLabels: Record<Exclude<PageKind, "home">, string> = {
  about: "供应商介绍",
  refund: "退款政策",
  prohibited: "禁止事项",
  terms: "服务条款",
};

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const pageKeywords = {
  about:
    /(?:^|[\s/_-])(about(?:\s+us)?|company|who\s+we\s+are|our\s+story|关于(?:我们)?|公司简介)(?:$|[\s/_-])/i,
  refund:
    /(?:refund|money[\s_-]*back|return\s+policy|cancel(?:lation)?|退款|退费|退款政策|取消政策)/i,
  prohibited:
    /(?:acceptable[\s_-]*use|\baup\b|prohibited|abuse|fair[\s_-]*use|禁止|可接受使用|滥用)/i,
  terms:
    /(?:terms(?:[\s_-]*(?:of[\s_-]*)?(?:service|use))?|service[\s_-]*agreement|legal|服务条款|使用条款|条款)/i,
} as const;

const refundSectionKeywords =
  /(?:refund|money[\s-]*back|return|cancel(?:lation)?|退款|退费|退款政策|取消)/i;
const prohibitedSectionKeywords =
  /(?:acceptable[\s-]*use|\baup\b|prohibited|abuse|suspend|termination|禁止|滥用|停用|终止)/i;

type PageKind = keyof typeof pageKeywords | "home";

type DiscoveredLink = {
  url: string;
  text: string;
};

type FetchedPage = {
  url: string;
  kind: PageKind;
  title: string;
  description: string | null;
  text: string;
  refundSections: string | null;
  prohibitedSections: string | null;
  links: DiscoveredLink[];
};

export type ProviderProfileCandidate = {
  summary: string | null;
  summarySourceUrl: string | null;
  refundPolicy: string | null;
  refundPolicySourceUrl: string | null;
  prohibitedUses: string | null;
  prohibitedUsesSourceUrl: string | null;
  discoveredUrls: string[];
  warnings: string[];
};

function normalizeHostname(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

export function isOfficialProviderUrl(
  value: string | URL,
  officialHost: string,
) {
  const parsed =
    value instanceof URL ? value : parsePublicHttpUrl(value.toString());
  if (!parsed || parsed.username || parsed.password) return false;
  const targetHost = normalizeHostname(parsed.hostname);
  const normalizedOfficialHost = normalizeHostname(officialHost);
  return (
    targetHost === normalizedOfficialHost ||
    targetHost.endsWith(`.${normalizedOfficialHost}`)
  );
}

function normalizeMultilineText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(value: string, maxLength: number) {
  const normalized = normalizeMultilineText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function extractJsonLdDescription($: cheerio.CheerioAPI) {
  for (const element of $("script[type='application/ld+json']").toArray()) {
    const raw = $(element).text().trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue: unknown[] = [];
      if (Array.isArray(parsed)) {
        for (const item of parsed as unknown[]) queue.push(item);
      } else {
        queue.push(parsed);
      }

      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const record = item as Record<string, unknown>;
        if (
          typeof record.description === "string" &&
          record.description.trim()
        ) {
          return record.description.trim();
        }
        const graph: unknown = record["@graph"];
        if (Array.isArray(graph)) {
          for (const child of graph as unknown[]) queue.push(child);
        }
      }
    } catch {
      // Ignore malformed structured data and continue with HTML metadata.
    }
  }

  return null;
}

function extractDescription($: cheerio.CheerioAPI) {
  const value =
    $("meta[name='description']").first().attr("content") ??
    $("meta[property='og:description']").first().attr("content") ??
    $("meta[name='twitter:description']").first().attr("content") ??
    extractJsonLdDescription($);

  return value?.trim() ? truncateText(value, MAX_SUMMARY_LENGTH) : null;
}

function extractVisibleText($: cheerio.CheerioAPI) {
  const preferredRoot = $("main, article, [role='main']").first();
  const root = (preferredRoot.length > 0 ? preferredRoot : $("body")).clone();

  root
    .find(
      "script, style, noscript, template, svg, canvas, iframe, form, nav, footer, header, aside",
    )
    .remove();
  root.find("br").replaceWith("\n");
  root
    .find("h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, pre, tr")
    .each((_, element) => {
      $(element).append("\n");
    });

  return normalizeMultilineText(root.text());
}

function extractHeadingSections(
  $: cheerio.CheerioAPI,
  keyword: RegExp,
  maxLength: number,
) {
  const sections: string[] = [];

  for (const heading of $("h1, h2, h3, h4, h5, h6").toArray()) {
    const headingText = normalizeMultilineText($(heading).text());
    if (!headingText || !keyword.test(headingText)) continue;

    const sectionRoot = $(heading).closest("section");
    const sectionText = sectionRoot.length
      ? extractVisibleText(cheerio.load(sectionRoot.html() ?? ""))
      : normalizeMultilineText(
          [
            headingText,
            $(heading)
              .nextUntil("h1, h2, h3, h4, h5, h6")
              .toArray()
              .map((element) => $(element).text())
              .join("\n"),
          ].join("\n"),
        );

    if (sectionText.length >= 30 && !sections.includes(sectionText)) {
      sections.push(sectionText);
    }
  }

  return sections.length > 0
    ? truncateText(sections.join("\n\n"), maxLength)
    : null;
}

function normalizeOfficialLink(
  href: string,
  baseUrl: string,
  officialHost: string,
) {
  const parsed = parsePublicHttpUrl(href.trim(), baseUrl);
  if (!parsed || !isOfficialProviderUrl(parsed, officialHost)) return null;
  if (parsed.username || parsed.password) return null;
  if (/\.(?:jpe?g|png|gif|webp|svg|zip|rar|7z|pdf)$/i.test(parsed.pathname)) {
    return null;
  }

  parsed.hash = "";
  return parsed.toString();
}

export function discoverProviderPolicyLinks(
  html: string,
  pageUrl: string,
  officialHost: string,
) {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, DiscoveredLink>();

  for (const element of $("a[href]").toArray()) {
    const url = normalizeOfficialLink(
      $(element).attr("href") ?? "",
      pageUrl,
      officialHost,
    );
    if (!url) continue;

    const text = normalizeMultilineText(
      `${$(element).text()} ${$(element).attr("title") ?? ""}`,
    );
    const comparable = `${new URL(url).pathname} ${text}`;
    if (
      !Object.values(pageKeywords).some((keyword) => keyword.test(comparable))
    ) {
      continue;
    }

    if (!byUrl.has(url)) byUrl.set(url, { url, text });
  }

  return [...byUrl.values()];
}

function classifyLink(
  link: DiscoveredLink,
): Array<{ kind: Exclude<PageKind, "home">; score: number }> {
  const pathname = new URL(link.url).pathname.toLowerCase();
  const comparable = `${pathname} ${link.text.toLowerCase()}`;

  return (
    Object.entries(pageKeywords) as Array<[Exclude<PageKind, "home">, RegExp]>
  )
    .filter(([, keyword]) => keyword.test(comparable))
    .map(([kind]) => ({
      kind,
      score:
        (pageKeywords[kind].test(pathname) ? 8 : 0) +
        (pageKeywords[kind].test(link.text) ? 5 : 0) -
        Math.min(pathname.split("/").filter(Boolean).length, 4),
    }));
}

function selectPagesToFetch(home: FetchedPage, officialHost: string) {
  const candidates = home.links.flatMap((link) =>
    classifyLink(link).map((classification) => ({
      ...link,
      ...classification,
    })),
  );
  const selected: Array<{ url: string; kind: Exclude<PageKind, "home"> }> = [];
  const selectedUrls = new Set<string>([home.url]);

  for (const kind of ["about", "refund", "prohibited", "terms"] as const) {
    const match = candidates
      .filter((candidate) => candidate.kind === kind)
      .sort((left, right) => right.score - left.score)[0];
    if (match && !selectedUrls.has(match.url)) {
      selected.push({ url: match.url, kind });
      selectedUrls.add(match.url);
    }
  }

  const fallbackPaths: Array<{
    kind: Exclude<PageKind, "home">;
    path: string;
  }> = [
    { kind: "about", path: "/about" },
    { kind: "refund", path: "/refund-policy" },
    { kind: "prohibited", path: "/acceptable-use-policy" },
    { kind: "terms", path: "/terms-of-service" },
  ];

  for (const fallback of fallbackPaths) {
    if (selected.some((item) => item.kind === fallback.kind)) continue;
    const url = normalizeOfficialLink(fallback.path, home.url, officialHost);
    if (!url || selectedUrls.has(url)) continue;
    selected.push({ url, kind: fallback.kind });
    selectedUrls.add(url);
  }

  return selected.slice(0, MAX_FETCHED_PAGES - 1);
}

async function fetchOfficialHtml(url: string, officialHost: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = await assertPublicHttpUrl(url, "供应商官网");
    if (!isOfficialProviderUrl(currentUrl, officialHost)) {
      throw new Error("供应商官网地址不属于配置的官方域名");
    }
    let response: Response | null = null;

    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      response = await fetch(currentUrl, {
        headers: browserHeaders,
        signal: controller.signal,
        redirect: "manual",
      });
      if (!redirectStatuses.has(response.status)) break;
      if (redirectCount >= 5) {
        await response.body?.cancel();
        throw new Error("供应商官网跳转次数过多");
      }

      const location = response.headers.get("location");
      if (!location) {
        await response.body?.cancel();
        throw new Error("供应商官网返回跳转状态但缺少 Location");
      }
      const redirectUrl = await assertPublicHttpUrl(
        new URL(location, currentUrl),
        "供应商官网跳转地址",
      );
      if (!isOfficialProviderUrl(redirectUrl, officialHost)) {
        await response.body?.cancel();
        throw new Error("供应商官网跳转到了非官方域名，已停止抓取");
      }
      await response.body?.cancel();
      currentUrl = redirectUrl;
      response = null;
    }

    if (!response) throw new Error("供应商官网没有返回有效响应");

    if (!isOfficialProviderUrl(response.url || currentUrl, officialHost)) {
      await response.body?.cancel();
      throw new Error("供应商官网跳转到了非官方域名，已停止抓取");
    }

    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new Error(
        `供应商官网拒绝公开访问或需要登录（HTTP ${response.status}）`,
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`供应商官网返回 HTTP ${response.status}`);
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      await response.body?.cancel();
      throw new Error(`供应商官网返回了不支持的内容类型：${contentType}`);
    }

    const html = await readResponseTextWithLimit(response, MAX_DOCUMENT_BYTES);
    if (html === null) {
      throw new Error("供应商官网页面超过 2 MB 限制");
    }

    return { html, finalUrl: response.url || currentUrl.toString() };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("供应商官网抓取超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractProviderProfileDocument(html: string) {
  const $ = cheerio.load(html);
  const title = normalizeMultilineText(
    $("title").first().text() || $("h1").first().text(),
  );

  return {
    title,
    description: extractDescription($),
    text: extractVisibleText($),
    refundSections: extractHeadingSections(
      $,
      refundSectionKeywords,
      MAX_POLICY_LENGTH,
    ),
    prohibitedSections: extractHeadingSections(
      $,
      prohibitedSectionKeywords,
      MAX_POLICY_LENGTH,
    ),
  };
}

function parseFetchedPage(input: {
  html: string;
  url: string;
  kind: PageKind;
  officialHost: string;
}): FetchedPage {
  const document = extractProviderProfileDocument(input.html);

  return {
    url: input.url,
    kind: input.kind,
    ...document,
    links: discoverProviderPolicyLinks(
      input.html,
      input.url,
      input.officialHost,
    ),
  };
}

async function fetchPage(input: {
  url: string;
  kind: PageKind;
  officialHost: string;
}) {
  const response = await fetchOfficialHtml(input.url, input.officialHost);
  return parseFetchedPage({
    html: response.html,
    url: response.finalUrl,
    kind: input.kind,
    officialHost: input.officialHost,
  });
}

function getPolicyCandidate(
  pages: FetchedPage[],
  kind: "refund" | "prohibited",
) {
  const sectionKey =
    kind === "refund" ? "refundSections" : "prohibitedSections";
  const directKinds: PageKind[] =
    kind === "refund" ? ["refund", "terms"] : ["prohibited", "terms"];

  for (const directKind of directKinds) {
    for (const page of pages.filter((item) => item.kind === directKind)) {
      const section = page[sectionKey];
      if (section) return { text: section, sourceUrl: page.url };
      if (page.kind === kind && page.text.length >= 30) {
        return {
          text: truncateText(page.text, MAX_POLICY_LENGTH),
          sourceUrl: page.url,
        };
      }
    }
  }

  for (const page of pages) {
    const section = page[sectionKey];
    if (section) return { text: section, sourceUrl: page.url };
  }

  return { text: null, sourceUrl: null };
}

function getSummaryCandidate(pages: FetchedPage[]) {
  const preferredPages = [
    ...pages.filter((page) => page.kind === "about"),
    ...pages.filter((page) => page.kind === "home"),
  ];

  for (const page of preferredPages) {
    if (page.description) {
      return { text: page.description, sourceUrl: page.url };
    }
    if (page.kind === "about" && page.text.length >= 30) {
      return {
        text: truncateText(page.text, MAX_SUMMARY_LENGTH),
        sourceUrl: page.url,
      };
    }
  }

  const home = pages.find((page) => page.kind === "home");
  return home?.text
    ? {
        text: truncateText(home.text, Math.min(MAX_SUMMARY_LENGTH, 1_500)),
        sourceUrl: home.url,
      }
    : { text: null, sourceUrl: null };
}

function getBaseCandidates(officialUrl: string) {
  const trimmed = officialUrl.trim();
  if (!trimmed) throw new Error("供应商官网域名为空");

  const explicit = parsePublicHttpUrl(trimmed);
  if (explicit) return [explicit.toString()];

  const httpsUrl = parsePublicHttpUrl(`https://${trimmed}`);
  const httpUrl = parsePublicHttpUrl(`http://${trimmed}`);
  const candidates = [httpsUrl, httpUrl]
    .filter((url): url is URL => Boolean(url))
    .map((url) => url.toString());
  if (candidates.length === 0) {
    throw new Error("供应商官网域名格式不正确");
  }
  return candidates;
}

async function fetchHomePage(officialUrl: string) {
  const candidates = getBaseCandidates(officialUrl);
  const officialHost = new URL(candidates[0]!).hostname;
  let lastError: unknown = null;

  for (const url of candidates) {
    try {
      const page = await fetchPage({ url, kind: "home", officialHost });
      return { page, officialHost };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("无法访问供应商官网");
}

export async function collectProviderProfileCandidate(
  officialUrl: string,
): Promise<ProviderProfileCandidate> {
  const home = await fetchHomePage(officialUrl);
  const pages: FetchedPage[] = [home.page];
  const plan = selectPagesToFetch(home.page, home.officialHost);
  const discoveredUrls = new Set<string>([
    home.page.url,
    ...home.page.links.map((link) => link.url),
    ...plan.map((item) => item.url),
  ]);
  const warnings: string[] = [];

  for (const item of plan) {
    try {
      pages.push(
        await fetchPage({
          url: item.url,
          kind: item.kind,
          officialHost: home.officialHost,
        }),
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "页面返回未知错误";
      warnings.push(
        `${pageKindLabels[item.kind]}页面读取失败（${item.url}）：${reason}`,
      );
    }
  }

  const summary = getSummaryCandidate(pages);
  const refund = getPolicyCandidate(pages, "refund");
  const prohibited = getPolicyCandidate(pages, "prohibited");

  if (!summary.text) warnings.push("未从官网公开页面提取到供应商介绍");
  if (!refund.text) warnings.push("未从官网公开页面提取到退款政策");
  if (!prohibited.text) warnings.push("未从官网公开页面提取到禁止事项");

  if (!summary.text && !refund.text && !prohibited.text) {
    throw new Error("官网可公开访问，但未提取到供应商介绍、退款政策或禁止事项");
  }

  return {
    summary: summary.text,
    summarySourceUrl: summary.sourceUrl,
    refundPolicy: refund.text,
    refundPolicySourceUrl: refund.sourceUrl,
    prohibitedUses: prohibited.text,
    prohibitedUsesSourceUrl: prohibited.sourceUrl,
    discoveredUrls: [...discoveredUrls].slice(0, 40),
    warnings: [...new Set(warnings)],
  };
}
