import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSitemapLastmod,
  renderSitemapLastmod,
} from "../packages/core/sitemap-lastmod";

void test("formats valid sitemap dates as stable ISO timestamps", () => {
  const expected = "2026-07-16T08:30:00.000Z";

  assert.equal(formatSitemapLastmod(new Date(expected)), expected);
  assert.equal(formatSitemapLastmod(expected), expected);
  assert.equal(formatSitemapLastmod(Date.parse(expected)), expected);
  assert.equal(
    renderSitemapLastmod(expected),
    `<lastmod>${expected}</lastmod>`,
  );
});

void test("omits sitemap lastmod when no trustworthy date exists", () => {
  assert.equal(formatSitemapLastmod(null), null);
  assert.equal(formatSitemapLastmod(undefined), null);
  assert.equal(formatSitemapLastmod("not-a-date"), null);
  assert.equal(formatSitemapLastmod(new Date(Number.NaN)), null);
  assert.equal(renderSitemapLastmod(null), "");
  assert.equal(renderSitemapLastmod("not-a-date"), "");
});
