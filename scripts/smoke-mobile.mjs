import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { captureHomepage, checkHomepageInteractions } from "./smoke-homepage.mjs";

/** @typedef {import('puppeteer').Page} Page */

const webOrigin = (
  process.env.MOBILE_WEB_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");
const cmsOrigin = (
  process.env.MOBILE_CMS_URL ?? "http://127.0.0.1:3100"
).replace(/\/$/, "");
const requireData = process.env.MOBILE_SMOKE_REQUIRE_DATA === "1";
const homepageOnly = process.env.MOBILE_SMOKE_SCOPE === "homepage";
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
  [1440, 900],
];

/** @param {string | undefined} value */
function optionalEnvironmentValue(value) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/** @param {Page} page @param {string} url @param {string} name @param {{expectInventory?: boolean, expectHomepage?: boolean}} [options] */
async function checkPage(
  page,
  url,
  name,
  { expectInventory = false, expectHomepage = false } = {},
) {
  const response = await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });
  assert.equal(response?.status(), 200, `${name} must return HTTP 200`);
  const result = await page.evaluate(() => {
    const body = document.body;
    const overflowing = body.scrollWidth > window.innerWidth + 1;
    // 「未授权的横向滚动区」= 元素自己 overflow-x 是 auto/scroll 且内容更宽。
    // 只比 scrollWidth/clientWidth 会把天然裁切也误判进来：sr-only（overflow:hidden）
    // 与 <input>（overflow-x:clip，占位符或长搜索词比框宽）必然满足该不等式，
    // 但都不会产生滚动条。真的撑破视口由上面的 overflowing 断言负责。
    const regions = [...document.querySelectorAll("*")].filter((node) => {
      const overflowX = getComputedStyle(node).overflowX;
      return (
        (overflowX === "auto" || overflowX === "scroll") &&
        node.scrollWidth > node.clientWidth + 1
      );
    });
    /** @param {Element} node */
    const allowed = (node) =>
      node.matches(".cms-table-viewport, .cms-table-viewport *") ||
      node.matches(".article-table-scroll, .article-table-scroll *") ||
      (window.innerWidth >= 1280 &&
        node.matches(
          "#inventory-results .overflow-x-auto, #inventory-results .overflow-x-auto *",
        ));
    const unowned = regions
      .filter((node) => !allowed(node))
      .slice(0, 5)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const classes = String(node.className ?? "")
          .trim()
          .split(/\s+/)
          .slice(0, 3)
          .join(".");
        const text = (node.textContent ?? "").trim().slice(0, 24);
        return `${node.tagName.toLowerCase()}${classes ? `.${classes}` : ""} scrollWidth=${node.scrollWidth} clientWidth=${node.clientWidth} x=${Math.round(rect.x)} "${text}"`;
      });
    return {
      overflowing,
      allowed: unowned.length === 0,
      unowned,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      touchTargets: [
        ...document.querySelectorAll("a,button,[role=button],summary"),
      ]
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
      homeCards: document.querySelectorAll('[data-variant="home-list"]').length,
      homeFirstTitleBottom:
        document
          .querySelector('[data-testid="home-feed"] h3')
          ?.getBoundingClientRect().bottom ?? null,
      homeSmallTargets: [
        ...document.querySelectorAll(
          "main a, main button, main input:not([type=hidden])",
        ),
      ]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            (rect.width < 44 || rect.height < 44)
          );
        })
        .map((node) => node.textContent?.trim().slice(0, 40) || node.tagName),
      inventoryCards: document.querySelectorAll("#inventory-results article")
        .length,
    };
  });
  assert.equal(
    result.overflowing,
    false,
    `${name} overflows at ${result.viewport}`,
  );
  assert.equal(
    result.allowed,
    true,
    `${name} has an unowned horizontal scroll region at ${result.viewport}: ${result.unowned.join(" | ")}`,
  );
  if (expectHomepage) {
    assert.deepEqual(
      result.homeSmallTargets,
      [],
      `${name} has small controls at ${result.viewport}`,
    );
    assert.ok(result.homeCards <= 9, `${name} exceeds nine articles`);
    if (requireData) {
      assert.ok(
        result.homeCards > 0,
        `${name} needs representative article data`,
      );
      if (["375x812", "1440x900"].includes(result.viewport)) {
        assert.ok(
          result.homeFirstTitleBottom !== null &&
            result.homeFirstTitleBottom <= (page.viewport()?.height ?? 0),
          `${name} hides the first title below the initial viewport`,
        );
      }
    }
  }
  if (expectInventory && requireData) {
    assert.ok(
      result.inventoryCards > 0,
      `${name} has no inventory cards at ${result.viewport}`,
    );
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
  const browserPath = optionalEnvironmentValue(
    process.env.MOBILE_SMOKE_BROWSER_PATH,
  );
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: browserPath,
      /**
       * `--no-sandbox` 在这里是**必需项**，不是可选优化。
       *
       * 在受限环境（本机 macOS 沙箱、容器）里，默认参数下浏览器能启动、`newPage()`
       * 也正常返回，但**第一次 `setViewport` 就抛**
       * `TargetCloseError: Protocol error (Emulation.setTouchEmulationEnabled):
       * Session closed`。最小复现里没有任何项目代码：不加参数必崩，加上这两个参数
       * 立刻恢复（实测 A/B，`goto` 与 `title()` 都正常）。
       *
       * `output/ui-optimize-followup-2026-09-23.md` 当时把原因归到「puppeteer 自带的
       * chrome-headless-shell，换 Chrome for Testing 就好」—— 那个结论不准确：
       * 换浏览器不解决问题，**沙箱参数才是变量**。后果是这个官方视口命令在本机长期
       * 跑不起来，只能靠临时探针替代。
       *
       * 与 `smoke-cms-browser.mjs` 保持同一套写法。生产抓取
       * （`src/server/scrape/article-scraper.ts`）**不得**带这个参数，
       * `tests/security-hardening-regressions.test.ts` 有断言守着。
       */
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (error) {
    throw new Error(
      `真实视口未验证：Chromium 启动失败（${error instanceof Error ? error.message : String(error)}）`,
    );
  }

  try {
    const page = await browser.newPage();
    /** @type {string[]} */
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error)));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /hydration|minified react error/i.test(message.text())
      ) {
        browserErrors.push(message.text());
      }
    });
    for (const [width, height] of viewports) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      if (homepageOnly) {
        for (const pathname of ["/", "/en"]) {
          await checkPage(page, `${webOrigin}${pathname}`, `首页 ${pathname}`, {
            expectHomepage: true,
          });
          await captureHomepage(page, pathname, width);
          // Stress the real rendered layout in both themes without changing saved content.
          await page.evaluate(() => {
            document.documentElement.classList.add("dark");
            const title = document.querySelector(
              '[data-testid="home-feed"] h3',
            );
            if (title)
              title.textContent =
                "中国香港服务器 CN2 GIA / Hong Kong, China VPS 16GB RAM 500GB NVMe $123.45/year " +
                "long-provider-specification-".repeat(12);
            const tag = document.querySelector(
              '[data-testid="home-feed"] a[href*="/tags/"]',
            );
            if (tag) tag.textContent = "LongNetworkRoute".repeat(12);
          });
          const stress = await page.evaluate(() => ({
            overflow: document.body.scrollWidth > innerWidth + 1,
            clamped: getComputedStyle(
              document.querySelector('[data-testid="home-feed"] h3') ??
                document.body,
            ).webkitLineClamp,
          }));
          assert.equal(
            stress.overflow,
            false,
            `${pathname} long content overflows at ${width}`,
          );
          assert.ok(
            stress.clamped === "none" || stress.clamped === "0",
            "Titles must not be clamped",
          );
        }
        continue;
      }
      if (inventoryOnly) {
        await checkPage(page, `${webOrigin}/servers`, "服务器库存", {
          expectInventory: true,
        });
        continue;
      }
      if (!knowledgeOnly) {
        await checkPage(page, `${webOrigin}/`, `中文首页`, {
          expectHomepage: true,
        });
        await checkPage(page, `${webOrigin}/en`, `英文首页`, {
          expectHomepage: true,
        });
        await checkPage(page, `${webOrigin}/servers`, `服务器库存`, {
          expectInventory: true,
        });
        await checkPage(
          page,
          `${webOrigin}/search?q=https%3A%2F%2Fexample.com%2Fuuid-123456789`,
          `搜索页`,
        );
      }
      await checkPage(page, `${webOrigin}/knowledge`, "中文知识库");
      await checkPage(page, `${webOrigin}/en/knowledge`, "英文知识库");
    }

    if (homepageOnly) {
      if (requireData) await checkHomepageInteractions(page, webOrigin);
      assert.deepEqual(
        browserErrors,
        [],
        "Browser application/hydration errors occurred",
      );
      console.log(
        `Homepage smoke passed: bilingual pages, ${viewports.length} viewports, first-title visibility, light/dark long-content overflow and touch targets.`,
      );
      return;
    }

    if (inventoryOnly) {
      await checkInventoryFilters(page);
      assert.deepEqual(
        browserErrors,
        [],
        "Browser application/hydration errors occurred",
      );
      console.log(
        `Mobile inventory smoke passed: ${viewports.length} viewports, search, reset, sorting, combined price filtering and overflow probes.`,
      );
      return;
    }

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    for (const pathname of ["/knowledge", "/en/knowledge"]) {
      await page.goto(`${webOrigin}${pathname}`, {
        waitUntil: "networkidle2",
        timeout: 30_000,
      });
      const category = await page.$('main nav a[href*="category="]');
      if (requireData)
        assert.ok(category, `${pathname} has no category navigation`);
      if (category) {
        await category.click();
        await page.waitForFunction(() =>
          new URLSearchParams(window.location.search).has("category"),
        );
        await page.waitForSelector('main input[name="category"]');
        const clearFilter = await page.$(`main a[href="${pathname}"]`);
        assert.ok(clearFilter, `${pathname} is missing its clear-filter link`);
        await clearFilter.click();
        await page.waitForFunction(() => window.location.search === "");
        await page.waitForSelector("main h1");
        assert.equal(
          new URL(page.url()).pathname,
          pathname,
          "Internal render URLs must not leak into navigation",
        );
      }
    }
    await page.goto(`${webOrigin}${knowledgeOnly ? "/knowledge" : "/"}`, {
      waitUntil: "networkidle2",
      timeout: 30_000,
    });
    const menuTrigger = await page.$(
      "button[aria-label*='菜单'], button[aria-label*='menu']",
    );
    if (menuTrigger) {
      await menuTrigger.click();
      await page.waitForSelector("[role=dialog]");
      await page.keyboard.press("Escape");
    }

    if (!knowledgeOnly) {
      await page.goto(`${cmsOrigin}/login`, {
        waitUntil: "networkidle2",
        timeout: 30_000,
      });
      await checkPage(page, `${cmsOrigin}/login`, "CMS 登录页");
    }
    assert.deepEqual(
      browserErrors,
      [],
      "Browser application/hydration errors occurred",
    );
    console.log(
      `Mobile smoke passed: ${viewports.length} viewports, ${knowledgeOnly ? "bilingual knowledge" : "public routes and CMS login"}, knowledge filter navigation, overflow and touch-boundary probes.`,
    );
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
