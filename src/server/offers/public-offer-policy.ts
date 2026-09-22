import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { serverOffers } from "@fwqgo/db/schema";

/**
 * 停售套餐不进入公开查询。
 *
 * 停售（discontinued）是采集侧连续缺失后写入的终态标记，这类套餐已经买不到：
 * 展示它们只会把用户送到失效入口，也会让「有货数量」「收录数量」这类统计虚高。
 * 它是公开查询的共同底线，所以在这里定义一次，专题、集合、搜索、相关套餐、
 * 库存工具和实体解析都从这一处取。
 */
export function publicOfferAvailableStatusWhere() {
  return ne(serverOffers.status, "discontinued");
}

/** 公开可购买套餐的底线：可见、有价格、有购买入口，且没有停售。 */
export function publicPurchasableOfferBaseWhere() {
  return and(
    eq(serverOffers.visible, true),
    isNotNull(serverOffers.priceAmount),
    sql`nullif(trim(${serverOffers.purchaseUrl}), '') is not null`,
    publicOfferAvailableStatusWhere(),
  );
}
