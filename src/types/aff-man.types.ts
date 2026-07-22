import { type affServiceProviders } from "@fwqgo/db/schema";

type AffServiceProvider = typeof affServiceProviders.$inferSelect;

export type AffManData = Pick<
  AffServiceProvider,
  "id" | "name" | "affUrl" | "affParam" | "affValue" | "officialUrl"
>;

export type ProviderProfileSnapshotStatus =
  | "queued"
  | "running"
  | "pending"
  | "applied"
  | "rejected"
  | "failed";

export type ProviderPromoCodeData = {
  id: number;
  providerId: number;
  code: string;
  description: string | null;
  discountText: string | null;
  terms: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  isDefault: boolean;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type ProviderProfileSnapshotData = {
  id: number;
  providerId: number;
  status: ProviderProfileSnapshotStatus;
  summary: string | null;
  summarySourceUrl: string | null;
  refundPolicy: string | null;
  refundPolicySourceUrl: string | null;
  prohibitedUses: string | null;
  prohibitedUsesSourceUrl: string | null;
  discoveredUrls: string[];
  error: string | null;
  fetchedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type AffProviderTableData = AffManData & {
  summary: string | null;
  summarySourceUrl: string | null;
  refundPolicy: string | null;
  refundPolicySourceUrl: string | null;
  prohibitedUses: string | null;
  prohibitedUsesSourceUrl: string | null;
  profileVerifiedAt: string | null;
  profileUpdatedAt: string | null;
  promoCodes: ProviderPromoCodeData[];
  latestSnapshot: ProviderProfileSnapshotData | null;
};
