import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
