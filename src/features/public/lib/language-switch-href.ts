export type PublicLanguage = "zh" | "en";

function toHref(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * 语言切换的**兜底**目标（没有 hreflang alternate 时用）。
 *
 * ## 为什么不能一律「加/去 `/en` 前缀」
 *
 * 分类页与标签页的路径里是**当前语言的 slug**：
 *
 * - 中文 `/fwq/ddos-vps/page/1` → 加前缀得到 `/en/fwq/ddos-vps/page/1`，
 *   而英文树按 `enSlug`（`ddos-protected-servers`）解析 → **404**；
 * - 中文 `/fwq/tags/vps优惠/page/1` → `/en/fwq/tags/vps优惠/page/1` → **404**；
 * - 反方向 `/en/fwq/china-servers/page/1` → 去前缀得到 `/fwq/china-servers/page/1`，
 *   中文树按 `slug`（`fuwuqi`）解析 → 同样 404。
 *
 * 实测爬站一次抓到 5 个这种死链，来源全是页头/页脚的「English」。
 *
 * ## 规则
 *
 * - `/fwq/page/N` 与 `/en/fwq/page/N` **不含 slug**，加/去前缀就是对应语言的同一页；
 * - 其他 `/fwq/*`、`/en/fwq/*` 一律回**目标语言首页**：这些页面**有**对应语言版本时，
 *   由调用方先用 hreflang alternate 接管（`enSlug` 不同也能对上）；走到兜底说明没有对应版本，
 *   这时猜一个 slug 只会得到 404。
 * - 搜索页、知识库、信任页各有自己的固定映射，slug 在两棵树里相同，不受影响。
 */
export function buildLanguageSwitchFallbackHref(
  pathname: string,
  searchParams: URLSearchParams,
  targetLanguage: PublicLanguage,
) {
  const params = new URLSearchParams(searchParams.toString());

  if (pathname === "/search") {
    if (targetLanguage === "en") {
      params.set("lang", "en");
    } else {
      params.delete("lang");
    }
    return toHref("/search", params);
  }

  if (pathname === "/knowledge" || pathname.startsWith("/knowledge/")) {
    return targetLanguage === "en" ? "/en/knowledge" : "/knowledge";
  }

  if (pathname === "/en/knowledge" || pathname.startsWith("/en/knowledge/")) {
    return targetLanguage === "zh" ? "/knowledge" : "/en/knowledge";
  }

  // Trust pages share the same slug in both language trees, so the switch is a
  // prefix change rather than a translation lookup.
  const trustMatch =
    /^\/(?:en\/)?(about|contact|privacy|terms|affiliate-disclosure)$/.exec(
      pathname,
    );
  if (trustMatch) {
    return targetLanguage === "en"
      ? `/en/${trustMatch[1]}`
      : `/${trustMatch[1]}`;
  }

  if (targetLanguage === "en") {
    if (pathname === "/") return toHref("/en", params);
    if (pathname === "/en" || pathname.startsWith("/en/")) {
      return toHref(pathname, params);
    }
    if (/^\/fwq\/page\/\d+$/.test(pathname)) {
      return toHref(`/en${pathname}`, params);
    }
    return "/en";
  }

  if (pathname === "/en") return toHref("/", params);
  if (/^\/en\/fwq\/page\/\d+$/.test(pathname)) {
    return toHref(pathname.slice(3) || "/", params);
  }

  return "/";
}
