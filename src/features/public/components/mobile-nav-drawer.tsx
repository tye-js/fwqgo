"use client";

import Link from "next/link";
import React from "react";

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
 */
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

function categoryHref(slug: string, language: PublicLanguage) {
  return `${language === "en" ? "/en" : ""}/fwq/${encodeURIComponent(slug)}/page/1`;
}

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

export function MobileNavDrawer({
  language,
  copy,
  categories,
  categoriesFailed,
}: {
  language: PublicLanguage;
  copy: HeaderCopy;
  categories: Array<{ id: number; name: string; slug: string }>;
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
              href={`${language === "en" ? "/en" : ""}/fwq/page/1`}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-primary/5 px-3 text-sm font-semibold text-primary"
            >
              <BookOpen className="size-4" />
              {language === "en" ? "Latest articles" : "最新文章"}
            </MobileNavLink>
            <div className="grid gap-1 rounded-lg border border-border/70 p-2">
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                <Server className="size-3.5" />
                {copy.categoriesTitle}
              </div>
              <MobileNavLink
                href="/servers"
                prefetch
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.dealsTitle}
              </MobileNavLink>
              {(
                [
                  [copy.hongKong, "/servers/hong-kong"],
                  [copy.unitedStates, "/servers/united-states"],
                  [copy.cheapVps, "/servers/cheap-vps"],
                ] satisfies Array<[string, string]>
              ).map(([label, href]) => (
                <MobileNavLink
                  key={href}
                  href={href}
                  prefetch
                  className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {label}
                </MobileNavLink>
              ))}
              <React.Suspense
                fallback={
                  <SheetClose asChild>
                    <Link
                      href={language === "en" ? "/" : "/en"}
                      prefetch
                      className="mt-1 flex min-h-11 items-center gap-2 rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="mt-1 flex min-h-11 items-center gap-2 rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Globe2 className="size-4" />
                    {copy.languageLabel}
                  </LanguageSwitchLink>
                </SheetClose>
              </React.Suspense>
              {copy.knowledgeHref && copy.knowledgeLabel ? (
                <MobileNavLink
                  href={copy.knowledgeHref}
                  prefetch
                  className="flex min-h-11 items-center gap-2 rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BookOpen className="size-4" />
                  {copy.knowledgeLabel}
                </MobileNavLink>
              ) : null}
              <MobileNavLink
                href={copy.searchHref}
                prefetch
                className="flex min-h-11 items-center gap-2 rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search className="size-4" />
                {copy.searchLabel}
              </MobileNavLink>
            </div>
            <div className="grid gap-1 rounded-lg border border-border/70 p-2">
              <MobileNavLink
                href={`${language === "en" ? "/en" : ""}/tools/server-sizing`}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted"
              >
                <Cpu className="size-4 text-primary" />
                {language === "en" ? "Server sizing" : "服务器配置选择"}
              </MobileNavLink>
              <MobileNavLink
                href={`${language === "en" ? "/en" : ""}/tools/network-lines`}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted"
              >
                <Globe2 className="size-4 text-primary" />
                {language === "en" ? "Network routes" : "网络线路选择"}
              </MobileNavLink>
            </div>
            <div className="grid gap-1 rounded-lg border border-border/70 p-2">
              {MOBILE_TRUST_LINKS.map((link) => (
                <MobileNavLink
                  key={link.slug}
                  href={trustPagePath(link.slug, language)}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-muted"
                >
                  <ShieldCheck className="size-4 text-primary" />
                  {language === "en" ? link.en : link.zh}
                </MobileNavLink>
              ))}
            </div>
            {categories.length > 0 ? (
              <div className="px-3 text-xs font-medium uppercase text-muted-foreground">
                {copy.articleCategories}
              </div>
            ) : null}
            {categories.map((category) => (
              <MobileNavLink
                key={category.id}
                href={categoryHref(category.slug, language)}
                prefetch={false}
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {category.name}
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
