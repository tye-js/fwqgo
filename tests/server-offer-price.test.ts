import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMonthlyPriceUsd,
  getServerOfferTermMonths,
  normalizeServerOfferBillingCycle,
} from "../packages/core/server-offer-price";

void test("normalizes supported server offer billing cycles", () => {
  assert.equal(normalizeServerOfferBillingCycle("YEARLY"), "yearly");
  assert.equal(normalizeServerOfferBillingCycle("unknown"), "monthly");
  assert.equal(getServerOfferTermMonths("triennial"), 36);
});

void test("calculates comparable monthly USD prices", () => {
  assert.equal(
    calculateMonthlyPriceUsd({
      amount: "72",
      currency: "CNY",
      billingCycle: "monthly",
      cnyPerUsd: 7.2,
    }),
    10,
  );
  assert.equal(
    calculateMonthlyPriceUsd({
      amount: "120",
      currency: "USD",
      billingCycle: "yearly",
    }),
    10,
  );
  assert.equal(
    calculateMonthlyPriceUsd({
      amount: "invalid",
      currency: "USD",
      billingCycle: "monthly",
    }),
    null,
  );
});
