/**
 * 公开侧看到的套餐库存状态。
 *
 * 数据库里的 `server_offers.status` 有五个取值，公开界面只暴露用户能据此做决定的三档，
 * 另外两个不单独出现：
 *
 * - 停售（discontinued）：已经买不到，公开侧不收录——不在筛选项里，也不进入结果集
 *   （见 `src/server/offers/public-inventory-query.ts` 的 `publicInventoryAvailableWhere`），
 *   只在 CMS 保留。
 * - 补货中（restocking）：仍然可以下单，对用户就是有货。
 *
 * 有货与补货中的合并规则在这里定义一次，SQL 侧筛选（`SERVER_OFFER_IN_STOCK_STATUSES`）
 * 和界面侧标签（`resolvePublicServerOfferStatus`）都从这里取，避免各层各写一遍。
 */
export const PUBLIC_SERVER_OFFER_STATUSES = [
  "in_stock",
  "out_of_stock",
  "preorder",
] as const;

export type PublicServerOfferStatus =
  (typeof PUBLIC_SERVER_OFFER_STATUSES)[number];

/** 「有货」在数据层对应的取值：补货中依然可买，所以有货要同时命中这两个状态。 */
export const SERVER_OFFER_IN_STOCK_STATUSES: Array<"in_stock" | "restocking"> =
  ["in_stock", "restocking"];

/** 把数据层状态归一到公开状态：补货中按有货呈现，其余原样返回。 */
export function resolvePublicServerOfferStatus(status: string) {
  return status === "restocking" ? "in_stock" : status;
}

/** 公开侧是否算「有货」。统计口径和标签口径共用它，避免各处自己比 `=== "in_stock"`。 */
export function isPublicInStock(status: string) {
  return resolvePublicServerOfferStatus(status) === "in_stock";
}

/**
 * 行内状态标签：先把数据层状态归一到公开状态，再从给定标签表里取文案，
 * 表里没有就回退归一后的值，不静默改写未知状态。
 */
export function publicOfferStatusLabel(
  labels: Record<string, string | undefined>,
  status: string,
) {
  const resolved = resolvePublicServerOfferStatus(status);
  return labels[resolved] ?? resolved;
}

/**
 * schema.org 的可用性取值。
 *
 * 结构化数据按公开状态上报：补货中仍然可以下单，就是 InStock——否则搜索结果的
 * 富摘要会把还能买的套餐说成缺货。
 */
export function resolveServerOfferAvailability(status: string) {
  const resolved = resolvePublicServerOfferStatus(status);

  if (resolved === "in_stock") return "https://schema.org/InStock";
  if (resolved === "preorder") return "https://schema.org/PreOrder";
  return "https://schema.org/OutOfStock";
}
