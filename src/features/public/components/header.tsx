import Link from "next/link";
import React from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LanguageSwitchLink } from "@/features/public/components/language-switch-link";
import { getCategories } from "@/features/shared/data/category";
import { cn } from "@fwqgo/core/utils";
import { BookOpen, Globe2, Menu, Search, Server } from "lucide-react";

type PublicLanguage = "zh" | "en";

const headerCopy: Record<
  PublicLanguage,
  {
    homeLabel: string;
    languageLabel: string;
    dealsTitle: string;
    allOffers: string;
    allOffersDescription: string;
    hongKong: string;
    hongKongDescription: string;
    unitedStates: string;
    unitedStatesDescription: string;
    cheapVps: string;
    cheapVpsDescription: string;
    categoriesTitle: string;
    searchHref: string;
    searchLabel: string;
    knowledgeHref?: string;
    knowledgeLabel?: string;
    errorLabel: string;
    errorDescription: string;
    navigationTitle: string;
    articleCategories: string;
  }
> = {
  zh: {
    homeLabel: "返回服务器go首页",
    languageLabel: "English",
    dealsTitle: "服务器比价",
    allOffers: "全部套餐",
    allOffersDescription: "按价格、地区、线路和状态集中筛选服务器套餐。",
    hongKong: "香港服务器",
    hongKongDescription: "香港 VPS、云服务器、CN2、CMI 和低延迟线路。",
    unitedStates: "美国服务器",
    unitedStatesDescription: "美国 VPS、独立服务器、大带宽和外贸建站套餐。",
    cheapVps: "便宜 VPS",
    cheapVpsDescription: "低价 VPS、月付优惠和适合测试的轻量套餐。",
    categoriesTitle: "套餐专题",
    searchHref: "/search",
    searchLabel: "搜索",
    knowledgeHref: "/knowledge",
    knowledgeLabel: "知识库",
    errorLabel: "分类暂不可用",
    errorDescription: "分类暂时加载失败，可以先进入服务器比价或稍后刷新页面。",
    navigationTitle: "导航",
    articleCategories: "文章分类",
  },
  en: {
    homeLabel: "Back to fwqgo English homepage",
    languageLabel: "中文",
    dealsTitle: "Server deals",
    allOffers: "All offers",
    allOffersDescription:
      "Filter server offers by price, region, line, and status.",
    hongKong: "Hong Kong servers",
    hongKongDescription:
      "Hong Kong VPS, cloud servers, CN2, CMI, and low-latency lines.",
    unitedStates: "US servers",
    unitedStatesDescription:
      "US VPS, dedicated servers, bandwidth deals, and hosting offers.",
    cheapVps: "Cheap VPS",
    cheapVpsDescription:
      "Low-cost VPS plans, monthly deals, and lightweight test servers.",
    categoriesTitle: "Offer topics",
    searchHref: "/search?lang=en",
    searchLabel: "Search",
    errorLabel: "Categories unavailable",
    errorDescription:
      "Categories failed to load. You can open server deals or refresh later.",
    navigationTitle: "Navigation",
    articleCategories: "Article categories",
  },
};

function categoryHref(slug: string, language: PublicLanguage) {
  return `${language === "en" ? "/en" : ""}/fwq/${encodeURIComponent(slug)}/page/1`;
}

