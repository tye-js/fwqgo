import assert from "node:assert/strict";
import test from "node:test";
import { load, type CheerioAPI } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildPublicInventoryHref,
  parsePublicInventoryFilters,
  type PublicInventorySearchParams,
} from "@fwqgo/core/public-inventory-filters";
import {
  ServerInventoryProviderNav,
  ServerInventoryToolbar,
} from "@/features/public/components/server-inventory-filters";
import type { PublicInventoryFacets } from "@/server/offers/public-inventory-query";

const facets: PublicInventoryFacets = {
  providers: [{ key: "alpha", label: "Alpha", count: 3 }],
  groups: [{ key: "入门 VPS", label: "入门 VPS", count: 2 }],
  regions: [{ key: "hong-kong", label: "香港", count: 2 }],
  lines: [{ key: "cn2-gia", label: "CN2 GIA", count: 1 }],
  features: [{ key: "ipv6", label: "IPv6", count: 1 }],
};

function renderToolbar(input: PublicInventorySearchParams = {}) {
  return load(
    renderToStaticMarkup(
      <ServerInventoryToolbar
        facets={facets}
        filters={parsePublicInventoryFilters(input)}
      />,
    ),
  );
}

/** Read successful native controls from the rendered GET form. */
function formParams($: CheerioAPI) {
  const params = new URLSearchParams();
  $("form input[name]:not([disabled]), form select[name]:not([disabled])").each(
    (_, element) => {
      const control = $(element);
      const name = control.attr("name")!;
      const value = control.is("input")
        ? (control.attr("value") ?? "")
        : control.val();
      assert.equal(params.has(name), false, `Duplicate form control: ${name}`);
      assert.equal(typeof value, "string", `Unsubmittable control: ${name}`);
      params.set(name, value as string);
    },
  );
  return params;
}

function filtersFromHref(href: string) {
  const url = new URL(href, "https://fwqgo.test");
  assert.equal(url.pathname, "/servers");
  return parsePublicInventoryFilters(Object.fromEntries(url.searchParams));
}

void test("inventory controls render a usable GET form before client hydration", () => {
  const $ = renderToolbar();
  assert.equal($("form").length, 1);
  assert.equal($("form").attr("action"), "/servers");
  assert.equal($("form").attr("method"), "get");
  assert.equal($('button[type="submit"]').length, 2);
  assert.equal($("form [disabled]").length, 0);
  assert.equal($("form form").length, 0);
  assert.equal($('select[name="stock"] option[selected]').text(), "有货");
  assert.equal(
    $('select[name="provider"] option[selected]').text(),
    "全部厂商",
  );
  assert.deepEqual(
    [...formParams($).keys()].sort(),
    [
      "q",
      "kind",
      "provider",
      "stock",
      "group",
      "sort",
      "region",
      "line",
      "feature",
      "promo",
      "minPrice",
      "maxPrice",
    ].sort(),
  );
  $("select").each((_, select) => assert.ok($(select).attr("aria-label")));
  assert.deepEqual(
    parsePublicInventoryFilters(Object.fromEntries(formParams($))),
    parsePublicInventoryFilters({}),
  );
});

void test("combined filters survive form submission while the old cursor is cleared", () => {
  const input = {
    q: "香港 & CN2",
    kind: "promotion",
    provider: "alpha",
    group: "入门 VPS",
    stock: "all",
    check: "failed",
    region: "hong-kong",
    line: "cn2-gia",
    feature: "ipv6",
    promo: "with",
    minPrice: "0",
    maxPrice: "3",
    sort: "price-desc",
    cursor: "old-page-cursor",
  };
  const $ = renderToolbar(input);
  const submitted = formParams($);
  assert.equal(submitted.has("cursor"), false);
  assert.equal($("details").is("[open]"), true);
  assert.deepEqual(parsePublicInventoryFilters(Object.fromEntries(submitted)), {
    ...parsePublicInventoryFilters(input),
    cursor: "",
  });
});

void test("an active facet outside the cached options is preserved on the next search", () => {
  const input = {
    provider: "商家 A&B",
    group: "未列出的组",
    region: "新地区",
    line: "新线路",
    feature: "new-feature",
  };
  const submitted = formParams(renderToolbar(input));
  for (const [key, value] of Object.entries(input))
    assert.equal(submitted.get(key), value);
});

void test("advanced filters and price boundaries remain visible in a refreshed page", () => {
  assert.equal(renderToolbar()("details").is("[open]"), false);
  for (const input of [
    { region: "hong-kong" },
    { line: "cn2-gia" },
    { feature: "ipv6" },
    { promo: "without" },
    { minPrice: "0" },
    { maxPrice: "3" },
    { kind: "promotion", check: "failed" },
  ])
    assert.equal(renderToolbar(input)("details").is("[open]"), true);
  const prices = formParams(renderToolbar({ minPrice: "30", maxPrice: "5" }));
  assert.equal(prices.get("minPrice"), "5");
  assert.equal(prices.get("maxPrice"), "30");
});

void test("canonical URLs preserve every filter, Unicode and zero-valued prices", () => {
  assert.equal(
    buildPublicInventoryHref(parsePublicInventoryFilters({})),
    "/servers",
  );
  const filters = parsePublicInventoryFilters({
    q: "香港 & CN2/回程",
    kind: "promotion",
    provider: "商家 & Co",
    group: "入门 VPS",
    stock: "all",
    check: "ok",
    region: "香港",
    line: "cn2-gia",
    feature: "ipv6",
    promo: "with",
    minPrice: "0",
    maxPrice: "3.5",
    sort: "price-desc",
    cursor: "next-page-cursor",
  });
  assert.deepEqual(filtersFromHref(buildPublicInventoryHref(filters)), filters);
});

void test("provider and kind links preserve other filters and reset pagination", () => {
  const filters = parsePublicInventoryFilters({
    kind: "promotion",
    provider: "missing-provider",
    region: "hong-kong",
    minPrice: "0",
    maxPrice: "3",
    stock: "all",
    sort: "latest",
    check: "failed",
    cursor: "old-cursor",
  });
  const $ = load(
    renderToStaticMarkup(
      <ServerInventoryProviderNav facets={facets} filters={filters} />,
    ),
  );
  const providerHref = $("nav a").last().attr("href")!;
  assert.deepEqual(filtersFromHref(providerHref), {
    ...filters,
    provider: "alpha",
    cursor: "",
  });
  assert.deepEqual(filtersFromHref($("nav a").first().attr("href")!), {
    ...filters,
    provider: "all",
    cursor: "",
  });

  const toolbar = renderToolbar(
    Object.fromEntries(
      new URL(buildPublicInventoryHref(filters), "https://fwqgo.test")
        .searchParams,
    ),
  );
  const regularHref = toolbar('nav[aria-label="套餐属性"] a')
    .first()
    .attr("href")!;
  assert.deepEqual(filtersFromHref(regularHref), {
    ...filters,
    kind: "regular",
    check: "all",
    cursor: "",
  });
  const resetHref = toolbar("a")
    .filter((_, element) => toolbar(element).text().trim() === "重置")
    .attr("href")!;
  assert.deepEqual(filtersFromHref(resetHref), parsePublicInventoryFilters({}));
});
