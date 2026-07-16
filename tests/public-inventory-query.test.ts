import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregatePublicInventoryFacets,
  normalizeServerCollectionSlug,
  parsePublicInventoryFilters,
} from "@fwqgo/core/public-inventory-filters";

void test("inventory filters preserve valid fields when one field is invalid", () => {
  const filters = parsePublicInventoryFilters({
    provider: "racknerd",
    region: "united-states",
    stock: "invalid",
    maxPrice: "12.5",
  });

  assert.equal(filters.provider, "racknerd");
  assert.equal(filters.region, "united-states");
  assert.equal(filters.stock, "in_stock");
  assert.equal(filters.maxPrice, 12.5);
});

void test("inventory defaults to regular offers and accepts promotion mode", () => {
  assert.equal(parsePublicInventoryFilters({}).kind, "regular");
  assert.equal(
    parsePublicInventoryFilters({ kind: "promotion" }).kind,
    "promotion",
  );
  assert.equal(parsePublicInventoryFilters({ kind: "invalid" }).kind, "regular");
});

void test("inventory filters normalize an inverted price range", () => {
  const filters = parsePublicInventoryFilters({
    minPrice: "30",
    maxPrice: "5",
  });

  assert.equal(filters.minPrice, 5);
  assert.equal(filters.maxPrice, 30);
});

void test("inventory filters use the first repeated URL value and fixed page size", () => {
  const filters = parsePublicInventoryFilters({
    provider: ["first-provider", "ignored-provider"],
    limit: "500",
  });

  assert.equal(filters.provider, "first-provider");
  assert.equal("limit" in filters, false);
});

void test("inventory facets merge legacy labels that resolve to one canonical key", () => {
  const facets = aggregatePublicInventoryFacets(
    [
      { key: "racknerd", label: "RackNerd", count: 12 },
      { key: "racknerd", label: "Rack Nerd", count: "8" },
      { key: "dmit", label: "DMIT", count: 4 },
    ],
    20,
  );

  assert.deepEqual(facets, [
    { key: "racknerd", label: "RackNerd", count: 20 },
    { key: "dmit", label: "DMIT", count: 4 },
  ]);
});

void test("server collection slug rejects oversized and path-like cache keys", () => {
  assert.equal(normalizeServerCollectionSlug("hong-kong"), "hong-kong");
  assert.equal(
    normalizeServerCollectionSlug(encodeURIComponent("香港服务器")),
    "香港服务器",
  );
  assert.equal(normalizeServerCollectionSlug("a".repeat(161)), null);
  assert.equal(normalizeServerCollectionSlug("region%2Fchild"), null);
  assert.equal(normalizeServerCollectionSlug("bad%ZZslug"), null);
});
