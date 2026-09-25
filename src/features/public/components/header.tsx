import Link from "next/link";
import React from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import {
  headerCopy,
  type PublicLanguage,
} from "@/features/public/components/header-copy";
import { DesktopNav } from "@/features/public/components/desktop-nav";
import { MobileNavDrawer } from "@/features/public/components/mobile-nav-drawer";
import { LanguageSwitchLink } from "@/features/public/components/language-switch-link";
import { buildPublicNav } from "@/features/public/components/public-nav";
import { getNavigationCategories } from "@/features/shared/data/category";
import { Globe2 } from "lucide-react";

/**
 * 前台 Header：外壳 + 布局，导航本身在 `desktop-nav.tsx` / `mobile-nav-drawer.tsx`。
 *
 * 导航数据由 `buildPublicNav()` 统一构造后分发给两者 —— 它们只负责渲染差异，
 * 结构、文案与 URL 拼法都不再各写一份。
 *
 * 视口分工：`xl` 及以上显示桌面导航条；更窄时桌面导航整条隐藏，改由移动抽屉承载
 * （含语言切换），所以 Header 里那个语言切换按钮也带 `hidden xl:inline-flex`。
 */
function LanguageSwitchButton({
  language,
  label,
  useSwitchLink = true,
}: {
  language: PublicLanguage;
  label: string;
  /**
   * `Suspense` 的 fallback 用普通 `<Link>`（不依赖 `LanguageSwitchLink` 里的
   * 客户端判定），真身用它。两者外观一致，所以放在同一个组件里，避免把那段
   * Button + 图标 + 文案写两遍。
   */
  useSwitchLink?: boolean;
}) {
  const content = (
    <>
      <Globe2 className="size-4" />
      {label}
    </>
  );

  return (
    <Button
      asChild
      variant="outline"
      className="hidden shrink-0 rounded-full xl:inline-flex"
    >
      {useSwitchLink ? (
        <LanguageSwitchLink currentLanguage={language} prefetch>
          {content}
        </LanguageSwitchLink>
      ) : (
        <Link href={language === "en" ? "/" : "/en"} prefetch>
          {content}
        </Link>
      )}
    </Button>
  );
}

/**
 * 导出名保持 `HeaderComponent`：`tests/front-back-bug-regressions.test.ts` 用它断言
 * 「Header 是 async 服务端组件」。那条断言的真正意图是别把它变成客户端组件 ——
 * 一旦是客户端组件，语言切换里的动态读取就会把整页拖成动态渲染。
 *
 * 这里去掉的是原来那层多余包装（`HeaderComponent` 只是 `return HeaderContent(...)`），
 * 不是改名。
 */
export default async function HeaderComponent({
  language = "zh",
}: {
  language?: PublicLanguage;
}) {
  const copy = headerCopy[language];
  const { data: categories, error } = await getNavigationCategories();
  const nav = buildPublicNav({
    language,
    copy,
    categories: categories ?? [],
  });
  const categoriesFailed = Boolean(error);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <a href="#main-content" className="public-skip-link">
        {language === "en" ? "Skip to content" : "跳转到正文"}
      </a>
      <div className="public-container">
        <div className="flex min-h-20 items-center justify-between gap-4">
          <Link
            href={language === "en" ? "/en" : "/"}
            prefetch
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={copy.homeLabel}
          >
            <BrandLogo compact />
          </Link>

          <DesktopNav
            copy={copy}
            nav={nav}
            categoriesFailed={categoriesFailed}
          />

          <React.Suspense
            fallback={
              <LanguageSwitchButton
                language={language}
                label={copy.languageLabel}
                useSwitchLink={false}
              />
            }
          >
            <LanguageSwitchButton
              language={language}
              label={copy.languageLabel}
            />
          </React.Suspense>

          <MobileNavDrawer
            language={language}
            copy={copy}
            nav={nav}
            categoriesFailed={categoriesFailed}
          />
        </div>
      </div>
    </header>
  );
}
