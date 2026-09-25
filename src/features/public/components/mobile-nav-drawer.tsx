"use client";

import Link from "next/link";
import React from "react";

import { cn } from "@fwqgo/core/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LanguageSwitchLink } from "@/features/public/components/language-switch-link";
import {
  trustPagePath,
  type TrustPageSlug,
} from "@/features/public/lib/site-contact";
import {
  BookOpen,
  Cpu,
  Globe2,
  Menu,
  Search,
  Server,
  ShieldCheck,
} from "lucide-react";

import type { HeaderCopy, PublicLanguage } from "./header-copy";
import type { PublicNavLink, PublicNavModel } from "./public-nav";

/**
 * 移动端导航抽屉（`xl` 以下）。
 *
 * 从 `header.tsx` 拆出来，让那个文件回到 100 行出头、只负责「外壳 + 布局」。
 *
 * ## 为什么没有用 next/dynamic 延迟加载
 *
 * 分析报告建议用 `next/dynamic(..., { ssr: false })` 把这个抽屉的 Radix Sheet
 * （连带 Portal / FocusScope / removeScroll，实测 66.4 KB 源码 / 23.6 KB 传输）
 * 挪出首屏。**实测下来这个方案在 App Router + Turbopack 下不成立**：
 *
 * - 它确实把 chunk 挪出了关键路径 —— 请求在 `loadEventEnd`(109 ms) 之后
 *   266 ms 才发起（`startTime` 375 ms）；
 * - 但**字节一个没省**：chunk 仍然出现在每次全新访问的 resource 列表里，
 *   客户端运行时在 hydration 之后照样把它拉下来。
 *
 * 也就是说 `next/dynamic` 只推迟**渲染**、不推迟**下载**。既然省不了字节，
 * 就没必要为它引入一个客户端岛 + 受控状态 + 首次点击要等 chunk 的失败模式。
 * 想要真正不下载，得让这个模块不进入路由的 chunk 图（比如换成独立的轻量实现），
 * 那是另一个量级的改动，报告里也把它排在后面。
 *
 * ## 导航结构
 *
 * 与桌面共用 `buildPublicNav()`（`./public-nav`）那一份数据，这里只负责渲染差异
 * （抽屉形态、图标、信任页只在移动端出现）。2026-09-25 之前两边各写一份导航项，
 * 英文「最新文章」已经漂移成桌面 `Journal` / 移动 `Latest articles`。
 */

/**
 * 抽屉里的三种链接外观。
 *
 * 抽成常量是因为同一组长类名原先在 JSX 里重复了 8 次以上 —— 改一处颜色要改一屏。
 * 顺带修掉一处遗漏：工具与信任页链接原先没有 `focus-visible` 样式，
 * 键盘用户看不出焦点落在哪（同一抽屉里另外两组都有）。
 */
const sheetLinkBase =
  "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** 分组里的一级项（比价入口、一级分类）。 */
