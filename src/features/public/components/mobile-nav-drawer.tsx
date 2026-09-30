"use client";

import Link from "@/features/public/components/public-link";
import React from "react";

import { cn } from "@fwqgo/core/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetDescription,
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
  ChevronDown,
  ChevronRight,
  Layers3,
  Cpu,
  Globe2,
  Menu,
  Search,
  Server,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { HeaderCopy, PublicLanguage } from "./header-copy";
import type { PublicNavModel } from "./public-nav";

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
  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** 分组里的一级项（比价入口、一级分类）。 */
const sheetLinkStrong = cn(
  sheetLinkBase,
  "font-medium text-foreground [overflow-wrap:anywhere]",
);
/** 独立成块的项（语言切换、知识库、搜索）。 */
const sheetLinkCard = cn(
  sheetLinkBase,
  "rounded-xl border border-border/70 font-medium text-foreground",
);
/** 信任页链接，外观弱于主导航。 */
const sheetLinkPlain = cn(
  sheetLinkBase,
  "text-muted-foreground hover:text-foreground [overflow-wrap:anywhere]",
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
            <Globe2 className="size-4 shrink-0" aria-hidden="true" />
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
          <Globe2 className="size-4 shrink-0" aria-hidden="true" />
          {copy.languageLabel}
        </LanguageSwitchLink>
      </SheetClose>
    </React.Suspense>
  );
}

/** 与桌面一样用箭头表达可展开入口，次级链接缩进到同一层。 */
function MobileNavGroup({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  primary = false,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  defaultOpen?: boolean;
  primary?: boolean;
}) {
  return (
    <details
      name="public-mobile-navigation"
      open={defaultOpen}
      className={cn(
        "group rounded-xl border border-border/70",
        primary && "border-primary/20 bg-primary/5",
      )}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            primary ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{title}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="mx-3 mb-3 grid gap-1 border-l border-border pl-3">
        {children}
      </div>
    </details>
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
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="max-h-dvh w-[88vw] max-w-sm overflow-y-auto motion-reduce:animate-none"
      >
        <SheetHeader className="border-b border-border/70 pb-4 text-left">
          <SheetTitle>{copy.navigationTitle}</SheetTitle>
          <SheetDescription className="sr-only">
            {copy.articleCategoriesDescription}
          </SheetDescription>
        </SheetHeader>
        <nav aria-label={copy.navigationTitle} className="mt-5 grid gap-3">
          <MobileNavLink href={nav.latest.href} className={sheetLinkStrong}>
            <BookOpen
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="flex-1">{nav.latest.label}</span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </MobileNavLink>

          <MobileNavGroup
            title={copy.dealsTitle}
            icon={Server}
            defaultOpen
            primary
          >
            {nav.deals.map((link) => (
              <MobileNavLink
                key={link.href}
                href={link.href}
                prefetch
                className={sheetLinkStrong}
              >
                {link.label}
              </MobileNavLink>
            ))}
          </MobileNavGroup>

          {nav.categories.length > 0 ? (
            <MobileNavGroup title={copy.articleCategories} icon={Layers3}>
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
            </MobileNavGroup>
          ) : null}
          {categoriesFailed ? (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm leading-6 text-muted-foreground">
              {copy.errorDescription}
            </p>
          ) : null}

          {nav.knowledge ? (
            <MobileNavLink
              href={nav.knowledge.href}
              prefetch
              className={sheetLinkStrong}
            >
              <BookOpen
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex-1">{nav.knowledge.label}</span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </MobileNavLink>
          ) : null}

          <MobileNavGroup title={copy.toolsTitle} icon={Wrench}>
            {nav.tools.map((link, index) => {
              const Icon = TOOL_ICONS[index] ?? Cpu;
              return (
                <MobileNavLink
                  key={link.href}
                  href={link.href}
                  className={sheetLinkStrong}
                >
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {link.label}
                </MobileNavLink>
              );
            })}
          </MobileNavGroup>

          <MobileNavLink
            href={nav.search.href}
            prefetch
            className={sheetLinkCard}
          >
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {nav.search.label}
          </MobileNavLink>

          <div className="mt-2 grid gap-3 border-t border-border/70 pt-4">
            <MobileLanguageSwitch language={language} copy={copy} />
            <MobileNavGroup title={copy.siteInfoTitle} icon={ShieldCheck}>
              {MOBILE_TRUST_LINKS.map((link) => (
                <MobileNavLink
                  key={link.slug}
                  href={trustPagePath(link.slug, language)}
                  className={sheetLinkPlain}
                >
                  {language === "en" ? link.en : link.zh}
                </MobileNavLink>
              ))}
            </MobileNavGroup>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
