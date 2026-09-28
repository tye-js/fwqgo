export type LocalizableServerRegion = {
  /** 抓取来的地区原文，可能是中文（「美国」「荷兰」「德国」…）。 */
  region: string | null;
  /** 地区字典（`server_regions`）里的英文名，由 `serverOfferPublicSelect()` 提供。 */
  regionEnName?: string | null;
};

/**
 * 套餐的地区**展示**标签。
 *
 * ## 为什么要这个函数
 *
 * `server_offers.region` 是抓取原文：线上 1197 条里有 231 条是中文。英文页此前直接渲染
 * 原文，于是英文文章/列表页的套餐卡片与侧栏 chip 上出现中文地区名。
 * 这些套餐绝大多数已通过 `regionId` 归到 `server_regions`，字典同时有 `name` 与 `enName`，
 * 所以英文侧优先用 `enName`，字典没填（或只有空白）才回落原文。中文侧始终用原文。
 *
 * ## 只用于展示，不要用来拼 URL
 *
 * `/servers?query=` 的筛选按**字典名或原文**匹配（见 `public-inventory-query.ts`），
 * 英文名匹配不到任何套餐。所以跳转链接必须继续用 `offer.region` 原文，
 * 只有屏幕上的文字换成英文名。
 */
export function publicRegionLabel(
  offer: LocalizableServerRegion,
  language: "zh" | "en",
) {
  if (language !== "en") return offer.region;
  const englishName = offer.regionEnName?.trim();
  if (!englishName) return offer.region;
  return englishName;
}
