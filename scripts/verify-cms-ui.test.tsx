import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/**
 * 剥掉源码里的注释再做字面量断言。
 *
 * 本项目已经四次踩到同一个坑：说明文字里几乎必然会出现被断言的字面量
 * （「不再靠 `message.includes()` 猜状态码」「不要调 `requireAdminSession()`」…），
 * 不剥注释就是自己判自己失败。**行注释和块注释都要剥** —— 只剥 `//` 会漏掉 JSDoc。
 */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
import { join } from "node:path";
import test from "node:test";

import {
  findCmsNavigationEntry,
  getCmsNavigationEntries,
  normalizeCmsPath,
} from "@/features/cms/lib/navigation";

void test("CMS navigation destinations are unique, real admin pages", () => {
  const entries = getCmsNavigationEntries();
  assert.equal(new Set(entries.map((entry) => entry.url)).size, entries.length);
  for (const entry of entries) {
    const route = normalizeCmsPath(entry.url).replace(/^\//, "");
    assert.ok(
      existsSync(join("apps/cms/app/(admin)", route, "page.tsx")),
      `${entry.title} must link to an existing admin page: ${entry.url}`,
    );
  }
});

void test("nested CMS pages select one specific destination without prefix collisions", () => {
  for (const [pathname, destination] of [
    ["/", "/"],
    ["/posts/drafts?lang=en&pageNo=2", "/posts/drafts"],
    ["/posts/edit/post/long-article-slug", "/posts/edit"],
    ["/posts/create/", "/posts/create"],
    ["/ai-rewrite/tasks/42#progress", "/ai-rewrite/tasks"],
    ["/ai-tasks/42", "/ai-tasks"],
    ["/knowledge/sources", "/knowledge/sources"],
    ["/knowledge/server-sizing", "/knowledge/server-sizing"],
    ["/seo/tag?lang=en", "/seo/tag"],
    ["/seo/category", "/seo/category"],
    ["/seo", "/seo"],
    ["/images/covers", "/images/covers"],
    ["/images/ai-generate", "/images/ai-generate"],
    ["/settings/image-generation", "/settings/image-generation"],
  ] as const) {
    assert.equal(findCmsNavigationEntry(pathname)?.url, destination, pathname);
  }
  for (const pathname of ["/knowledge-base", "/posts/drafts-old", "/login"]) {
    assert.equal(findCmsNavigationEntry(pathname), undefined, pathname);
  }
});

void test("page search supports Chinese, case-insensitive terms and empty results", () => {
  assert.deepEqual(
    getCmsNavigationEntries(" 草稿 ").map((entry) => entry.url),
    ["/posts/drafts"],
  );
  assert.deepEqual(
    getCmsNavigationEntries(" seo 分类 ").map((entry) => entry.url),
    ["/seo/category"],
  );
  assert.deepEqual(
    getCmsNavigationEntries("封面").map((entry) => entry.url),
    ["/images/covers"],
  );
  assert.equal(getCmsNavigationEntries("并不存在的后台页面").length, 0);
  assert.equal(
    getCmsNavigationEntries("   ").length,
    getCmsNavigationEntries().length,
  );
});

void test("CMS sidebar renders a single current-page link and valid brand navigation", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { mock } from "bun:test";
let pathname = "/";
mock.module("next/navigation", () => ({ usePathname: () => pathname }));
const { AppSidebar } = await import("./src/components/endpoint/app-sidebar.tsx");
const { SidebarProvider } = await import("./src/components/ui/sidebar.tsx");
for (const [path, destination] of [["/", "/"], ["/posts/drafts", "/posts/drafts"], ["/posts/edit/post/example", "/posts/edit"], ["/knowledge/sources", "/knowledge/sources"], ["/seo/tag", "/seo/tag"], ["/settings/image-generation", "/settings/image-generation"]]) {
  pathname = path;
  for (const defaultOpen of [true, false]) {
    const $ = cheerio.load(renderToStaticMarkup(React.createElement(SidebarProvider, { defaultOpen }, React.createElement(AppSidebar))));
    const current = $('a[aria-current="page"]');
    assert.equal(current.length, 1, path);
    assert.equal(current.attr("href"), destination, path);
    assert.equal($('a[aria-label="FWQGO 工作台"]').attr("href"), "/");
    for (const control of $('[data-sidebar="menu-button"]').toArray()) {
      assert.ok($(control).attr("aria-label")?.trim(), "Collapsed navigation keeps an accessible label");
    }
    assert.equal($("a a, button button, button a").length, 0, "No nested interactive elements");
  }
}
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

void test("CMS page headings and login error fields remain accessible after the redesign", () => {
  const result = spawnSync(process.execPath, ["--no-env-file", "-"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 15_000,
    input: String.raw`
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as cheerio from "cheerio";
import { AdminPageShell, AdminSectionCard } from "./src/features/cms/components/admin-page-shell.tsx";
import { CmsAuthShell } from "./src/features/cms/components/cms-auth-shell.tsx";
import { LoginForm } from "./src/features/cms/components/login-form.tsx";
for (const showHeading of [true, false]) {
  const $ = cheerio.load(renderToStaticMarkup(React.createElement(AdminPageShell, { title: "文章库", showHeading }, React.createElement(AdminSectionCard, { title: "文章列表" }, "文章"))));
  assert.equal($("h1").length, 1);
  assert.equal($("h1").text(), "文章库");
  assert.equal($("h2").text(), "文章列表");
}
for (const error of [undefined, "账号或密码不正确"]) {
  const props = { username: "editor", password: "", setUsername() {}, setPassword() {}, handleLogin() {}, error, isPending: Boolean(error) };
  const $ = cheerio.load(renderToStaticMarkup(React.createElement(CmsAuthShell, null, React.createElement(LoginForm, props))));
  assert.equal($("h1").length, 1);
  assert.equal($("#username").attr("autocomplete"), "username");
  assert.equal($("#password").attr("type"), "password");
  assert.equal($("#password").attr("autocomplete"), "current-password");
  assert.equal($('button[aria-label="显示密码"]').attr("type"), "button");
  for (const field of ["username", "password"]) {
    assert.equal($('label[for="' + field + '"]').length, 1);
    assert.equal($("#" + field).attr("aria-invalid"), String(Boolean(error)));
    assert.equal($("#" + field).attr("aria-describedby"), error ? "login-form-error" : undefined);
  }
  assert.equal($('[role="alert"]').length, error ? 1 : 0);
  assert.equal($('button[type="submit"]').is(":disabled"), Boolean(error));
}
`,
  });
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`.slice(0, 12_000),
  );
});

/**
 * 后台错误隔离的两层接线。
 *
 * 这两条不是「有没有 error.tsx」的形式检查，而是实测出来的必要条件：
 * - `error.tsx` 必须是 Client Component，否则生产构建直接失败
 *   （`apps/cms/app/(admin)/error.tsx must be a Client Component`）。
 * - 只加 `(admin)/error.tsx` 是不够的：数据库停掉时先挂的是 `(admin)/layout.tsx`
 *   （它要 requireAdminSession），而 error.tsx 接不住同层 layout 的错误，
 *   页面会掉到框架默认错误页。所以根段必须再有一层 `app/error.tsx`。
 */
void test("CMS ships both error boundaries as client components", () => {
  for (const file of [
    "apps/cms/app/error.tsx",
    "apps/cms/app/(admin)/error.tsx",
  ]) {
    assert.ok(existsSync(file), `${file} must exist`);
    const source = readFileSync(file, "utf8");
    assert.match(source, /^"use client";/m, `${file} must be a Client Component`);
  }
});

void test("admin pages with a failure fallback share one loader helper", () => {
  const helper = readFileSync("src/features/cms/lib/page-data.ts", "utf8");
  assert.match(helper, /export async function loadPageData/);

  // 这 4 个页面此前各写各的 try/catch 或本地 loadPageData（4 种实现），统一到这里。
  for (const file of [
    "src/features/cms/routes/admin/ai-rewrite/tasks/page.tsx",
    "src/features/cms/routes/admin/collect/homepage-promoted/page.tsx",
    "src/features/cms/routes/admin/knowledge/page.tsx",
    "src/features/cms/routes/admin/servers/monitor/page.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /loadPageData/, `${file} must use the shared loader`);
    assert.doesNotMatch(
      source,
      /ok: false as const/,
      `${file} must not keep its own {ok} failure shape`,
    );
  }
});

void test("knowledge list paginates instead of silently truncating at 300", () => {
  const source = readFileSync("src/features/cms/actions/knowledge.ts", "utf8");
  const overview = source.slice(
    source.indexOf("export async function getKnowledgeAdminOverview"),
    source.indexOf("export async function getKnowledgeAdminArticle"),
  );

  // `.limit(300)` 会让第 301 篇之后在后台列表里彻底消失且没有任何提示。
  // 先剥掉行注释再断言 —— 源码里的说明文字本身会提到 `.limit(300)`。
  assert.doesNotMatch(stripComments(overview), /\.limit\(300\)/);
  assert.match(overview, /boundOffsetPaginationByTotal/);
  assert.match(overview, /count\(\*\)::int/);
});

/**
 * 上传路由的状态码必须由**错误类型**决定，不能靠 message 字符串匹配。
 * 原来写成 `message.includes("too large") ? 413 : …`，上游把文案翻成中文就会
 * 静默变成 500，类型检查与测试都拦不住。
 */
void test("upload route maps typed errors to status codes instead of matching messages", () => {
  const route = readFileSync(
    "src/features/cms/routes/api/upload/route.ts",
    "utf8",
  );
  assert.doesNotMatch(stripComments(route), /message\.includes\(/);
  assert.match(route, /toUploadApiError/);
});

void test("upload error mapping covers each typed error with a user-facing message", async () => {
  const {
    InvalidUploadPathError,
    toUploadApiError,
    UnsupportedMediaTypeError,
    UploadTooLargeError,
  } = await import("@/server/images/upload-errors");

  assert.equal(toUploadApiError(new UploadTooLargeError())?.status, 413);
  assert.equal(toUploadApiError(new UnsupportedMediaTypeError())?.status, 415);
  assert.equal(toUploadApiError(new InvalidUploadPathError())?.status, 400);
  assert.equal(toUploadApiError(new Error("boom")), null);

  for (const error of [
    new UploadTooLargeError(),
    new UnsupportedMediaTypeError(),
    new InvalidUploadPathError(),
  ]) {
    const mapped = toUploadApiError(error);
    assert.ok(mapped, `${error.name} must be mapped`);
    // 回给客户端的文案不能是内部英文原文
    assert.doesNotMatch(mapped.message, /Invalid file type|too large|Invalid upload path/);
    assert.ok(mapped.suggestion.length > 0);
  }
});

/**
 * 「队列状态计数」只能有一处实现。
 *
 * 同一段 `GROUP BY status` 聚合原本在 `data/post.ts`（运营工作台，4 张表）与
 * `data/operations.ts`（AI任务中心，3 张表）各写一遍，重叠的 3 张表每次刷新都算两次。
 * 现在统一走 `data/task-queue-status.ts` 的 `getTaskQueueStatusCounts()`（`"use cache"`）。
 */
void test("task queue status counts are computed in exactly one place", () => {
  const shared = readFileSync(
    "src/features/cms/data/task-queue-status.ts",
    "utf8",
  );
  // 断言也走 stripComments：这个文件的注释里就写着 `"use cache"` 与 `cacheLife(`，
  // 不剥注释的话，把真正的指令删掉测试照样绿（正向断言会被注释满足）。
  const sharedCode = stripComments(shared);
  assert.match(sharedCode, /"use cache"/);
  assert.match(sharedCode, /cacheLife\(/);
  // 缓存函数不能读 cookies —— 鉴权必须留在调用方。
  assert.doesNotMatch(sharedCode, /requireAdminSession/);

  for (const file of ["src/features/cms/data/post.ts", "src/features/cms/data/operations.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /getTaskQueueStatusCounts/,
      `${file} must use the shared queue counts`,
    );
    assert.doesNotMatch(
      source,
      /groupBy\((aiRewriteTasks|imageCoverGenerationTasks|providerMonitorRuns|adminBackgroundJobs)\.status\)/,
      `${file} must not re-implement the status aggregation`,
    );
  }
});

/**
 * 审计写入不占请求路径（P2-6）。
 *
 * 原来两个包装都是 `await recordAdminAuditLogSafely(...)` 再返回响应，
 * 等于每个写操作都串行多一跳 `INSERT INTO admin_audit_logs`（实测均值 2.32 ms）。
 * 现在走 `scheduleAdminAuditLog`（`next/server` 的 `after()`），响应之后再落库。
 */
void test("admin audit writes are scheduled after the response, not awaited inline", () => {
  const auditLog = stripComments(
    readFileSync("src/server/admin/audit-log.ts", "utf8"),
  );
  assert.match(auditLog, /export function scheduleAdminAuditLog/);
  assert.match(auditLog, /after\(\(\) => recordAdminAuditLogSafely\(event\)\)/);
  // `.returning()` 的结果没有任何调用方使用，白白多回传一行
  assert.doesNotMatch(auditLog, /\.returning\(/);

  for (const file of [
    "src/features/cms/lib/define-admin-action.ts",
    "src/features/cms/lib/admin-audit.ts",
  ]) {
    const source = stripComments(readFileSync(file, "utf8"));
    assert.match(source, /scheduleAdminAuditLog\(/, `${file} must schedule the audit write`);
    assert.doesNotMatch(
      source,
      /await recordAdminAuditLogSafely\(/,
      `${file} must not block the response on the audit insert`,
    );
  }
});

/**
 * 发布守卫的轮询频率（P2-4）。
 *
 * 这个探测每次都要做一次完整会话校验（`verify:security` 要求 `api/cms/**` 全部鉴权，
 * 所以不能改成公开的静态文件）。既然单次成本降不下来，就用**降频率**来减浪费：
 * 兜底间隔必须是分钟级而不是秒级，且 `focus` / `visibilitychange` 要保留 ——
 * 用户切回标签页时仍然是立即检查。
 */
void test("release guard polls on a multi-minute backstop and keeps focus triggers", () => {
  const guard = stripComments(
    readFileSync("src/features/cms/components/cms-release-guard.tsx", "utf8"),
  );

  const pollMatch = /const RELEASE_POLL_MS = ([^;]+);/.exec(guard);
  assert.ok(pollMatch, "RELEASE_POLL_MS must be a named constant");
  const pollExpression = (pollMatch[1] ?? "").trim();
  assert.match(
    pollExpression,
    /^[0-9_]+ \* (60_000|60 \* 1_000)$/,
    `兜底间隔必须是分钟级（当前：${pollExpression}）`,
  );
  const minutes = Number(/^([0-9_]+)/.exec(pollExpression)?.[1]?.replace(/_/g, ""));
  assert.ok(minutes >= 5, `兜底间隔至少 5 分钟（当前：${minutes}）`);

  // 切回标签页 / 窗口重新获得焦点时仍然是立即检查，不依赖那个定时器
  assert.match(guard, /addEventListener\("focus", checkFocusedRelease\)/);
  assert.match(guard, /addEventListener\("visibilitychange", checkVisibleRelease\)/);
  assert.match(guard, /setInterval\(checkScheduledRelease, RELEASE_POLL_MS\)/);
});

/**
 * 文章 slug 的规则只能有一份（`@fwqgo/core/article-slug`）。
 *
 * 实测（2026-09-25）：同一条规则散在四处——创建路径与 zod schema 含反斜杠，
 * 编辑 action 与编辑页前端只有 `[\s/?#]`，而编辑页前端还把长度上限写成 360
 * （后端是 320）。后果是「前端放行、后端报错」。
 *
 * 这里两头都守：消费点不再自建正则（防漂移），新建表单确实接上了规则并能提交 slug
 * （防功能缺失）。
 */
void test("article slug rules live in one module and the create form uses it", () => {
  const ruleModule = "packages/core/article-slug.ts";
  assert.ok(existsSync(ruleModule), `slug 规则必须住在 ${ruleModule}`);

  const consumers = [
    "src/server/posts/create-post-record.ts",
    "src/features/cms/lib/post-edit.ts",
    "src/features/cms/actions/post.ts",
    "src/components/endpoint/edit-post/edit-post.tsx",
    "src/features/cms/components/create-post-workbench.tsx",
  ];
  for (const file of consumers) {
    const source = stripComments(readFileSync(file, "utf8"));
    assert.ok(
      !source.includes("[\\s/?#"),
      `${file} 不应自建 slug 字符正则，改用 @fwqgo/core/article-slug`,
    );
  }

  const formFile = "src/features/cms/components/create-post-workbench.tsx";
  const form = stripComments(readFileSync(formFile, "utf8"));

  // 表单要真的能填 slug，否则操作者只能接受标题生成的地址。
  assert.match(form, /htmlFor="create-post-slug"/);
  assert.match(form, /id="create-post-slug"/);

  // 发布与存草稿是两条独立路径，两条都要把 slug 交给 createPost。
  assert.equal(
    (form.match(/slug: slug\.trim\(\) \|\| undefined/g) ?? []).length,
    2,
    "发布与存草稿两条路径都必须提交 slug",
  );

  // 校验复用同一份规则，而不是在表单里另写一套。
  assert.match(form, /validateArticleSlug\(slug\)/);
});

/**
 * 封面渲染只能走一份判据：`hasRenderableCover`。
 *
 * 2026-09-25：这条判据被各写一套，后台 3 处漏了占位图检查，导致 `/posts/create`、
 * `/posts/edit`、`/posts/drafts`、`/posts/quality` 在「库里存在占位图封面文章」时整页 500
 * —— 而新建草稿的默认封面正是那张占位图，所以是必现路径。
 *
 * 根因：`isRenderableImageSrc` 对**任何** `/` 开头的路径都返回 true，于是
 * `/img/placeholders/fwq-placeholder.png` 被放行进 `next/image`，而它不在
 * `images.localPatterns` 白名单里 → 服务端渲染抛错。
 */
void test("cover rendering goes through the shared hasRenderableCover judge", () => {
  const ruleModule = "packages/core/article-cover.ts";
  const rule = stripComments(readFileSync(ruleModule, "utf8"));
  assert.match(
    rule,
    /export function hasRenderableCover/,
    `${ruleModule} 必须导出 hasRenderableCover`,
  );
  assert.ok(
    rule.includes("isRenderableImageSrc") && rule.includes("isDefaultArticleCover"),
    "hasRenderableCover 必须同时排除「不可渲染地址」与「默认占位图」",
  );

  const coverRenderers = [
    "src/features/cms/components/posts-tables.tsx",
    "src/features/cms/components/post-quality-workbench.tsx",
    "src/features/cms/components/image-upload.tsx",
    "src/features/cms/components/article-cover-batch-generator.tsx",
    "src/features/cms/routes/admin/ai-tasks/covers/[id]/page.tsx",
    "src/features/public/components/article-detail.tsx",
    "src/features/public/components/safe-post-image.tsx",
  ];

  for (const file of coverRenderers) {
    const source = stripComments(readFileSync(file, "utf8"));
    assert.ok(
      source.includes("hasRenderableCover("),
      `${file} 渲染封面时必须用 hasRenderableCover`,
    );
    assert.ok(
      !source.includes("isRenderableImageSrc("),
      `${file} 不应直接用 isRenderableImageSrc 判断封面（它对任何 / 开头的路径都返回 true），请用 hasRenderableCover`,
    );
  }
});
