import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";

/** @typedef {import('puppeteer').Page} Page */

/** @param {Page} page @param {string} pathname @param {number} width */
export async function captureHomepage(page, pathname, width) {
  const directory = process.env.MOBILE_SMOKE_SCREENSHOT_DIR;
  if (!directory || ![375, 1440].includes(width)) return;
  mkdirSync(directory, { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), theme === "dark");
    await page.screenshot({ path: path.join(directory, `${pathname === "/en" ? "en" : "zh"}-${width}-${theme}.png`), fullPage: true });
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

/** @param {Page} page @param {string} origin */
export async function checkHomepageInteractions(page, origin) {
  for (const pathname of ["/", "/en"]) {
    const raw = await fetch(`${origin}${pathname}`);
    assert.equal(raw.status, 200);
    const $ = load(await raw.text());
    assert.equal($("main h1").length, 1);
    assert.ok($('[data-testid="home-feed"] h3').length > 0, "Raw HTML must contain saved article titles");
    assert.ok($('[data-testid="home-feed"] p').length > 0, "Raw HTML must contain saved descriptions");
    assert.equal($('head link[rel="canonical"]').length, 1);
    assert.ok($('head link[hreflang="en"]').length > 0);
    assert.ok($('script[type="application/ld+json"]').length > 0);
    const rsc = await fetch(`${origin}${pathname}?_rsc=homepage-smoke`, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } });
    assert.doesNotMatch(rsc.headers.get("cache-control") ?? "", /(?:^|,)\s*public\b|s-maxage/i);

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${origin}${pathname}`, { waitUntil: "networkidle2" });
    // Actual clicks retain PublicLink's new-tab contract.
    for (const kind of ["regions", "lines"]) {
      const selector = `[data-topic-kind="${kind}"] a`;
      const link = await page.$(selector);
      assert.ok(link, `${pathname} representative data must include ${kind}`);
      const href = await link.evaluate(node => node.getAttribute("href"));
      assert.ok(href);
      const destination = await fetch(new URL(href, origin));
      assert.equal(destination.status, 200, `Qualified topic ${href} must resolve`);
      const targetPromise = page.browser().waitForTarget(target => target.opener() === page.target(), { timeout: 15_000 });
      await link.click();
      const popup = await (await targetPromise).page();
      assert.ok(popup);
      try {
        await popup.waitForSelector("main h1", { timeout: 30_000 });
        assert.equal(new URL(popup.url()).pathname, new URL(href, origin).pathname);
      } finally { await popup.close(); }
    }
    await page.bringToFront();
    const summary = await page.$("header details summary");
    assert.ok(summary);
    await page.waitForFunction(() => {
      const details = document.querySelector("header details");
      return details && Object.keys(details).some(key => key.startsWith("__reactProps"));
    });
    await summary.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector("header details[open]");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("header details[open]"));
    await summary.click();
    await page.waitForSelector("header details[open]");
    await page.click("main h1");
    await page.waitForFunction(() => !document.querySelector("header details[open]"));
  }

  await page.setViewport({ width: 375, height: 812 });
  await page.goto(origin, { waitUntil: "networkidle2" });
  await page.click('main button[type="submit"]');
  await page.waitForSelector("#hero-tag-search-error");
  assert.equal(new URL(page.url()).pathname, "/");
  await page.type("#hero-tag-search", "CN2 GIA");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname.startsWith("/fwq/tags/"));
  assert.equal(new URL(page.url()).pathname, "/fwq/tags/cn2-gia/page/1");

  await page.goto(origin, { waitUntil: "networkidle2" });
  await page.setRequestInterception(true);
  /** @param {import('puppeteer').HTTPRequest} request */
  const failTagLookup = request => {
    if (new URL(request.url()).pathname === "/api/tags/search") void request.abort();
    else void request.continue();
  };
  page.on("request", failTagLookup);
  try {
    await page.type("#hero-tag-search", "homepage-query-fallback");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => location.pathname === "/search");
    assert.equal(new URL(page.url()).searchParams.get("q"), "homepage-query-fallback");
  } finally {
    page.off("request", failTagLookup);
    await page.setRequestInterception(false);
  }
  await page.goto(`${origin}/en`, { waitUntil: "networkidle2" });
  await page.type('main input[name="q"]', "CN2 GIA");
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.keyboard.press("Enter")]);
  assert.equal(new URL(page.url()).pathname, "/search");
  assert.equal(new URL(page.url()).searchParams.get("lang"), "en");
  assert.equal(new URL(page.url()).searchParams.get("q"), "CN2 GIA");
  console.log("Homepage interactions passed: raw HTML, metadata, RSC policy, bilingual topic clicks, keyboard dropdown dismissal, Chinese tag search and failure fallback, English native search.");
}
