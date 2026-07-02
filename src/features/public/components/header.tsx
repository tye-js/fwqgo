import Link from "next/link";
import React from "react";

import { getCategories } from "@/features/shared/data/category";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@fwqgo/core/utils";
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
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Server } from "lucide-react";

const HeaderComponent = async () => {
  const { data: categories, error } = await getCategories();
  const safeCategories = categories ?? [];

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="container mx-auto px-4">
        <div className="flex min-h-[72px] items-center justify-between gap-6">
          <Link
            href="/"
            prefetch
            className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="返回服务器go首页"
          >
            <BrandLogo className="min-w-0" />
          </Link>

          <NavigationMenu className="hidden lg:block">
            <NavigationMenuList className="rounded-full border border-border/70 bg-white/90 p-1 shadow-sm backdrop-blur">
              <NavigationMenuItem>
                <NavigationMenuTrigger className="rounded-full">
                  服务器比价
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[420px] gap-3 p-4 md:w-[520px] md:grid-cols-2">
                    <ListItem title="全部套餐" href="/servers">
                      按价格、地区、线路和状态集中筛选服务器套餐。
                    </ListItem>
                    <ListItem title="香港服务器" href="/servers/hong-kong">
                      香港 VPS、云服务器、CN2、CMI 和低延迟线路。
                    </ListItem>
                    <ListItem title="美国服务器" href="/servers/united-states">
                      美国 VPS、独立服务器、大带宽和外贸建站套餐。
                    </ListItem>
                    <ListItem title="便宜 VPS" href="/servers/cheap-vps">
                      低价 VPS、月付优惠和适合测试的轻量套餐。
                    </ListItem>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {safeCategories.map((category) =>
                category.children.length > 0 ? (
                  <NavigationMenuItem key={category.id}>
                    <NavigationMenuTrigger className="rounded-full">
                      {category.name}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[420px] gap-3 p-4 md:w-[520px] md:grid-cols-2 lg:w-[620px]">
                        {category.children.map((item) => (
                          <ListItem
                            key={item.id}
                            title={item.name}
                            href={`/fwq/${item.slug}/page/1`}
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
                        href={`/fwq/${category.slug}/page/1`}
                        prefetch
                        className={cn(
                          navigationMenuTriggerStyle(),
                          "rounded-full bg-transparent",
                        )}
                      >
                        {category.name}
                      </Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ),
              )}
              {error ? (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <Link
                      href="/servers"
                      prefetch
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "rounded-full bg-transparent text-muted-foreground",
                      )}
                    >
                      分类暂不可用
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ) : null}
            </NavigationMenuList>
          </NavigationMenu>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="打开导航菜单"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86vw] max-w-sm">
              <SheetHeader>
                <SheetTitle>导航</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 grid gap-4">
                <div className="grid gap-1 rounded-lg border border-border/70 p-2">
                  <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    <Server className="size-3.5" />
                    套餐专题
                  </div>
                  <Link
                    href="/servers"
                    prefetch
                    className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    服务器比价
                  </Link>
                  {(
                    [
                    ["香港服务器", "/servers/hong-kong"],
                    ["美国服务器", "/servers/united-states"],
                    ["便宜 VPS", "/servers/cheap-vps"],
                    ] satisfies Array<[string, string]>
                  ).map(([label, href]) => (
                    <Link
                      key={href}
                      href={href}
                      prefetch
                      className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
                {safeCategories.length > 0 ? (
                  <div className="px-3 text-xs font-medium uppercase text-muted-foreground">
                    文章分类
                  </div>
                ) : null}
                {safeCategories.map((category) => (
                  <div key={category.id} className="grid gap-2">
                    <Link
                      href={`/fwq/${category.slug}/page/1`}
                      prefetch
                      className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {category.name}
                    </Link>
                    {category.children.length > 0 ? (
                      <div className="grid gap-1 border-l border-border pl-3">
                        {category.children.map((item) => (
                          <Link
                            key={item.id}
                            href={`/fwq/${item.slug}/page/1`}
                            prefetch
                            className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {error ? (
                  <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm leading-6 text-muted-foreground">
                    分类暂时加载失败，可以先进入服务器比价或稍后刷新页面。
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
            "block select-none space-y-2 rounded-md border border-transparent p-4 leading-none no-underline outline-none transition-colors hover:border-primary/20 hover:bg-primary/5 focus:border-primary/20 focus:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring",
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
