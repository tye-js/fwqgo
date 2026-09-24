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
import { buildArticleNavigation } from "@/features/public/lib/article-navigation";
import { getNavigationCategories } from "@/features/shared/data/category";
import { Globe2 } from "lucide-react";

const HeaderContent = async ({
  language = "zh",
}: {
  language?: PublicLanguage;
}) => {
  const copy = headerCopy[language];
  const { data: categories, error } = await getNavigationCategories();
  const safeCategories = buildArticleNavigation(categories ?? [], language);

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
            language={language}
            copy={copy}
            categories={safeCategories}
            categoriesFailed={Boolean(error)}
          />

          <React.Suspense
            fallback={
              <Button
                asChild
                variant="outline"
                className="hidden shrink-0 rounded-full xl:inline-flex"
              >
                <Link href={language === "en" ? "/" : "/en"} prefetch>
                  <Globe2 className="size-4" />
                  {copy.languageLabel}
                </Link>
              </Button>
            }
          >
            <Button
              asChild
              variant="outline"
              className="hidden shrink-0 rounded-full xl:inline-flex"
            >
              <LanguageSwitchLink currentLanguage={language} prefetch>
                <Globe2 className="size-4" />
                {copy.languageLabel}
              </LanguageSwitchLink>
            </Button>
          </React.Suspense>

          <MobileNavDrawer
            language={language}
            copy={copy}
            categories={safeCategories}
            categoriesFailed={Boolean(error)}
          />
        </div>
      </div>
    </header>
  );
};

async function HeaderComponent({
  language = "zh",
}: {
  language?: PublicLanguage;
}) {
  return HeaderContent({ language });
}

export default HeaderComponent;
