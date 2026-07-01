import { type affServiceProviders } from "@fwqgo/db/schema";

type AffServiceProvider = typeof affServiceProviders.$inferSelect;

export type AffManData = Pick<
  AffServiceProvider,
  "id" | "name" | "affUrl" | "affParam" | "affValue" | "officialUrl"
>;
