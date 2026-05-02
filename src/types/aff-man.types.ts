import { type affServiceProviders } from "@/server/db/schema";

type AffServiceProvider = typeof affServiceProviders.$inferSelect;

export type AffManData = Pick<
  AffServiceProvider,
  "id" | "name" | "affUrl" | "affParam" | "affValue" | "officialUrl"
>;
