/**
 * 套餐表格的中英文文案。
 *
 * 从 `server-offer-table.tsx` 拆出来：那份文件已经在 P1-2 的待拆分名单里，
 * 体积守卫（`scripts/verify-client-component-size.ts`）只允许它变小。文案是
 * 纯数据、没有组件依赖，拆走它最省事也最安全。
 */

export type OfferLanguage = "zh" | "en";

const tableCopy = {
  zh: {
    status: {
      in_stock: "有货",
      out_of_stock: "没货",
      discontinued: "停售",
      preorder: "预售",
    },
    billingCycle: {
      monthly: "月付",
      quarterly: "季付",
      semiannual: "半年",
      yearly: "年付",
    },
    missingPrice: "待补充",
    invalidPrice: "待确认",
    unknownCycle: "周期待确认",
    notChecked: "未核验",
    buy: "购买",
    source: "来源",
    review: "测评",
    promoCode: "优惠码",
    price: "价格",
    regionLine: "地区 / 线路",
    regionMissing: "地区待补充",
    lineMissing: "线路待补充",
    dataStatus: "数据状态",
    lastChecked: "最近核验",
    validUntil: "有效期至",
    specs: "配置",
    specsMissing: "配置待补充",
    emptyTitle: "暂无结构化套餐",
    emptyDescription: "供应商官网采集或人工补充后，套餐会显示在这里。",
    filterTitle: "筛选套餐",
    showing: (shown: number, total: number) => `显示 ${shown} / ${total}`,
    searchPlaceholder: "搜索套餐、地区、线路、优惠码",
    // 搜索框只有 placeholder，没有可访问名称（placeholder 不算 label，WCAG 4.1.2）。
    // 这里给一个说明用途的短标签，placeholder 继续当提示用。
    searchLabel: "搜索套餐",
    provider: "商家",
    allProviders: "全部商家",
    statusFilter: "状态",
    allStatuses: "全部状态",
    region: "地区",
    allRegions: "全部地区",
    line: "线路",
    allLines: "全部线路",
    sort: "排序",
    priceAsc: "价格从低到高",
    priceDesc: "价格从高到低",
    latest: "最新优先",
    promotion: "优惠码",
    allPromotions: "全部优惠",
    withPromotion: "有优惠码",
    withoutPromotion: "无优惠码",
    currentShowing: (shown: number, total: number) =>
      `当前显示 ${shown} / ${total} 个套餐`,
    noMatchTitle: "没有匹配的套餐",
    noMatchDescription: "试试减少筛选条件，或改用地区、线路、商家关键词搜索。",
    package: "套餐",
    regionLineHeader: "地区/线路",
    entry: "入口",
    sortLabel: (value: string) => value,
  },
  en: {
    status: {
      in_stock: "In stock",
      out_of_stock: "Out of stock",
      discontinued: "Discontinued",
      preorder: "Pre-order",
    },
    billingCycle: {
      monthly: "Monthly",
      quarterly: "Quarterly",
      semiannual: "Semiannual",
      yearly: "Yearly",
    },
    missingPrice: "Not provided",
    invalidPrice: "Needs review",
    unknownCycle: "Billing cycle unavailable",
    notChecked: "Not checked",
    buy: "Buy",
    source: "Source",
    review: "Review",
    promoCode: "Promo code",
    price: "Price",
    regionLine: "Region / route",
    regionMissing: "Region unavailable",
    lineMissing: "Route unavailable",
    dataStatus: "Data status",
    lastChecked: "Last checked",
    validUntil: "Valid until",
    specs: "Specifications",
    specsMissing: "Specifications unavailable",
    emptyTitle: "No structured offers",
    emptyDescription:
      "Offers will appear here after supplier collection or manual entry.",
    filterTitle: "Filter offers",
    showing: (shown: number, total: number) => `Showing ${shown} / ${total}`,
    searchPlaceholder: "Search offers, regions, routes, or promo codes",
    searchLabel: "Search offers",
    provider: "Provider",
    allProviders: "All providers",
    statusFilter: "Status",
    allStatuses: "All statuses",
    region: "Region",
    allRegions: "All regions",
    line: "Route",
    allLines: "All routes",
    sort: "Sort",
    priceAsc: "Lowest price",
    priceDesc: "Highest price",
    latest: "Newest first",
    promotion: "Promo code",
    allPromotions: "All promotions",
    withPromotion: "With promo code",
    withoutPromotion: "Without promo code",
    currentShowing: (shown: number, total: number) =>
      `Showing ${shown} / ${total} offers`,
    noMatchTitle: "No matching offers",
    noMatchDescription:
      "Try fewer filters, or search by provider, region, or route.",
    package: "Offer",
    regionLineHeader: "Region / route",
    entry: "Actions",
    sortLabel: (value: string) => value,
  },
} as const;

export function getTableCopy(language: OfferLanguage) {
  return tableCopy[language];
}
