import { and, eq, isNotNull, sql } from "drizzle-orm";
import { serverOffers } from "@fwqgo/db/schema";

export function publicPurchasableOfferBaseWhere() {
  return and(
    eq(serverOffers.visible, true),
    isNotNull(serverOffers.priceAmount),
    sql`nullif(trim(${serverOffers.purchaseUrl}), '') is not null`,
  );
}
