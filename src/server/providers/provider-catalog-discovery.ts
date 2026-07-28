import * as cheerio from "cheerio";

import { readResponseTextWithLimit } from "@fwqgo/core/bounded-response-body";
import {
  assertPublicHttpUrl,
  parsePublicHttpUrl,
} from "@fwqgo/core/network-url";
import { isOfficialProviderUrl } from "@/server/providers/provider-profile-scraper";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_FETCHED_PAGES = 18;
const MAX_DISCOVERED_URLS = 100;
const MAX_HTML_EXCERPT_LENGTH = 36_000;
const MAX_TEXT_LENGTH = 18_000;
const MAX_JSON_LENGTH = 48_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/json,text/plain;q=0.8,application/xml;q=0.7,*/*;q=0.4",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const catalogKeyword =
  /(?:\b(?:vps|server|servers|cloud|hosting|host|compute|instance|instances|dedicated|pricing|price|plans?|products?|store|shop|order|cart|buy)\b|云服务器|服务器|套餐|产品|价格|购买|订购|购物车)/i;
const preferredCatalogCategoryPattern =
  /(?:\b(?:shared[-_\s]*hosting|kvm[-_\s]*vps|ryzen[-_\s]*vps|windows[-_\s]*vps|cloud[-_\s]*(?:vps|servers?)|dedicated[-_\s]*servers?|ryzen[-_\s]*dedicated|hybrid[-_\s]*dedicated|bare[-_\s]*metal)\b|共享主机|虚拟主机|独立服务器|裸金属)/i;
const productSignalPatterns = [
  /(?:\bv?cpu\b|cores?|processor|处理器|核心)/i,
  /(?:\bram\b|memory|内存)/i,
  /(?:nvme|ssd|storage|disk|硬盘|存储)/i,
  /(?:bandwidth|traffic|transfer|流量|带宽)/i,
  /(?:[$€£¥￥]|\b(?:USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD)\b)\s*\d|\d(?:[.,]\d+)?\s*(?:USD|EUR|GBP|CNY|RMB|HKD|JPY|CAD|AUD)/i,
];
const loginPattern =
  /(?:sign\s*in|log\s*in|client\s*area|customer\s*portal|member\s*area|please\s+(?:sign\s*in|log\s*in)|登录|登陆|客户中心|会员中心)/i;
const whmcsPattern =
  /(?:cart\.php(?:\?|\/)|index\.php\?rp=\/store|whmcs|name=["']?billingcycle|pid=\d+|gid=\d+)/i;
const sensitiveNamePattern =
  /(?:authorization|cookie|csrf|xsrf|nonce|password|passwd|secret|session|signature|api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|\btoken\b)/i;

export type ProviderCatalogFetchedPage = {
  url: string;
  contentType: "html" | "json";
  title: string;
  text: string;
  structure: string;
  links: string[];
  signals: string[];
  /** Kept in memory for deterministic mapping preflight; never serialized or stored. */
  rawBody: string;
};

export type ProviderCatalogDiscoveryResult = {
  pages: ProviderCatalogFetchedPage[];
  discoveredUrls: string[];
  warnings: string[];
  manualReason: "needs_auth" | "dynamic_only" | null;
};

export class ProviderCatalogFetchError extends Error {
  constructor(
    message: string,
    readonly kind:
      "needs_auth" | "timeout" | "http" | "unsupported" | "too_large",
  ) {
    super(message);
    this.name = "ProviderCatalogFetchError";
  }
}

export function serializeProviderCatalogPagesForAi(
  pages: ProviderCatalogFetchedPage[],
) {
  return JSON.stringify(
    pages.slice(0, 8).map((page) => ({
      url: page.url,
      contentType: page.contentType,
      title: page.title,
      text: truncate(page.text, 6_000),
      structure: truncate(page.structure, 14_000),
      links: page.links.slice(0, 30),
      signals: page.signals,
    })),
  );
}

function scoreCatalogPage(page: ProviderCatalogFetchedPage) {
  const comparable = `${page.url}\n${page.title}\n${page.text.slice(0, 3_000)}`;
  let score = page.signals.length * 4;
  if (page.contentType === "json") score += 10;
  if (page.signals.includes("whmcs")) score += 12;
  if (preferredCatalogCategoryPattern.test(comparable)) score += 18;
  if (/(?:\bshared[-_\s]*hosting\b|共享主机|虚拟主机)/i.test(comparable)) {
    score += 22;
  }
  if (
    /(?:\b(?:vps|kvm|cloud|compute|dedicated|bare\s*metal|ryzen|epyc)\b|云服务器|独立服务器|裸金属)/i.test(
      comparable,
    )
  ) {
    score += 14;
  }
  if (
    /(?:\b(?:pricing|plans?|products?|store|cart|order)\b|价格|套餐|产品|购买|订购)/i.test(
      comparable,
    )
  ) {
    score += 6;
  }
  if (
    /(?:\b(?:colocation|domain|ssl|email|vpn)\b|域名|机柜托管)/i.test(
      comparable,
    )
  ) {
    score -= 8;
  }
  return score;
}

