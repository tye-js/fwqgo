/**
 * 前台 Header 的文案表与语言类型。
 *
 * 单独抽出来是为了让 `desktop-nav.tsx` / `mobile-nav.tsx` 能拿到同一份类型，
 * 而不必从 `header.tsx` 反向导入（那会形成循环依赖）。
 */
export type PublicLanguage = "zh" | "en";

export type HeaderCopy = {
  homeLabel: string;
  languageLabel: string;
  dealsTitle: string;
  allOffers: string;
  allOffersDescription: string;
  hongKong: string;
  hongKongDescription: string;
  unitedStates: string;
  unitedStatesDescription: string;
  cheapVps: string;
  cheapVpsDescription: string;
  categoriesTitle: string;
  searchHref: string;
  searchLabel: string;
  knowledgeHref?: string;
  knowledgeLabel?: string;
  errorLabel: string;
  errorDescription: string;
  navigationTitle: string;
  articleCategories: string;
};

export const headerCopy: Record<PublicLanguage, HeaderCopy> = {
  zh: {
    homeLabel: "服务器GO Cloud Infra Research",
    languageLabel: "English",
    dealsTitle: "服务器比价",
    allOffers: "全部套餐",
    allOffersDescription: "按价格、地区、线路和状态集中筛选服务器套餐。",
    hongKong: "香港服务器",
    hongKongDescription: "香港 VPS、云服务器、CN2、CMI 和低延迟线路。",
    unitedStates: "美国服务器",
    unitedStatesDescription: "美国 VPS、独立服务器、大带宽和外贸建站套餐。",
    cheapVps: "便宜 VPS",
    cheapVpsDescription: "低价 VPS、月付优惠和适合测试的轻量套餐。",
    categoriesTitle: "套餐专题",
    searchHref: "/search",
    searchLabel: "搜索",
    knowledgeHref: "/knowledge",
    knowledgeLabel: "知识库",
    errorLabel: "分类暂不可用",
    errorDescription: "分类暂时加载失败，可以先进入服务器比价或稍后刷新页面。",
    navigationTitle: "导航",
    articleCategories: "服务器分类",
  },
  en: {
    homeLabel: "fwqgo Cloud Infra Research",
    languageLabel: "中文",
    dealsTitle: "Server deals",
    allOffers: "All offers",
    allOffersDescription:
      "Filter server offers by price, region, line, and status.",
    hongKong: "Hong Kong servers",
    hongKongDescription:
      "Hong Kong VPS, cloud servers, CN2, CMI, and low-latency lines.",
    unitedStates: "US servers",
    unitedStatesDescription:
      "US VPS, dedicated servers, bandwidth deals, and hosting offers.",
    cheapVps: "Cheap VPS",
    cheapVpsDescription:
      "Low-cost VPS plans, monthly deals, and lightweight test servers.",
    categoriesTitle: "Offer topics",
    searchHref: "/search?lang=en",
    searchLabel: "Search",
    knowledgeHref: "/en/knowledge",
    knowledgeLabel: "Knowledge Base",
    errorLabel: "Categories unavailable",
    errorDescription:
      "Categories failed to load. You can open server deals or refresh later.",
    navigationTitle: "Navigation",
    articleCategories: "Article categories",
  },
};