const sheetLinkStrong = cn(sheetLinkBase, "font-medium text-foreground");
/** 分组里的次级项。 */
const sheetLinkMuted = cn(
  sheetLinkBase,
  "text-muted-foreground hover:text-foreground",
);
/** 独立成块的项（语言切换、知识库、搜索）。 */
const sheetLinkCard = cn(
  sheetLinkBase,
  "rounded-lg border border-border/70 font-medium text-foreground",
);
/** 工具与信任页那一类：卡片内的一行，无边框。 */
const sheetLinkPlain = cn(
  "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-muted",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

/**
 * Trust pages sit at the bottom of the mobile sheet rather than in the primary
 * navigation: they are low-frequency but high-value, and the desktop nav is
 * already at capacity.
 */
const MOBILE_TRUST_LINKS: Array<{
  slug: TrustPageSlug;
  zh: string;
  en: string;
}> = [
  { slug: "about", zh: "关于我们", en: "About" },
  { slug: "contact", zh: "联系我们", en: "Contact" },
  { slug: "privacy", zh: "隐私政策", en: "Privacy Policy" },
  { slug: "terms", zh: "服务条款", en: "Terms of Service" },
  {
    slug: "affiliate-disclosure",
    zh: "推广与佣金披露",
    en: "Affiliate Disclosure",
  },
];

/** 工具项图标，顺序与 `public-nav.ts` 的 `TOOL_PATHS` 一致。 */
const TOOL_ICONS = [Cpu, Globe2] as const;

function MobileNavLink({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Link>) {
  return (
    <SheetClose asChild>
      <Link {...props}>{children}</Link>
    </SheetClose>
  );
}

/** 语言切换。fallback 是纯 `<Link>`，真身是带语言判定的 `LanguageSwitchLink`。 */
function MobileLanguageSwitch({
  language,
  copy,
}: {
  language: PublicLanguage;
  copy: HeaderCopy;
}) {
  return (
    <React.Suspense
      fallback={
        <SheetClose asChild>
          <Link
            href={language === "en" ? "/" : "/en"}
            prefetch
            className={sheetLinkCard}
          >
            <Globe2 className="size-4" />
            {copy.languageLabel}
          </Link>
        </SheetClose>
      }
    >
      <SheetClose asChild>
        <LanguageSwitchLink
          currentLanguage={language}
          prefetch
          className={sheetLinkCard}
        >
          <Globe2 className="size-4" />
          {copy.languageLabel}
        </LanguageSwitchLink>
      </SheetClose>
    </React.Suspense>
  );
}

export function MobileNavDrawer({
  language,
  copy,
  nav,
  categoriesFailed,
}: {
  language: PublicLanguage;
  copy: HeaderCopy;
  nav: PublicNavModel;
  categoriesFailed: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl xl:hidden"
          aria-label={copy.navigationTitle}
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="max-h-dvh w-[88vw] max-w-sm overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{copy.navigationTitle}</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 grid gap-4">
          <MobileNavLink
            href={nav.latest.href}
            className={cn(
              sheetLinkBase,
              "rounded-lg bg-primary/5 font-semibold text-primary",
            )}
          >
            <BookOpen className="size-4" />
            {nav.latest.label}
          </MobileNavLink>

          <div className="grid gap-1 rounded-lg border border-border/70 p-2">
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
              <Server className="size-3.5" />
              {copy.categoriesTitle}
            </div>
            <MobileNavLink
              href={nav.deals[0]?.href ?? "/servers"}
              prefetch
              className={sheetLinkStrong}
            >
              {nav.deals[0]?.label ?? copy.allOffers}
            </MobileNavLink>
            {nav.deals.slice(1).map((link) => (
              <MobileNavLink
                key={link.href}
                href={link.href}
                prefetch
                className={sheetLinkMuted}
              >
                {link.label}
              </MobileNavLink>
            ))}
            <MobileLanguageSwitch language={language} copy={copy} />
            {nav.knowledge ? (
              <MobileNavLink
                href={nav.knowledge.href}
                prefetch
                className={sheetLinkCard}
              >
                <BookOpen className="size-4" />
                {nav.knowledge.label}
              </MobileNavLink>
            ) : null}
            <MobileNavLink
              href={nav.search.href}
              prefetch
              className={sheetLinkCard}
            >
              <Search className="size-4" />
              {nav.search.label}
            </MobileNavLink>
          </div>

          <div className="grid gap-1 rounded-lg border border-border/70 p-2">
            {nav.tools.map((link: PublicNavLink, index: number) => {
              const Icon = TOOL_ICONS[index] ?? Cpu;
              return (
                <MobileNavLink
                  key={link.href}
                  href={link.href}
                  className={sheetLinkPlain}
                >
                  <Icon className="size-4 text-primary" />
                  {link.label}
                </MobileNavLink>
              );
            })}
          </div>

          <div className="grid gap-1 rounded-lg border border-border/70 p-2">
            {MOBILE_TRUST_LINKS.map((link) => (
              <MobileNavLink
                key={link.slug}
                href={trustPagePath(link.slug, language)}
                className={sheetLinkPlain}
              >
                <ShieldCheck className="size-4 text-primary" />
                {language === "en" ? link.en : link.zh}
              </MobileNavLink>
            ))}
          </div>

          {nav.categories.length > 0 ? (
            <div className="px-3 text-xs font-medium uppercase text-muted-foreground">
              {copy.articleCategories}
            </div>
          ) : null}
          {nav.categories.map((link) => (
            <MobileNavLink
              key={link.href}
              href={link.href}
              prefetch={false}
              className={sheetLinkStrong}
            >
              {link.label}
            </MobileNavLink>
          ))}

          {categoriesFailed ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm leading-6 text-muted-foreground">
              {copy.errorDescription}
            </div>
          ) : null}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
