import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAffiliateReports,
  repairMarkdownAffiliateLinks,
  type AffiliateRewriteMatch,
  type AffiliateRewriteReport,
} from "@fwqgo/scrape/affiliate-link-rewriter";

function match(overrides: Partial<AffiliateRewriteMatch> = {}) {
  return {
    originalHref: "https://merchant.example/go/source",
    resolvedHref: "https://merchant.example/buy?plan=1",
    finalHref: "https://merchant.example/buy?plan=1&aff=fwqgo",
    matchedDomain: "merchant.example",
    providerName: "示例商家",
    affParam: "aff",
    affValue: "fwqgo",
    mode: "param" as const,
    ...overrides,
  } satisfies AffiliateRewriteMatch;
}

function report(matches: AffiliateRewriteMatch[]): AffiliateRewriteReport {
  return {
    totalLinks: matches.length,
    internalLinksRemoved: 0,
    matchedLinks: matches,
    unmatchedLinks: [],
    invalidLinks: [],
  };
}

void test("repairs a matched affiliate URL without replacing a descriptive label", () => {
  const markdown = repairMarkdownAffiliateLinks(
    "[香港 CN2 套餐](https://merchant.example/buy?plan=1)",
    report([match()]),
  );

  assert.equal(
    markdown,
    "[香港 CN2 套餐](https://merchant.example/buy?plan=1&aff=fwqgo)",
  );
});

void test("replaces only generic link labels with the provider name", () => {
  const markdown = repairMarkdownAffiliateLinks(
    "[链接](https://merchant.example/buy?plan=1)",
    report([match()]),
  );

  assert.equal(
    markdown,
    "[示例商家](https://merchant.example/buy?plan=1&aff=fwqgo)",
  );
});

void test("keeps unmatched external links unchanged", () => {
  const original = "[产品文档](https://docs.example/product)";
  assert.equal(
    repairMarkdownAffiliateLinks(original, report([match()])),
    original,
  );
});

void test("does not guess when one host has multiple possible final affiliate URLs", () => {
  const original = "[购买](https://merchant.example/new-plan)";
  const result = repairMarkdownAffiliateLinks(
    original,
    report([
      match(),
      match({
        originalHref: "https://merchant.example/go/other",
        resolvedHref: "https://merchant.example/buy?plan=2",
        finalHref: "https://merchant.example/buy?plan=2&aff=fwqgo",
      }),
    ]),
  );

  assert.equal(result, original);
});

void test("merges rewrite reports without losing misses or invalid links", () => {
  const merged = mergeAffiliateReports([
    report([match()]),
    {
      totalLinks: 2,
      internalLinksRemoved: 1,
      matchedLinks: [],
      unmatchedLinks: [
        {
          href: "https://unknown.example",
          host: "unknown.example",
          reason: "no-provider",
        },
      ],
      invalidLinks: [{ href: "::bad", host: null, reason: "invalid-url" }],
    },
  ]);

  assert.equal(merged.totalLinks, 3);
  assert.equal(merged.internalLinksRemoved, 1);
  assert.equal(merged.matchedLinks.length, 1);
  assert.equal(merged.unmatchedLinks.length, 1);
  assert.equal(merged.invalidLinks.length, 1);
});
