/**
 * 前台导航的**唯一数据源**：桌面下拉与移动抽屉共用这一份结构，各自只负责渲染差异。
 *
 * 此前两边是两份独立定义（文案、href、层级都重复），已经漂移：
 *
 * - 英文「最新文章」桌面写 `Journal`、移动写 `Latest articles`；
 * - 分类链接的拼法两处各写一遍（桌面内联模板串、移动一个 `categoryHref()`）；
 * - 「选购工具」两项的标题与描述也各写一遍。
 *
 * 所以这里承担三件事：**导航结构**、**URL 拼法**、**当前页匹配规则**。
 * 调用方只管怎么渲染，不用再拼路径、也不用按 href 形态去猜「我在哪一页」。
 * 文案仍然从 `header-copy.ts` 取，本文件里不出现裸字符串。
 */

import type { HeaderCopy, PublicLanguage } from "./header-copy";

/** 导航里的一个链接。`description` 只在桌面的下拉面板里显示。 */
export type PublicNavLink = {
  label: string;
  href: string;
  description?: string | null;
  /**
   * 当前路径命中其中任一前缀时，这一项视为「当前页」。
   *
   * 规则放在数据层而不是让渲染组件按 href 形态去猜，因为两者对不上：
   * 「服务器分类」这一组的 href 指向第一个具体分类，但要匹配的是整个
   * `/fwq/<分类>/page/N` 形态；「最新文章」反过来要排除分类页，只能匹配
   * `/fwq/page/`。这些差异只有数据层知道。
   *
   * 不填表示这一项不参与高亮（比如下拉面板里的子项 —— 用户看不到它，高亮无意义）。
   */
  matchPrefixes?: readonly string[];
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
      // 只匹配 `/fwq/page/N`；分类页是 `/fwq/<slug>/page/N`，不能命中这里。
      matchPrefixes: [`${prefix}/fwq/page/`],
    },
    deals: DEAL_PATHS.map((href, index) => ({
      label: dealCopy[index]?.[0] ?? "",
      href,
      description: dealCopy[index]?.[1] ?? null,
      // 只有「全部套餐」参与高亮：它是 `/servers` 本身，前缀匹配同时覆盖
      // `/servers/hong-kong` 这类子页，所以「服务器比价」入口在比价页面上会亮。
      // 下拉里的另外三项不填 —— 面板里的项高亮没有意义。
      ...(index === 0 ? { matchPrefixes: [href] } : {}),
    })),
    tools: TOOL_PATHS.map((path, index) => ({
      label: toolCopy[index]?.[0] ?? "",
      href: `${prefix}${path}`,
      description: toolCopy[index]?.[1] ?? null,
      matchPrefixes: [`${prefix}${path}`],
    })),
    categories: categories.map((category) => ({
      label: category.name,
      href: `${prefix}/fwq/${encodeURIComponent(category.slug)}/page/1`,
      description: category.description ?? null,
      matchPrefixes: [
        `${prefix}/fwq/${encodeURIComponent(category.slug)}/page/`,
      ],
    })),
    knowledge:
      copy.knowledgeHref && copy.knowledgeLabel
        ? {
            label: copy.knowledgeLabel,
            href: copy.knowledgeHref,
            matchPrefixes: [copy.knowledgeHref],
          }
        : null,
    search: {
      label: copy.searchLabel,
      // `searchHref` 带查询串（英文站是 `/search?lang=en`），匹配时要去掉它。
      href: copy.searchHref,
      matchPrefixes: [copy.searchHref.split("?")[0] ?? copy.searchHref],
    },
  };
}