export function rankProviderCatalogPagesForAi(
  pages: ProviderCatalogFetchedPage[],
) {
  return pages
    .map((page, index) => ({ page, index, score: scoreCatalogPage(page) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ page }) => page);
}

function normalizeText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength).trimEnd()}...`;
}

function redactSensitiveText(value: string) {
  return value
    .replace(
      /\b(authorization|cookie|csrf|xsrf|nonce|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|auth[-_ ]?token|token|password|secret|session|signature)\s*[:=]\s*[^\s<>&"']+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]");
}

function removeSensitiveQueryParameters(url: URL) {
  for (const key of [...url.searchParams.keys()]) {
    if (sensitiveNamePattern.test(key)) url.searchParams.delete(key);
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

function normalizeOfficialUrl(
  value: string,
  pageUrl: string,
  officialHost: string,
) {
  const parsed = parsePublicHttpUrl(value.trim(), pageUrl);
  if (!parsed || !isOfficialProviderUrl(parsed, officialHost)) return null;
  if (parsed.username || parsed.password) return null;
  if (
    /\.(?:jpe?g|png|gif|webp|svg|ico|css|js|woff2?|ttf|zip|rar|7z|pdf)(?:$|\?)/i.test(
      parsed.pathname,
    )
  ) {
    return null;
  }
  return removeSensitiveQueryParameters(parsed).toString();
}

function scoreCatalogLink(url: string, text: string) {
  const parsed = new URL(url);
  const comparable = `${parsed.pathname} ${parsed.search} ${text}`;
  const action =
    parsed.searchParams.get("a") ?? parsed.searchParams.get("action") ?? "";
  const isDirectPurchase =
    /^(?:add|order|checkout)$/i.test(action.trim()) &&
    [...parsed.searchParams.keys()].some((key) =>
      /^(?:pid|gid|product|product_?id|plan_?id|package_?id|id)$/i.test(key),
    );
  if (isDirectPurchase) return 1;

  let score = catalogKeyword.test(comparable) ? 8 : 0;
  if (whmcsPattern.test(comparable)) score += 12;
  if (preferredCatalogCategoryPattern.test(comparable)) score += 16;
  if (
    /\b(?:pricing|plans?|products?|store|cart|order)\b/i.test(parsed.pathname)
  ) {
    score += 5;
  }
  score -= Math.min(parsed.pathname.split("/").filter(Boolean).length, 5);
  return score;
}

export function discoverProviderCatalogLinks(
  html: string,
  pageUrl: string,
  officialHost: string,
) {
  const $ = cheerio.load(html);
  const byUrl = new Map<string, number>();
  const candidates = [
    ...$("a[href], link[href]")
      .toArray()
      .map((element) => ({
        value: $(element).attr("href") ?? "",
        text: normalizeText(
          `${$(element).text()} ${$(element).attr("title") ?? ""} ${$(element).attr("aria-label") ?? ""}`,
        ),
      })),
    ...$("[data-url], [data-endpoint], [data-api]")
      .toArray()
      .flatMap((element) =>
        ["data-url", "data-endpoint", "data-api"].map((attribute) => ({
          value: $(element).attr(attribute) ?? "",
          text: normalizeText($(element).text()),
        })),
      ),
  ];

  for (const candidate of candidates) {
    const url = normalizeOfficialUrl(candidate.value, pageUrl, officialHost);
    if (!url) continue;
    const score = scoreCatalogLink(url, candidate.text);
    if (score <= 0) continue;
    byUrl.set(url, Math.max(score, byUrl.get(url) ?? 0));
  }

  return [...byUrl.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([url]) => url);
}

function getVisibleText($: cheerio.CheerioAPI) {
  const root = $("body").clone();
  root
    .find(
      "script, style, noscript, template, svg, canvas, iframe, object, embed, nav, footer, header, aside",
    )
    .remove();
  root.find("form").each((_, element) => {
    $(element).replaceWith($(element).html() ?? "");
  });
  root.find("input, textarea, button").remove();
  root.find("br").replaceWith("\n");
  root
    .find("h1, h2, h3, h4, h5, h6, p, li, dt, dd, tr, article, section")
    .each((_, element) => {
      $(element).append("\n");
    });
  return redactSensitiveText(normalizeText(root.text()));
}

function detectCatalogSignals(text: string, html: string) {
  const signals: string[] = [];
  for (const [index, pattern] of productSignalPatterns.entries()) {
    if (pattern.test(text)) signals.push(`product-field-${index + 1}`);
  }
  if (whmcsPattern.test(html)) signals.push("whmcs");
  if (catalogKeyword.test(text)) signals.push("catalog-keyword");
  return signals;
}

export function sanitizeProviderCatalogHtml(input: {
  html: string;
  pageUrl: string;
  officialHost: string;
}) {
  const source = cheerio.load(input.html);
  const title = normalizeText(
    source("title").first().text() || source("h1").first().text(),
  );
  const links = discoverProviderCatalogLinks(
    input.html,
    input.pageUrl,
    input.officialHost,
  );
  const text = truncate(getVisibleText(source), MAX_TEXT_LENGTH);
  const signals = detectCatalogSignals(text, input.html);
  const $ = cheerio.load(input.html);

  $(
    "script, style, noscript, template, svg, canvas, iframe, object, embed",
  ).remove();
  $("form").each((_, element) => {
    $(element).replaceWith($(element).html() ?? "");
  });
  $("input, textarea, button").remove();
  $("*").each((_, element) => {
    if (!("attribs" in element)) return;
    const node = $(element);
    for (const attribute of Object.keys(element.attribs ?? {})) {
      const lower = attribute.toLowerCase();
      const keep =
        lower === "class" ||
        lower === "id" ||
        lower === "href" ||
        lower === "name" ||
        lower === "value" ||
        lower === "itemprop" ||
        lower === "content" ||
        lower.startsWith("data-");
      if (!keep || lower.startsWith("on") || sensitiveNamePattern.test(lower)) {
        node.removeAttr(attribute);
        continue;
      }
      const rawValue = node.attr(attribute) ?? "";
      if (sensitiveNamePattern.test(rawValue)) {
        node.attr(attribute, "[REDACTED]");
      } else if (lower === "href") {
        const normalized = normalizeOfficialUrl(
          rawValue,
          input.pageUrl,
          input.officialHost,
        );
        if (normalized) node.attr(attribute, normalized);
        else node.removeAttr(attribute);
      }
    }
  });

  const bodyHtml = $("body").html() ?? $.root().html() ?? "";
  return {
    title,
    text,
    structure: truncate(
      redactSensitiveText(normalizeText(bodyHtml)),
      MAX_HTML_EXCERPT_LENGTH,
    ),
    links,
    signals,
    hasLoginGate:
      source("input[type='password']").length > 0 ||
      (loginPattern.test(`${title}\n${text.slice(0, 2_000)}`) &&
        signals.length < 2),
    looksDynamicOnly:
      source("script").length >= 3 && text.length < 250 && signals.length < 2,
  };
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeJsonValue(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 200)
        .map(([key, item]) => [
          key,
          sensitiveNamePattern.test(key)
            ? "[REDACTED]"
            : sanitizeJsonValue(item, depth + 1),
        ]),
    );
  }
  return typeof value === "string" ? redactSensitiveText(value) : value;
}

export function sanitizeProviderCatalogJson(body: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("页面声明为 JSON，但正文不是有效 JSON");
  }
  return truncate(JSON.stringify(sanitizeJsonValue(parsed)), MAX_JSON_LENGTH);
}

export function extractProviderCatalogSitemapUrls(
  xml: string,
  sitemapUrl: string,
  officialHost: string,
) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("loc")
    .toArray()
    .map((element) =>
      normalizeOfficialUrl($(element).text(), sitemapUrl, officialHost),
    )
    .filter((url): url is string => Boolean(url))
    .filter((url) => scoreCatalogLink(url, "") > 0)
    .slice(0, MAX_DISCOVERED_URLS);
}

async function fetchOfficialResource(input: {
  url: string;
  officialHost: string;
  allowXml?: boolean;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let currentUrl = await assertPublicHttpUrl(input.url, "供应商官网");
    if (!isOfficialProviderUrl(currentUrl, input.officialHost)) {
      throw new ProviderCatalogFetchError(
        "页面不属于配置的供应商官方域名",
        "http",
      );
    }

    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      const response = await fetch(currentUrl, {
        headers: browserHeaders,
        redirect: "manual",
        signal: controller.signal,
      });
      if (redirectStatuses.has(response.status)) {
        if (redirectCount >= 5) {
          await response.body?.cancel();
          throw new ProviderCatalogFetchError("官网跳转次数过多", "http");
        }
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) {
          throw new ProviderCatalogFetchError(
            "官网返回跳转状态但缺少 Location",
            "http",
          );
        }
        const nextUrl = await assertPublicHttpUrl(
          new URL(location, currentUrl),
          "供应商官网跳转地址",
        );
        if (!isOfficialProviderUrl(nextUrl, input.officialHost)) {
          throw new ProviderCatalogFetchError(
            "官网跳转到了非官方域名，已停止抓取",
            "http",
          );
        }
        currentUrl = nextUrl;
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new ProviderCatalogFetchError(
          `页面拒绝公开访问或需要登录（HTTP ${response.status}）`,
          "needs_auth",
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderCatalogFetchError(
          `页面返回 HTTP ${response.status}`,
          "http",
        );
      }

      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";
      const allowed =
        contentType.includes("application/json") ||
        contentType.includes("text/json") ||
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml+xml") ||
        contentType.includes("text/plain") ||
        (input.allowXml && (contentType.includes("xml") || contentType === ""));
      if (!allowed) {
        await response.body?.cancel();
        throw new ProviderCatalogFetchError(
          `页面返回了不支持的内容类型：${contentType || "未知"}`,
          "unsupported",
        );
      }
      const body = await readResponseTextWithLimit(
        response,
        MAX_DOCUMENT_BYTES,
      );
      if (body === null) {
        throw new ProviderCatalogFetchError("页面超过 2 MB 限制", "too_large");
      }
      return {
        body,
        finalUrl: removeSensitiveQueryParameters(
          new URL(response.url || currentUrl),
        ).toString(),
        contentType,
      };
    }

    throw new ProviderCatalogFetchError("官网跳转次数过多", "http");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderCatalogFetchError("页面抓取超时", "timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getOfficialUrlCandidates(officialUrl: string) {
  const trimmed = officialUrl.trim();
  if (!trimmed) throw new Error("供应商官网为空");
  const explicit = parsePublicHttpUrl(trimmed);
  if (explicit) return [explicit.toString()];
  const values = [`https://${trimmed}`, `http://${trimmed}`]
    .map((value) => parsePublicHttpUrl(value)?.toString())
    .filter((value): value is string => Boolean(value));
  if (values.length === 0) throw new Error("供应商官网格式不正确");
  return values;
}

