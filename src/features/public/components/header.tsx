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
import { buildArticleNavigation } from "@/features/public/lib/article-navigation";
import { trustPagePath, type TrustPageSlug } from "@/features/public/lib/site-contact";
import { getNavigationCategories } from "@/features/shared/data/category";
import { cn } from "@fwqgo/core/utils";
import {
  BookOpen,
  Cpu,
  Globe2,
  Menu,
  Search,
  Server,
  ShieldCheck,
} from "lucide-react";

type PublicLanguage = "zh" | "en";

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
    homeLabel: "服务器GO Cloud Infra Research",
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
    articleCategories: "服务器分类",
  },
  en: {
    homeLabel: "fwqgo Cloud Infra Research",
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
    knowledgeHref: "/en/knowledge",
    knowledgeLabel: "Knowledge Base",
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

          <NavigationMenu className="hidden xl:block">
            <NavigationMenuList className="gap-0.5">
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <Link
                    href={`${language === "en" ? "/en" : ""}/fwq/page/1`}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      "min-h-11 rounded-lg bg-transparent",
                    )}
                  >
                    {language === "en" ? "Journal" : "最新文章"}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
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
              {safeCategories.length > 0 ? (
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="rounded-md">
                    {copy.articleCategories}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid max-h-[calc(100dvh-5rem)] w-[min(860px,calc(100vw-2rem))] gap-2 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
                      {safeCategories.map((category) => (
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
                <NavigationMenuTrigger className="min-h-11 rounded-lg bg-transparent">
                  {language === "en" ? "Tools" : "选购工具"}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[min(520px,calc(100vw-2rem))] gap-2 p-4 md:grid-cols-2">
                    <ListItem
                      href={`${language === "en" ? "/en" : ""}/tools/server-sizing`}
                      title={
                        language === "en" ? "Server sizing" : "服务器配置选择"
                      }
                    >
                      {language === "en"
                        ? "Match CPU, memory and storage to your workload."
                        : "结合业务规模，梳理 CPU、内存和存储需求。"}
                    </ListItem>
                    <ListItem
                      href={`${language === "en" ? "/en" : ""}/tools/network-lines`}
                      title={
                        language === "en" ? "Network routes" : "网络线路选择"
                      }
                    >
                      {language === "en"
                        ? "Understand routes and carrier compatibility."
                        : "根据用户地区和运营商，比较网络线路。"}
                    </ListItem>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
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
                {safeCategories.length > 0 ? (
                  <div className="px-3 text-xs font-medium uppercase text-muted-foreground">
                    {copy.articleCategories}
                  </div>
                ) : null}
                {safeCategories.map((category) => (
                  <MobileNavLink
                    key={category.id}
                    href={categoryHref(category.slug, language)}
                    prefetch={false}
                    className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {category.name}
                  </MobileNavLink>
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

async function HeaderComponent({
  language = "zh",
}: {
  language?: PublicLanguage;
}) {
  return HeaderContent({ language });
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
          prefetch={false}
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
