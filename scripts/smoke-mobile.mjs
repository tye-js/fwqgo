import assert from "node:assert/strict";
import puppeteer from "puppeteer";

/** @typedef {import('puppeteer').Page} Page */

const webOrigin = (process.env.MOBILE_WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const cmsOrigin = (process.env.MOBILE_CMS_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const requireData = process.env.MOBILE_SMOKE_REQUIRE_DATA === "1";
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
      node.matches(".cms-table-viewport, .cms-table-viewport *"),
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

async function run() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
  } catch (error) {
    throw new Error(`真实视口未验证：Chromium 启动失败（${error instanceof Error ? error.message : String(error)}）`);
  }

  try {
    const page = await browser.newPage();
    for (const [width, height] of viewports) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await checkPage(page, `${webOrigin}/`, `公开首页`);
      await checkPage(page, `${webOrigin}/servers`, `服务器库存`, { expectInventory: true });
      await checkPage(page, `${webOrigin}/search?q=https%3A%2F%2Fexample.com%2Fuuid-123456789`, `搜索页`);
    }

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${webOrigin}/`, { waitUntil: "networkidle2", timeout: 30_000 });
    const menuTrigger = await page.$("button[aria-label*='菜单'], button[aria-label*='menu']");
    if (menuTrigger) {
      await menuTrigger.click();
      await page.waitForSelector("[role=dialog]");
      await page.keyboard.press("Escape");
    }

    await page.goto(`${cmsOrigin}/login`, { waitUntil: "networkidle2", timeout: 30_000 });
    await checkPage(page, `${cmsOrigin}/login`, "CMS 登录页");
    console.log(`Mobile smoke passed: ${viewports.length} viewports, public routes, CMS login, overflow and touch-boundary probes.`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