function fallbackCatalogUrls(homeUrl: string, officialHost: string) {
  return [
    "/shared-hosting",
    "/kvm-vps",
    "/ryzen-vps",
    "/amd-ryzen-vps",
    "/windows-vps",
    "/dedicated-servers",
    "/amd-ryzen-dedicated-servers",
    "/hybrid-dedicated-servers",
    "/bare-metal",
    "/cart.php",
    "/store",
    "/pricing",
    "/vps",
    "/servers",
  ]
    .map((path) => normalizeOfficialUrl(path, homeUrl, officialHost))
    .filter((url): url is string => Boolean(url));
}

export async function collectProviderCatalogPages(
  officialUrl: string,
): Promise<ProviderCatalogDiscoveryResult> {
  const baseCandidates = getOfficialUrlCandidates(officialUrl);
  const officialHost = new URL(baseCandidates[0]!).hostname;
  let homeResponse: Awaited<ReturnType<typeof fetchOfficialResource>> | null =
    null;
  let homeError: unknown = null;

  for (const candidate of baseCandidates) {
    try {
      homeResponse = await fetchOfficialResource({
        url: candidate,
        officialHost,
      });
      break;
    } catch (error) {
      homeError = error;
    }
  }
  if (!homeResponse) {
    throw homeError instanceof Error
      ? homeError
      : new Error("无法访问供应商官网");
  }

  const pages: ProviderCatalogFetchedPage[] = [];
  const discoveredUrls = new Set<string>([homeResponse.finalUrl]);
  const fetchedUrls = new Set<string>();
  const capturedUrls = new Set<string>();
  const warnings: string[] = [];
  let sawAuthGate = false;
  let sawDynamicOnly = false;

  const fallbackUrls = fallbackCatalogUrls(homeResponse.finalUrl, officialHost);
  const speculativeUrls = new Set(fallbackUrls);
  let queueSequence = 0;
  const queue = new Map<
    string,
    { url: string; priority: number; sequence: number }
  >();
  const enqueue = (url: string, priority: number) => {
    if (fetchedUrls.has(url)) return;
    const existing = queue.get(url);
    if (existing) {
      if (priority > existing.priority) existing.priority = priority;
      return;
    }
    queue.set(url, { url, priority, sequence: queueSequence });
    queueSequence += 1;
  };
  const dequeue = () => {
    const next = [...queue.values()].sort(
      (left, right) =>
        right.priority - left.priority || left.sequence - right.sequence,
    )[0];
    if (next) queue.delete(next.url);
    return next?.url ?? null;
  };
  enqueue(homeResponse.finalUrl, 1_000);
  for (const url of fallbackUrls) {
    enqueue(url, scoreCatalogLink(url, "") + 4);
  }
  const prefetched = new Map([[homeResponse.finalUrl, homeResponse]]);
  const sitemapUrl = normalizeOfficialUrl(
    "/sitemap.xml",
    homeResponse.finalUrl,
    officialHost,
  );
  if (sitemapUrl) {
    try {
      const sitemap = await fetchOfficialResource({
        url: sitemapUrl,
        officialHost,
        allowXml: true,
      });
      for (const url of extractProviderCatalogSitemapUrls(
        sitemap.body,
        sitemap.finalUrl,
        officialHost,
      )) {
        discoveredUrls.add(url);
        enqueue(url, scoreCatalogLink(url, "") + 2);
      }
    } catch {
      // A missing sitemap is normal and should not make an otherwise valid scan noisy.
    }
  }
  for (const url of fallbackUrls) {
    discoveredUrls.add(url);
  }

  while (queue.size > 0 && pages.length < MAX_FETCHED_PAGES) {
    const url = dequeue();
    if (!url) break;
    if (fetchedUrls.has(url)) continue;
    fetchedUrls.add(url);

    try {
      const response =
        prefetched.get(url) ??
        (await fetchOfficialResource({ url, officialHost }));
      fetchedUrls.add(response.finalUrl);
      if (capturedUrls.has(response.finalUrl)) continue;
      capturedUrls.add(response.finalUrl);
      const declaredJson = response.contentType.includes("json");
      if (declaredJson || /^[\s\n]*[\[{]/.test(response.body)) {
        try {
          const structure = sanitizeProviderCatalogJson(response.body);
          pages.push({
            url: response.finalUrl,
            contentType: "json",
            title: new URL(response.finalUrl).pathname,
            text: "",
            structure,
            links: [],
            signals: ["json"],
            rawBody: response.body,
          });
          continue;
        } catch (error) {
          warnings.push(
            `${response.finalUrl}：${
              error instanceof Error ? error.message : "JSON 解析失败"
            }，已按公开文本页面继续分析`,
          );
        }
      }

      const sanitized = sanitizeProviderCatalogHtml({
        html: response.body,
        pageUrl: response.finalUrl,
        officialHost,
      });
      if (sanitized.hasLoginGate) sawAuthGate = true;
      if (sanitized.looksDynamicOnly) sawDynamicOnly = true;
      pages.push({
        url: response.finalUrl,
        contentType: "html",
        title: sanitized.title,
        text: sanitized.text,
        structure: sanitized.structure,
        links: sanitized.links,
        signals: sanitized.signals,
        rawBody: response.body,
      });
      for (const link of sanitized.links.slice(0, 50)) {
        const linkScore = scoreCatalogLink(link, "");
        if (linkScore <= 1) continue;
        if (discoveredUrls.size < MAX_DISCOVERED_URLS) {
          discoveredUrls.add(link);
        }
        enqueue(link, linkScore + 20);
      }
    } catch (error) {
      if (error instanceof ProviderCatalogFetchError) {
        if (error.kind === "needs_auth") sawAuthGate = true;
        if (url !== homeResponse.finalUrl) {
          if (!speculativeUrls.has(url)) {
            warnings.push(`${url}：${error.message}`);
          }
          continue;
        }
      }
      throw error;
    }
  }

  const sourceLikePages = pages.filter(
    (page) => page.contentType === "json" || page.signals.length >= 2,
  );
  const manualReason =
    sourceLikePages.length > 0
      ? null
      : sawAuthGate
        ? "needs_auth"
        : sawDynamicOnly
          ? "dynamic_only"
          : null;
  if (manualReason === "dynamic_only") {
    warnings.push(
      "公开页面只有客户端动态占位内容，需要人工查找公开接口或后续使用浏览器适配器",
    );
  }
  if (manualReason === "needs_auth") {
    warnings.push("套餐目录需要登录或拒绝公开访问，本次扫描未尝试绕过访问限制");
  }

  return {
    pages,
    discoveredUrls: [...discoveredUrls].slice(0, MAX_DISCOVERED_URLS),
    warnings: [...new Set(warnings)].slice(0, 100),
    manualReason,
  };
}
