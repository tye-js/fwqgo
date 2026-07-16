export const SERVER_OFFER_KINDS = ["regular", "promotion"] as const;

export type ServerOfferKind = (typeof SERVER_OFFER_KINDS)[number];

export function isServerOfferKind(value: unknown): value is ServerOfferKind {
  return (
    typeof value === "string" &&
    SERVER_OFFER_KINDS.includes(value as ServerOfferKind)
  );
}
