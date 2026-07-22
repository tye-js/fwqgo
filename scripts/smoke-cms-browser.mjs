import puppeteer from "puppeteer";

const baseUrl = (process.env.CMS_SMOKE_URL ?? "http://127.0.0.1:3100").replace(
  /\/+$/,
  "",
);
const username = process.env.CMS_SMOKE_USERNAME?.trim();
const password = process.env.CMS_SMOKE_PASSWORD;
const basicAuthUsername = process.env.CMS_BASIC_AUTH_USERNAME?.trim();
const basicAuthPassword = process.env.CMS_BASIC_AUTH_PASSWORD;
const timeout = normalizeTimeout(process.env.CMS_SMOKE_TIMEOUT_MS);
const coreRoutes = [
  "/",
  "/ai-rewrite/tasks",
  "/posts/edit",
  "/servers/manage",
  "/servers/monitor",
  "/images/list",
  "/collect/homepage-promoted",
  "/collect/ai-rewrite",
];

/** @param {string | undefined} value */
function normalizeTimeout(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 120_000
    ? Math.trunc(parsed)
    : 30_000;
}

/** @param {string | undefined} value */
function optionalEnvironmentValue(value) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** @param {string | undefined} first @param {string | undefined} second @param {string} names */
function requirePair(first, second, names) {
  if (Boolean(first) !== Boolean(second)) {
    throw new Error(`${names} 必须同时配置`);
  }
}

/** @param {import("puppeteer").Page} page @param {string} path */
async function navigate(page, path) {
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: "domcontentloaded",
    timeout,
  });
  if (!response) throw new Error(`${path} 没有返回主文档响应`);
  const status = response.status();
  assert(status < 500, `${path} 返回 HTTP ${status}`);
  return response;
}

/** @param {import("puppeteer").Page} page */
async function verifyLoginPage(page) {
  await navigate(page, "/login");
  assert(new URL(page.url()).pathname === "/login", "登录页发生了意外跳转");
  await page.waitForSelector("#username", { timeout });
  await page.waitForSelector("#password", { timeout });
  await page.waitForSelector('button[type="submit"]', { timeout });
  const body = await page.locator("body").map((element) => element.textContent).wait();
  assert(body?.includes("输入管理员账号进入后台"), "登录页缺少管理员登录说明");
}

/** @param {import("puppeteer").Page} page */
async function verifyUnauthenticatedRedirect(page) {
  await navigate(page, "/servers/manage");
  assert(
    new URL(page.url()).pathname === "/login",
    "未登录访问受保护路由时没有跳转到 /login",
  );
}

/** @param {import("puppeteer").Page} page */
async function login(page) {
  await verifyLoginPage(page);
  await page.type("#username", username ?? "");
  await page.type("#password", password ?? "");
  await page.click('button[type="submit"]');
  await page.waitForFunction(
    () =>
      window.location.pathname !== "/login" ||
      Boolean(document.querySelector('[role="alert"]')),
    { timeout },
  );

  if (new URL(page.url()).pathname === "/login") {
    const error = await page
      .locator('[role="alert"]')
      .map((element) => element.textContent)
      .wait();
    const message = error?.trim();
    throw new Error(`CMS 登录失败：${message ? message : "未知错误"}`);
  }
}

/** @param {import("puppeteer").Page} page */
async function verifyCoreRoutes(page) {
  for (const route of coreRoutes) {
    /** @type {string[]} */
    const pageErrors = [];
    /** @param {unknown} error */
    const onPageError = (error) => {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    };
    page.on("pageerror", onPageError);

    try {
      await navigate(page, route);
      const pathname = new URL(page.url()).pathname;
      assert(pathname !== "/login", `${route} 丢失登录会话`);
      const body =
        (await page.locator("body").map((element) => element.textContent).wait()) ??
        "";
      assert(!body.includes("Internal Server Error"), `${route} 出现服务端错误页`);
      assert(!body.includes("Application error"), `${route} 出现应用错误页`);
      assert(!body.includes("This page could not be found"), `${route} 路由不存在`);
      assert(pageErrors.length === 0, `${route} 浏览器异常：${pageErrors.join("; ")}`);
    } finally {
      page.off("pageerror", onPageError);
    }
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "CMS_SMOKE_URL=http://127.0.0.1:3100 [CMS_SMOKE_USERNAME=...] [CMS_SMOKE_PASSWORD=...] bun run smoke:cms",
    );
    return;
  }

  requirePair(username, password, "CMS_SMOKE_USERNAME 和 CMS_SMOKE_PASSWORD");
  requirePair(
    basicAuthUsername,
    basicAuthPassword,
    "CMS_BASIC_AUTH_USERNAME 和 CMS_BASIC_AUTH_PASSWORD",
  );

  const browserPath = optionalEnvironmentValue(
    process.env.CMS_SMOKE_BROWSER_PATH,
  );
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: browserPath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);

    if (basicAuthUsername && basicAuthPassword) {
      await page.authenticate({
        username: basicAuthUsername,
        password: basicAuthPassword,
      });
    }

    await verifyLoginPage(page);
    await verifyUnauthenticatedRedirect(page);

    if (username && password) {
      await login(page);
      await verifyCoreRoutes(page);
      console.log(`CMS browser smoke passed: login and ${coreRoutes.length} routes`);
    } else {
      console.log("CMS browser smoke passed: login UI and unauthenticated redirect");
    }
  } finally {
    await browser.close();
  }
}

await main();
