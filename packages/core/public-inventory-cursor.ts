import type { PublicInventorySort } from "./public-inventory-filters";

const MAX_CURSOR_LENGTH = 512;
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const MAX_MONTHLY_PRICE_USD = 9_999_999_999.9999;
const CANONICAL_ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CANONICAL_PRICE = /^\d{1,10}(?:\.\d{1,4})?$/;

export type PublicInventoryCursor =
  | {
      sort: "latest";
      id: number;
      date: string;
    }
  | {
      sort: Exclude<PublicInventorySort, "latest">;
      id: number;
      price: string | null;
    };

function isCursorId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_POSTGRES_INTEGER
  );
}

function isCursorDate(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_ISO_DATE.test(value)) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isCursorPrice(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !CANONICAL_PRICE.test(value)) return false;

  const amount = Number(value);
  return (
    Number.isFinite(amount) && amount >= 0 && amount <= MAX_MONTHLY_PRICE_USD
  );
}

export function encodePublicInventoryCursor(cursor: PublicInventoryCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodePublicInventoryCursor(
  value: string,
  expectedSort: PublicInventorySort,
): PublicInventoryCursor | null {
  if (!value || value.length > MAX_CURSOR_LENGTH) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const cursor = parsed as Record<string, unknown>;
    if (cursor.sort !== expectedSort || !isCursorId(cursor.id)) return null;

    if (cursor.sort === "latest") {
      return isCursorDate(cursor.date)
        ? { sort: "latest", id: cursor.id, date: cursor.date }
        : null;
    }

    if (
      (cursor.sort !== "price-asc" && cursor.sort !== "price-desc") ||
      !Object.hasOwn(cursor, "price") ||
      !isCursorPrice(cursor.price)
    ) {
      return null;
    }

    return { sort: cursor.sort, id: cursor.id, price: cursor.price };
  } catch {
    return null;
  }
}
