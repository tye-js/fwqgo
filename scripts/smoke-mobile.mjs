import assert from "node:assert/strict";
import puppeteer from "puppeteer";

/** @typedef {import('puppeteer').Page} Page */

const webOrigin = (process.env.MOBILE_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const cmsOrigin = (process.env.MOBILE_CMS_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const requireData = process.env.MOBILE_SMOKE_REQUIRE_DATA === "1";
const knowledgeOnly = process.env.MOBILE_SMOKE_SCOPE === "knowledge";
const inventoryOnly = process.env.MOBILE_SMOKE_SCOPE === "inventory";
/** @type {Array<[number, number]>} */
const viewports = [
  [320, 568],
  [375, 812],
  [390, 844],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1280, 800],
];

/** @param {Page} page @param {string} url @param {string} name @param {{expectInventory?: boolean}} [options] */
async function checkPage(page, url, name, { expectInventory = false } = {}) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
  const result = await page.evaluate(() => {
    const body = document.body;
    const overflowing = body.scrollWidth > window.innerWidth + 1;
    const regions = [...document.querySelectorAll("*")].filter(
      (node) => node.scrollWidth > node.clientWidth + 1,
    );
    const allowed = regions.every((node) =>
      node.matches(".cms-table-viewport, .cms-table-viewport *") ||
      (window.innerWidth >= 1280 && node.matches("#inventory-results .overflow-x-auto, #inventory-results .overflow-x-auto *")),
    );
    return {
      overflowing,
      allowed,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      touchTargets: [...document.querySelectorAll("a,button,[role=button],summary")]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .slice(0, 12)
        .map((node) => node.textContent?.trim().slice(0, 30) || node.tagName),
      inventoryCards: document.querySelectorAll("#inventory-results article").length,
    };
  });
  assert.equal(result.overflowing, false, `${name} overflows at ${result.viewport}`);
  assert.equal(result.allowed, true, `${name} has an unowned horizontal scroll region at ${result.viewport}`);
  if (expectInventory && requireData) {
    assert.ok(result.inventoryCards > 0, `${name} has no inventory cards at ${result.viewport}`);
  }
  return result;
}

/** @param {Page} page @param {string} selector @param {string} text */
async function clickText(page, selector, text) {
  for (const element of await page.$$(selector)) {
    if ((await element.evaluate((node) => node.textContent?.trim())) === text) {
      await element.click();
      return;
    }
  }
  throw new Error(`Missing ${selector}: ${text}`);
}

/** @param {Page} page @param {() => Promise<unknown>} action */
async function navigateInventory(page, action) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }),
    action(),
  ]);
  await page.waitForSelector('form[aria-label="筛选服务器套餐"]');
}

/** @param {Page} page */
async function checkInventoryFilters(page) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(`${webOrigin}/servers`, { waitUntil: "networkidle2", timeout: 30_000 });
  await page.waitForSelector('input[name="q"]');
  const initialCards = await page.$$eval("#inventory-results article", (cards) => cards.length);
  if (requireData) assert.ok(initialCards > 0, "Inventory interaction checks require offer data");

  const missingQuery = "__fwqgo_inventory_smoke_no_match__";
  await page.type('input[name="q"]', missingQuery);
  await navigateInventory(page, () => clickText(page, 'button[type="submit"]', "搜索"));
  assert.equal(new URL(page.url()).searchParams.get("q"), missingQuery);
  assert.match(await page.$eval("#inventory-results", (element) => element.textContent ?? ""), /没有匹配的库存套餐/);

  await navigateInventory(page, () => clickText(page, "a", "重置"));
  assert.equal(new URL(page.url()).search, "");
  assert.equal(await page.$eval('input[name="q"]', (input) => input.value), "");
  assert.equal(await page.$$eval("#inventory-results article", (cards) => cards.length), initialCards, "Reset must restore the unfiltered results");

  await navigateInventory(page, () => page.select('select[name="sort"]', "price-desc"));
  assert.equal(new URL(page.url()).searchParams.get("sort"), "price-desc");
  assert.equal(await page.$eval('select[name="sort"]', (select) => select.value), "price-desc");

  await page.click("form details > summary");
  await page.type('input[name="maxPrice"]', "3");
  await navigateInventory(page, () => clickText(page, 'button[type="submit"]', "应用价格"));
  assert.equal(new URL(page.url()).searchParams.get("maxPrice"), "3");
  assert.equal(new URL(page.url()).searchParams.get("sort"), "price-desc", "Price filtering must preserve sorting");
  const monthlyPrices = await page.$$eval("#inventory-results article", (cards) => cards.map((card) => {
    const match = /约 \$([\d.]+) \/ 月/.exec(card.textContent ?? "");
    return match ? Number(match[1]) : null;
  }));
  assert.ok(monthlyPrices.every((price) => price !== null && price <= 3), "The visible offers must respect the selected maximum price");
  assert.deepEqual(monthlyPrices, [...monthlyPrices].sort((a, b) => (b ?? 0) - (a ?? 0)), "The visible offers must respect descending price order");
  assert.equal(await page.$eval("form details", (element) => element.open), true, "More filters must stay open after applying a condition");
  await navigateInventory(page, () => clickText(page, "a", "重置"));
  assert.equal(new URL(page.url()).search, "");

  // Streaming HTML still needs its inline resume scripts; block only the
  // external hydration bundles to exercise native form submission.
  /** @param {import('puppeteer').HTTPRequest} request */
  function withoutHydration(request) {
    if (request.resourceType() === "script" && new URL(request.url()).pathname.startsWith("/_next/")) {
      void request.abort();
    } else {
      void request.continue();
    }
  }
  await page.setRequestInterception(true);
  page.on("request", withoutHydration);
  try {
    await page.reload({ waitUntil: "networkidle2" });
    await page.type('input[name="q"]', missingQuery);
    await navigateInventory(page, () => clickText(page, 'button[type="submit"]', "搜索"));
    assert.equal(new URL(page.url()).searchParams.get("q"), missingQuery);
    assert.match(await page.$eval("#inventory-results", (element) => element.textContent ?? ""), /没有匹配的库存套餐/);
  } finally {
    page.off("request", withoutHydration);
    await page.setRequestInterception(false);
  }
}

