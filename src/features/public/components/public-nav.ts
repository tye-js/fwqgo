/**
 * 前台导航的**唯一数据源**：桌面下拉与移动抽屉共用这一份结构，各自只负责渲染差异。
 *
 * 此前两边是两份独立定义（文案、href、层级都重复），已经漂移：
 *
 * - 英文「最新文章」桌面写 `Journal`、移动写 `Latest articles`；
 * - 分类链接的拼法两处各写一遍（桌面内联模板串、移动一个 `categoryHref()`）；
 * - 「选购工具」两项的标题与描述也各写一遍。
 *
 * 所以这里承担两件事：**导航结构**与 **URL 拼法**。调用方只管怎么渲染，不用再拼路径；
 * 文案仍然从 `header-copy.ts` 取，本文件里不出现裸字符串。
 */

import type { HeaderCopy, PublicLanguage } from "./header-copy";

/** 导航里的一个链接。`description` 只在桌面的下拉面板里显示。 */
export type PublicNavLink = {
  label: string;
  href: string;
  description?: string | null;
};

export type PublicNavModel = {
  /** 顶层直链。 */
  latest: PublicNavLink;
  /** 「服务器比价」分组里的 4 项，第一项是「全部套餐」。 */
  deals: PublicNavLink[];
  /** 「选购工具」分组里的 2 项。 */
  tools: PublicNavLink[];
  /** 动态分类（来自数据库）。 */
  categories: PublicNavLink[];
  /** 知识库入口；配置缺失时为 null。 */
  knowledge: PublicNavLink | null;
  search: PublicNavLink;
};

/** 语言前缀：英文站在 `/en` 下，中文站在根路径。 */
export function publicPathPrefix(language: PublicLanguage) {
  return language === "en" ? "/en" : "";
}

/**
 * 「服务器比价」的 4 个入口。
 *
 * **故意不带语言前缀**：英文站目前没有 `/en/servers`，这些页面只有中文版，
 * 所以英文导航点进来落在中文比价页 —— 这是内容缺失下的既定降级，不是漏了前缀。
 * 注意它与 `knowledgeHref`（配了 `/en/knowledge`）的处理不同，别照着“统一前缀”改。
 */
const DEAL_PATHS = [
  "/servers",
  "/servers/hong-kong",
  "/servers/united-states",
  "/servers/cheap-vps",
] as const;

/** 选购工具的两项，都带语言前缀（英文站有 `/en/tools/*`）。 */
const TOOL_PATHS = ["/tools/server-sizing", "/tools/network-lines"] as const;

export function buildPublicNav(input: {
  language: PublicLanguage;
  copy: HeaderCopy;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    description?: string | null;
  }>;
}): PublicNavModel {
  const { language, copy, categories } = input;
  const prefix = publicPathPrefix(language);

  const dealCopy = [
    [copy.allOffers, copy.allOffersDescription],
    [copy.hongKong, copy.hongKongDescription],
    [copy.unitedStates, copy.unitedStatesDescription],
    [copy.cheapVps, copy.cheapVpsDescription],
  ] as const;
  const toolCopy = [
    [copy.serverSizing, copy.serverSizingDescription],
    [copy.networkLines, copy.networkLinesDescription],
  ] as const;

  return {
    latest: {
      label: copy.latestArticles,
      href: `${prefix}/fwq/page/1`,
    },
    deals: DEAL_PATHS.map((href, index) => ({
      label: dealCopy[index]?.[0] ?? "",
      href,
      description: dealCopy[index]?.[1] ?? null,
    })),
    tools: TOOL_PATHS.map((path, index) => ({
      label: toolCopy[index]?.[0] ?? "",
      href: `${prefix}${path}`,
      description: toolCopy[index]?.[1] ?? null,
    })),
    categories: categories.map((category) => ({
      label: category.name,
      href: `${prefix}/fwq/${encodeURIComponent(category.slug)}/page/1`,
      description: category.description ?? null,
    })),
    knowledge:
      copy.knowledgeHref && copy.knowledgeLabel
        ? { label: copy.knowledgeLabel, href: copy.knowledgeHref }
        : null,
    search: { label: copy.searchLabel, href: copy.searchHref },
  };
}
