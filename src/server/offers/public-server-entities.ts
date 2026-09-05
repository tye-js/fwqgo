import { and, eq } from "drizzle-orm";

import { readDb } from "@fwqgo/db";
import {
  affServiceProviders,
  serverNetworkLines,
  serverOffers,
  serverRegions,
} from "@fwqgo/db/schema";
import { resolveServerEntity } from "@fwqgo/core/server-entity";
import { publicPurchasableOfferBaseWhere } from "./public-offer-policy";

export async function resolvePublicServerEntity(
  kind: "provider" | "region" | "line",
  value: string,
) {
  if (kind === "provider") {
    const entities = await readDb
      .select({
        id: affServiceProviders.id,
        slug: affServiceProviders.slug,
        name: affServiceProviders.name,
        aliases: affServiceProviders.aliases,
      })
      .from(affServiceProviders);
    return resolveServerEntity(entities, value);
  }
  const table = kind === "region" ? serverRegions : serverNetworkLines;
  const entities = await readDb
    .select({
      id: table.id,
      slug: table.slug,
      name: table.name,
      enName: table.enName,
      aliases: table.aliases,
    })
    .from(table)
    .where(eq(table.active, true));
  return resolveServerEntity(entities, value);
}

export async function loadPublicServerCollectionIdentity(
  kind: "provider" | "region" | "line",
  value: string,
) {
  const entity = await resolvePublicServerEntity(kind, value);
  if (!entity) return null;
  const column =
    kind === "provider"
      ? serverOffers.providerId
      : kind === "region"
        ? serverOffers.regionId
        : serverOffers.lineId;
  const [offer] = await readDb
    .select({ id: serverOffers.id })
    .from(serverOffers)
    .where(and(eq(column, entity.id), publicPurchasableOfferBaseWhere()))
    .limit(1);
  return offer ? entity : null;
}