function nonEmptyTrim(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function HeaderFallback({ language }: { language: PublicLanguage }) {
  const copy = headerCopy[language];

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex min-h-16 items-center justify-between gap-5">
          <Link
            href={language === "en" ? "/en" : "/"}
            prefetch
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={copy.homeLabel}
          >
            <BrandLogo compact />
          </Link>
          <div className="hidden h-10 w-80 rounded-md border border-border/70 bg-muted/30 lg:block" />
          <React.Suspense
            fallback={
              <Button
                asChild
                variant="outline"
                className="hidden shrink-0 lg:inline-flex"
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
              className="hidden shrink-0 lg:inline-flex"
            >
              <LanguageSwitchLink currentLanguage={language} prefetch>
                <Globe2 className="size-4" />
                {copy.languageLabel}
              </LanguageSwitchLink>
            </Button>
          </React.Suspense>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={copy.navigationTitle}
            disabled
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

const HeaderContent = async ({
  language = "zh",
}: {
  language?: PublicLanguage;
}) => {
  const copy = headerCopy[language];
  const { data: categories, error } = await getCategories();
  const safeCategories = (categories ?? []).map((category) => {
    if (language === "zh") {
      return category;
    }

    return {
      ...category,
      name: nonEmptyTrim(category.enName) ?? category.name,
      slug: nonEmptyTrim(category.enSlug) ?? category.slug,
      description: nonEmptyTrim(category.enDescription) ?? category.description,
      children: category.children.map((child) => ({
        ...child,
        name: nonEmptyTrim(child.enName) ?? child.name,
        slug: nonEmptyTrim(child.enSlug) ?? child.slug,
        description: nonEmptyTrim(child.enDescription) ?? child.description,
      })),
    };
  });

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex min-h-16 items-center justify-between gap-5">
          <Link
            href={language === "en" ? "/en" : "/"}
            prefetch
            className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={copy.homeLabel}
          >
            <BrandLogo compact />
          </Link>

          <NavigationMenu className="hidden lg:block">
            <NavigationMenuList className="gap-0.5">
              <NavigationMenuItem>
                <NavigationMenuTrigger className="rounded-md">
                  {copy.dealsTitle}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[420px] gap-3 p-4 md:w-[520px] md:grid-cols-2">
                    <ListItem title={copy.allOffers} href="/servers">
                      {copy.allOffersDescription}
                    </ListItem>
                    <ListItem title={copy.hongKong} href="/servers/hong-kong">
                      {copy.hongKongDescription}
                    </ListItem>
                    <ListItem
                      title={copy.unitedStates}
                      href="/servers/united-states"
                    >
                      {copy.unitedStatesDescription}
                    </ListItem>
                    <ListItem title={copy.cheapVps} href="/servers/cheap-vps">
                      {copy.cheapVpsDescription}
                    </ListItem>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {safeCategories.slice(0, 4).map((category) =>
                category.children.length > 0 ? (
                  <NavigationMenuItem key={category.id}>
                    <NavigationMenuTrigger className="rounded-md">
                      {category.name}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[420px] gap-3 p-4 md:w-[520px] md:grid-cols-2 lg:w-[620px]">
                        {category.children.map((item) => (
                          <ListItem
                            key={item.id}
                            title={item.name}
                            href={categoryHref(item.slug, language)}
                          >
                            {item.description}
                          </ListItem>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                ) : (
                  <NavigationMenuItem key={category.id}>
                    <NavigationMenuLink asChild>
                      <Link
                        href={categoryHref(category.slug, language)}
                        prefetch
                        className={cn(
                          navigationMenuTriggerStyle(),
                          "rounded-md bg-transparent",
                        )}
                      >
                        {category.name}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ),
              )}
              {safeCategories.length > 4 ? (
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="rounded-md">
                    {copy.articleCategories}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[420px] gap-3 p-4 md:w-[520px] md:grid-cols-2">
                      {safeCategories.slice(4).map((category) => (
                        <ListItem
                          key={category.id}
                          title={category.name}
                          href={categoryHref(category.slug, language)}
                        >
                          {category.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ) : null}
              {error ? (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href="/servers"
                      prefetch
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "rounded-md bg-transparent text-muted-foreground",
                      )}
                    >
                      {copy.errorLabel}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ) : null}
              {copy.knowledgeHref && copy.knowledgeLabel ? (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href={copy.knowledgeHref}
                      prefetch
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "rounded-md bg-transparent",
                      )}
                    >
                      {copy.knowledgeLabel}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ) : null}
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    href={copy.searchHref}
                    prefetch
                    className={cn(
                      navigationMenuTriggerStyle(),
                      "rounded-md bg-transparent",
                    )}
                  >
                    {copy.searchLabel}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <Button
            asChild
            variant="outline"
            className="hidden shrink-0 lg:inline-flex"
          >
            <LanguageSwitchLink currentLanguage={language} prefetch>
              <Globe2 className="size-4" />
              {copy.languageLabel}
            </LanguageSwitchLink>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="lg:hidden"
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
                {safeCategories.length > 0 ? (
                  <div className="px-3 text-xs font-medium uppercase text-muted-foreground">
                    {copy.articleCategories}
                  </div>
                ) : null}
                {safeCategories.map((category) => (
                  <div key={category.id} className="grid gap-2">
                    <MobileNavLink
                      href={categoryHref(category.slug, language)}
                      prefetch
                      className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {category.name}
                    </MobileNavLink>
                    {category.children.length > 0 ? (
                      <div className="grid gap-1 border-l border-border pl-3">
                        {category.children.map((item) => (
                          <MobileNavLink
                            key={item.id}
                            href={categoryHref(item.slug, language)}
                            prefetch
                            className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {item.name}
                          </MobileNavLink>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {error ? (
                  <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm leading-6 text-muted-foreground">
                    {copy.errorDescription}
                  </div>
                ) : null}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

function HeaderComponent({ language = "zh" }: { language?: PublicLanguage }) {
  return (
    <React.Suspense fallback={<HeaderFallback language={language} />}>
      <HeaderContent language={language} />
    </React.Suspense>
  );
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

const ListItem = React.forwardRef<
  React.ComponentRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, href, ...props }, ref) => {
  if (!href) return null;

  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          prefetch
          ref={ref}
          className={cn(
            "block select-none space-y-2 rounded-md border border-transparent p-3.5 leading-none no-underline outline-none transition-colors hover:border-border hover:bg-muted/60 focus:border-border focus:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export default HeaderComponent;