async function run() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
  } catch (error) {
    throw new Error(`真实视口未验证：Chromium 启动失败（${error instanceof Error ? error.message : String(error)}）`);
  }

  try {
    const page = await browser.newPage();
    /** @type {string[]} */
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydration|minified react error/i.test(message.text())) {
        browserErrors.push(message.text());
      }
    });
    for (const [width, height] of viewports) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      if (inventoryOnly) {
        await checkPage(page, `${webOrigin}/servers`, "服务器库存", { expectInventory: true });
        continue;
      }
      if (!knowledgeOnly) {
        await checkPage(page, `${webOrigin}/`, `公开首页`);
        await checkPage(page, `${webOrigin}/servers`, `服务器库存`, { expectInventory: true });
        await checkPage(page, `${webOrigin}/search?q=https%3A%2F%2Fexample.com%2Fuuid-123456789`, `搜索页`);
      }
      await checkPage(page, `${webOrigin}/knowledge`, "中文知识库");
      await checkPage(page, `${webOrigin}/en/knowledge`, "英文知识库");
    }

    if (inventoryOnly) {
      await checkInventoryFilters(page);
      assert.deepEqual(browserErrors, [], "Browser application/hydration errors occurred");
      console.log(`Mobile inventory smoke passed: ${viewports.length} viewports, search, reset, sorting, combined price filtering and overflow probes.`);
      return;
    }

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    for (const pathname of ["/knowledge", "/en/knowledge"]) {
      await page.goto(`${webOrigin}${pathname}`, { waitUntil: "networkidle2", timeout: 30_000 });
      const category = await page.$('main nav a[href*="category="]');
      if (requireData) assert.ok(category, `${pathname} has no category navigation`);
      if (category) {
        await category.click();
        await page.waitForFunction(() => new URLSearchParams(window.location.search).has("category"));
        await page.waitForSelector('main input[name="category"]');
        const clearFilter = await page.$(`main a[href="${pathname}"]`);
        assert.ok(clearFilter, `${pathname} is missing its clear-filter link`);
        await clearFilter.click();
        await page.waitForFunction(() => window.location.search === "");
        await page.waitForSelector("main h1");
        assert.equal(new URL(page.url()).pathname, pathname, "Internal render URLs must not leak into navigation");
      }
    }
    await page.goto(`${webOrigin}${knowledgeOnly ? "/knowledge" : "/"}`, { waitUntil: "networkidle2", timeout: 30_000 });
    const menuTrigger = await page.$("button[aria-label*='菜单'], button[aria-label*='menu']");
    if (menuTrigger) {
      await menuTrigger.click();
      await page.waitForSelector("[role=dialog]");
      await page.keyboard.press("Escape");
    }

    if (!knowledgeOnly) {
      await page.goto(`${cmsOrigin}/login`, { waitUntil: "networkidle2", timeout: 30_000 });
      await checkPage(page, `${cmsOrigin}/login`, "CMS 登录页");
    }
    assert.deepEqual(browserErrors, [], "Browser application/hydration errors occurred");
    console.log(`Mobile smoke passed: ${viewports.length} viewports, ${knowledgeOnly ? "bilingual knowledge" : "public routes and CMS login"}, knowledge filter navigation, overflow and touch-boundary probes.`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
